import { cities, persons, states } from '@erp-360/mod-persons';
import {
  emptyToNull,
  isValidCnpj,
  normalizeEmail,
  normalizePostalCode,
  normalizeTaxId,
  onlyDigits,
  toTitleCasePtBr,
} from '@erp-360/shared';
import { and, eq, sql } from 'drizzle-orm';

import { db } from '../db/index.ts';

export class CnpjLookupError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface CnpjLookupAddress {
  postalCode: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  cityId: string | null;
  cityName: string | null;
  stateAbbreviation: string | null;
}

export interface CnpjLookupResult {
  taxId: string;
  name: string;
  birthDate: string | null;
  nfeEmail: string | null;
  stateRegistration: string | null;
  address: CnpjLookupAddress | null;
  existingPersonId: string | null;
}

const CNPJ_SOURCES = [
  (cnpj: string) => `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`,
  (cnpj: string) => `https://www.receitaws.com.br/v1/cnpj/${cnpj}`,
];
const cache = new Map<string, { at: number; data: Omit<CnpjLookupResult, 'existingPersonId'> }>();
const CACHE_MS = 60 * 60 * 1000;

function clip(value: string | null | undefined, max: number) {
  const compact = value?.trim() ? toTitleCasePtBr(value) : '';
  if (!compact) return null;
  return compact.slice(0, max);
}

function stripTrailingNumber(streetName: string, number: string) {
  const escaped = number.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return streetName.replace(new RegExp(`\\s+${escaped}$`, 'i'), '').trim();
}

function readString(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}

function normalizeStateRegistration(value: string) {
  const compact = value.trim();
  if (!compact) return null;
  if (/^isento$/i.test(compact)) return 'ISENTO';
  const digits = onlyDigits(compact);
  if (!digits) return null;
  return digits.slice(0, 20);
}

function stateAbbreviationOf(row: Record<string, unknown>) {
  const state = row.estado;
  if (state && typeof state === 'object') {
    return readString(state as Record<string, unknown>, 'sigla').toUpperCase();
  }
  return readString(row, 'uf', 'estado').toUpperCase().slice(0, 2);
}

function pickStateRegistration(row: Record<string, unknown>, uf: string) {
  const direct = normalizeStateRegistration(readString(row, 'inscricao_estadual', 'ie'));
  if (direct) return direct;

  const nested = row.estabelecimento;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const fromOffice = pickStateRegistration(nested as Record<string, unknown>, uf);
    if (fromOffice) return fromOffice;
  }

  if (!Array.isArray(row.inscricoes_estaduais)) return null;
  const wanted = uf.toUpperCase();
  if (!wanted) return null;

  const activeInState = row.inscricoes_estaduais.find((item) => {
    if (!item || typeof item !== 'object') return false;
    const entry = item as Record<string, unknown>;
    return entry.ativo === true && stateAbbreviationOf(entry) === wanted;
  }) as Record<string, unknown> | undefined;
  if (!activeInState) return null;
  return normalizeStateRegistration(readString(activeInState, 'inscricao_estadual', 'numero'));
}

async function lookupStateRegistration(cnpj: string, uf: string) {
  try {
    const { status, body } = await fetchJson(`https://publica.cnpj.ws/cnpj/${cnpj}`);
    if (status < 200 || status >= 300) return null;
    return pickStateRegistration(body, uf);
  } catch {
    return null;
  }
}

function ibgeCode(row: Record<string, unknown>) {
  const raw = readString(row, 'codigo_municipio_ibge');
  const digits = onlyDigits(raw);
  if (digits.length === 7) return digits;
  return '';
}

function parseActivityDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const br = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return '';
}

function hasCompanyName(row: Record<string, unknown>) {
  return Boolean(readString(row, 'razao_social', 'nome', 'nome_fantasia'));
}

function isReceitaWsNotFound(row: Record<string, unknown>) {
  if (String(row.status ?? '').toUpperCase() !== 'ERROR') return false;
  const message = readString(row, 'message', 'mensagem').toLowerCase();
  return !message.includes('many requests') && !message.includes('try again');
}

