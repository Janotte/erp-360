import { cities, states } from '@erp-360/mod-persons';
import { onlyDigits, toTitleCasePtBr } from '@erp-360/shared';
import { and, eq, sql } from 'drizzle-orm';

import { db } from '../db/index.ts';

export class CepLookupError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface CepLookupResult {
  postalCode: string;
  street: string | null;
  neighborhood: string | null;
  stateId: string | null;
  stateAbbreviation: string | null;
  cityId: string | null;
  cityName: string | null;
}

interface PublicCep {
  street: string;
  neighborhood: string;
  cityName: string;
  uf: string;
  ibge: string;
}

const CEP_SOURCES = [
  {
    kind: 'viacep' as const,
    toUrl: (cep: string) => `https://viacep.com.br/ws/${cep}/json/`,
  },
  {
    kind: 'brasilapi' as const,
    toUrl: (cep: string) => `https://brasilapi.com.br/api/cep/v2/${cep}`,
  },
];

const cache = new Map<string, { at: number; data: CepLookupResult }>();
const CACHE_MS = 60 * 60 * 1000;

function clip(value: string | null | undefined, max: number) {
  const compact = value?.trim() ? toTitleCasePtBr(value) : '';
  if (!compact) return null;
  return compact.slice(0, max);
}

function readString(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}

function ibgeCode(value: string) {
  const digits = onlyDigits(value);
  return digits.length === 7 ? digits : '';
}

async function fetchJson(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'erp-360/1.0 (cep-lookup)',
      },
    });
    const text = await response.text();
    let body: Record<string, unknown> = {};
    try {
      body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      body = {};
    }
    return { status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
}

function isViaCepNotFound(body: Record<string, unknown>) {
  return body.erro === true || body.erro === 'true';
}

function parsePublicCep(kind: 'viacep' | 'brasilapi', body: Record<string, unknown>): PublicCep | null {
  const cityName =
    kind === 'viacep' ? readString(body, 'localidade') : readString(body, 'city');
  const uf = (kind === 'viacep' ? readString(body, 'uf') : readString(body, 'state'))
    .toUpperCase()
    .slice(0, 2);
  if (!cityName && !uf) return null;

  return {
    street: kind === 'viacep' ? readString(body, 'logradouro') : readString(body, 'street'),
    neighborhood:
      kind === 'viacep' ? readString(body, 'bairro') : readString(body, 'neighborhood'),
    cityName,
    uf,
    ibge: kind === 'viacep' ? ibgeCode(readString(body, 'ibge')) : '',
  };
}

async function fetchPublicCep(cep: string) {
  let sawNotFound = false;
  let sawTransient = false;

  for (const source of CEP_SOURCES) {
    try {
      const { status, body } = await fetchJson(source.toUrl(cep));
      if (status === 404 || (source.kind === 'viacep' && isViaCepNotFound(body))) {
        sawNotFound = true;
        continue;
      }
      if (status >= 200 && status < 300) {
        const parsed = parsePublicCep(source.kind, body);
        if (parsed) return parsed;
      }
      sawTransient = true;
    } catch {
      sawTransient = true;
    }
  }

  if (sawNotFound && !sawTransient) {
    throw new CepLookupError(404, 'CEP não encontrado.');
  }
  throw new CepLookupError(502, 'Não foi possível consultar o CEP agora. Tente de novo.');
}

async function resolveCity(params: { ibge: string; cityName: string; uf: string }) {
  if (params.ibge) {
    const [byCode] = await db
      .select({
        id: cities.id,
        name: cities.name,
        stateId: states.id,
        stateAbbreviation: states.abbreviation,
      })
      .from(cities)
      .innerJoin(states, eq(cities.stateId, states.id))
      .where(eq(cities.code, params.ibge))
      .limit(1);
    if (byCode) return byCode;
  }

  if (!params.uf || !params.cityName) return null;

  const [byName] = await db
    .select({
      id: cities.id,
      name: cities.name,
      stateId: states.id,
      stateAbbreviation: states.abbreviation,
    })
    .from(cities)
    .innerJoin(states, eq(cities.stateId, states.id))
    .where(
      and(
        eq(states.abbreviation, params.uf.toUpperCase()),
        sql`unaccent(${cities.name}) ilike unaccent(${params.cityName})`,
      ),
    )
    .limit(1);

  return byName ?? null;
}

async function resolveState(uf: string) {
  if (!uf) return null;
  const [state] = await db
    .select({
      id: states.id,
      abbreviation: states.abbreviation,
    })
    .from(states)
    .where(eq(states.abbreviation, uf.toUpperCase()))
    .limit(1);
  return state ?? null;
}

export async function lookupCep(cep: string): Promise<CepLookupResult> {
  const postalCode = onlyDigits(cep);
  if (postalCode.length !== 8) {
    throw new CepLookupError(400, 'CEP inválido.');
  }

  const cached = cache.get(postalCode);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.data;

  const raw = await fetchPublicCep(postalCode);
  const city = await resolveCity({
    ibge: raw.ibge,
    cityName: raw.cityName,
    uf: raw.uf,
  });
  const state = city ? null : await resolveState(raw.uf);

  const mapped: CepLookupResult = {
    postalCode,
    street: clip(raw.street, 60),
    neighborhood: clip(raw.neighborhood, 60),
    stateId: city?.stateId ?? state?.id ?? null,
    stateAbbreviation: city?.stateAbbreviation ?? state?.abbreviation ?? null,
    cityId: city?.id ?? null,
    cityName: city?.name ?? null,
  };
  cache.set(postalCode, { at: Date.now(), data: mapped });
  return mapped;
}