async function fetchJson(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'erp-360/1.0 (cnpj-lookup)',
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

async function fetchPublicCnpj(cnpj: string) {
  let sawTransient = false;
  let sawNotFound = false;

  for (const toUrl of CNPJ_SOURCES) {
    try {
      const { status, body } = await fetchJson(toUrl(cnpj));
      if (status === 404 || isReceitaWsNotFound(body)) {
        sawNotFound = true;
        continue;
      }
      if (status >= 200 && status < 300 && hasCompanyName(body)) {
        return body;
      }
      sawTransient = true;
    } catch {
      sawTransient = true;
    }
  }

  if (sawNotFound && !sawTransient) {
    throw new CnpjLookupError(404, 'CNPJ não encontrado na base pública.');
  }
  throw new CnpjLookupError(502, 'Não foi possível consultar o CNPJ agora. Tente de novo.');
}

async function resolveCity(params: { ibge: string; cityName: string; uf: string }) {
  if (params.ibge) {
    const [byCode] = await db
      .select({
        id: cities.id,
        name: cities.name,
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

export async function lookupCnpj(params: { tenantId: string; cnpj: string }): Promise<CnpjLookupResult> {
  const taxId = normalizeTaxId('company', params.cnpj);
  if (!isValidCnpj(taxId)) {
    throw new CnpjLookupError(400, 'CNPJ inválido.');
  }

  const cached = cache.get(taxId);
  let mapped = cached && Date.now() - cached.at < CACHE_MS ? cached.data : null;

  if (!mapped) {
    const raw = await fetchPublicCnpj(taxId);
    const name = clip(readString(raw, 'razao_social', 'nome', 'nome_fantasia'), 120);
    if (!name) {
      throw new CnpjLookupError(404, 'CNPJ encontrado, mas sem razão social.');
    }

    const birthDate = parseActivityDate(readString(raw, 'data_inicio_atividade', 'abertura')) || null;
    const nfeEmail = emptyToNull(normalizeEmail(readString(raw, 'email')));
    const cityName = clip(readString(raw, 'municipio'), 60);
    const uf = readString(raw, 'uf').toUpperCase().slice(0, 2);
    const city = await resolveCity({
      ibge: ibgeCode(raw),
      cityName: cityName ?? '',
      uf,
    });

    const streetType = readString(raw, 'descricao_tipo_de_logradouro');
    const streetName = readString(raw, 'logradouro');
    const number = emptyToNull(readString(raw, 'numero').slice(0, 60));
    const streetBase = number ? stripTrailingNumber(streetName, number) : streetName;
    const street = clip(
      streetBase.toLowerCase().startsWith(streetType.toLowerCase())
        ? streetBase
        : [streetType, streetBase].filter(Boolean).join(' '),
      60,
    );
    const neighborhood = clip(readString(raw, 'bairro'), 60);
    const complement = clip(readString(raw, 'complemento'), 60);
    const postalCode = emptyToNull(normalizePostalCode(readString(raw, 'cep')));
    const stateRegistration =
      pickStateRegistration(raw, uf) ?? (await lookupStateRegistration(taxId, uf));

    const hasAddress = Boolean(street || neighborhood || postalCode || city);
    mapped = {
      taxId,
      name,
      birthDate: birthDate && /^\d{4}-\d{2}-\d{2}$/.test(birthDate) ? birthDate : null,
      nfeEmail: nfeEmail && nfeEmail.includes('@') ? nfeEmail.slice(0, 60) : null,
      stateRegistration,
      address: hasAddress
        ? {
            postalCode,
            street,
            number,
            complement,
            neighborhood,
            cityId: city?.id ?? null,
            cityName: city?.name ?? cityName,
            stateAbbreviation: city?.stateAbbreviation ?? (uf || null),
          }
        : null,
    };
    cache.set(taxId, { at: Date.now(), data: mapped });
  }

  const [existing] = await db
    .select({ id: persons.id })
    .from(persons)
    .where(and(eq(persons.tenantId, params.tenantId), eq(persons.taxId, taxId)))
    .limit(1);

  return { ...mapped, existingPersonId: existing?.id ?? null };
}
