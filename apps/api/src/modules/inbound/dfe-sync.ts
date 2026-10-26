import '../../types/fastify.ts';

import { tenantCertificates, tenants } from '@erp-360/mod-core';
import { dfeDocuments } from '@erp-360/mod-inbound';
import { cities, states } from '@erp-360/mod-persons';
import type { CertificateEnvironment } from '@erp-360/shared';
import { and, desc, eq, like, or } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { env } from '../../config/index.ts';
import { db } from '../../db/index.ts';
import { decryptPassword } from '../certificates/cipher.ts';
import { readPfxMaterial } from '../certificates/pfx.ts';
import { postCertificate } from '../certificates/probe.ts';
import { connectionTimeoutMs, stateCode } from '../certificates/sefaz.ts';
import {
  describeDfeDocument,
  type DfeDistribution,
  dfeDistributionRequest,
  type DfeQuery,
  parseDfeDistribution,
} from './dfe.ts';
import { getOrCreateDfeCursor, saveDfeDistribution } from './dfe-store.ts';
import { InboundError } from './errors.ts';
import { getOrCreateNfeSettings } from './nfe-settings.ts';

export const dfeCooldownMs = 60 * 60 * 1000;
export const dfeMaxPages = 20;

export type DfeSyncMode = 'sync' | 'lookup';

export interface DfeCursorClock {
  ultNsu: string;
  maxNsu: string;
  lastStatus: string | null;
  queriedAt: Date | null;
}

export type DfeSyncQuery = { kind: 'cursor' } | Exclude<DfeQuery, { kind: 'lastNsu' }>;

export interface DfeSyncResult {
  environment: CertificateEnvironment;
  ultNsu: string;
  maxNsu: string;
  lastStatus: string | null;
  received: number;
  blockedUntil: string | null;
}

type DistributionFetch = (request: {
  endpoint: string;
  body: string;
  headers: Record<string, string>;
}) => Promise<string>;

const environmentLabel: Record<CertificateEnvironment, string> = {
  homologation: 'homologação',
  production: 'produção',
};

export function dfeBlockedUntil(cursor: DfeCursorClock, now: Date, mode: DfeSyncMode) {
  if (!cursor.queriedAt) return null;
  const until = new Date(cursor.queriedAt.getTime() + dfeCooldownMs);
  if (now.getTime() >= until.getTime()) return null;
  if (cursor.lastStatus === '656') return until;
  if (mode === 'sync' && cursor.ultNsu >= cursor.maxNsu) return until;
  return null;
}

/** Consulta o último NSU e segue enquanto a SEFAZ ainda tiver lote. */
export async function collectDfePages(input: {
  cUF: string;
  cnpj: string;
  environment: CertificateEnvironment;
  ultNsu: string;
  fetch: DistributionFetch;
  maxPages?: number;
  onPage?: (page: DfeDistribution) => Promise<void>;
}) {
  const pages: DfeDistribution[] = [];
  let ultNsu = input.ultNsu;
  const maxPages = input.maxPages ?? dfeMaxPages;
  let stopped: 'caught-up' | 'blocked' | 'stalled' | 'limit' = 'limit';
  for (let page = 0; page < maxPages; page += 1) {
    const request = dfeDistributionRequest({
      cUF: input.cUF,
      cnpj: input.cnpj,
      environment: input.environment,
      query: { kind: 'lastNsu', ultNsu },
    });
    const body = await input.fetch(request);
    const parsed = parseDfeDistribution(body);
    pages.push(parsed);
    if (input.onPage) await input.onPage(parsed);
    if (parsed.cStat === '656') {
      stopped = 'blocked';
      break;
    }
    const next = parsed.ultNsu;
    if (!next || next <= ultNsu) {
      stopped = 'stalled';
      break;
    }
    ultNsu = next;
    if (!parsed.maxNsu || ultNsu >= parsed.maxNsu) {
      stopped = 'caught-up';
      break;
    }
  }
  return { pages, stopped };
}

export async function runDfeSync(input: {
  tenantId: string;
  environment: CertificateEnvironment;
  cnpj: string;
  cUF: string;
  query: DfeSyncQuery;
  now?: Date;
  fetch: DistributionFetch;
}): Promise<DfeSyncResult> {
  const now = input.now ?? new Date();
  const cursor = await getOrCreateDfeCursor(input.tenantId, input.environment);
  const mode: DfeSyncMode = input.query.kind === 'cursor' ? 'sync' : 'lookup';
  const blockedUntil = dfeBlockedUntil(cursor, now, mode);
  if (blockedUntil) {
    return {
      environment: input.environment,
      ultNsu: cursor.ultNsu,
      maxNsu: cursor.maxNsu,
      lastStatus: cursor.lastStatus,
      received: 0,
      blockedUntil: blockedUntil.toISOString(),
    };
  }

  let received = 0;
  const savePage = async (page: DfeDistribution) => {
    await saveDfeDistribution(input.tenantId, input.environment, page, now);
    received += page.documents.length;
  };

  if (input.query.kind === 'cursor') {
    await collectDfePages({
      cUF: input.cUF,
      cnpj: input.cnpj,
      environment: input.environment,
      ultNsu: cursor.ultNsu,
      fetch: input.fetch,
      onPage: savePage,
    });
  } else {
    const request = dfeDistributionRequest({
      cUF: input.cUF,
      cnpj: input.cnpj,
      environment: input.environment,
      query: input.query,
    });
    const page = parseDfeDistribution(await input.fetch(request));
    await savePage(page);
  }

  const saved = await getOrCreateDfeCursor(input.tenantId, input.environment);
  return {
    environment: input.environment,
    ultNsu: saved.ultNsu,
    maxNsu: saved.maxNsu,
    lastStatus: saved.lastStatus,
    received,
    blockedUntil: null,
  };
}

export async function emitterStateCode(tenantId: string) {
  const [row] = await db
    .select({ abbreviation: states.abbreviation, cnpj: tenants.cnpj })
    .from(tenants)
    .leftJoin(cities, eq(tenants.cityId, cities.id))
    .leftJoin(states, eq(cities.stateId, states.id))
    .where(eq(tenants.id, tenantId))
    .limit(1);
  return {
    cnpj: row?.cnpj ?? '',
    cUF: stateCode(row?.abbreviation),
  };
}

export async function certificateMaterial(
  tenantId: string,
  environment: CertificateEnvironment,
) {
  const [certificate] = await db
    .select({
      pfx: tenantCertificates.pfx,
      passwordCipher: tenantCertificates.passwordCipher,
      taxId: tenantCertificates.taxId,
      validFrom: tenantCertificates.validFrom,
      validUntil: tenantCertificates.validUntil,
    })
    .from(tenantCertificates)
    .where(
      and(
        eq(tenantCertificates.tenantId, tenantId),
        eq(tenantCertificates.environment, environment),
        eq(tenantCertificates.isActive, true),
      ),
    )
    .limit(1);
  if (!certificate) {
    throw new InboundError(
      400,
      `Importe o certificado A1 do ambiente de ${environmentLabel[environment]} da NF-e.`,
    );
  }
  const now = Date.now();
  if (certificate.validFrom.getTime() > now || certificate.validUntil.getTime() < now) {
    throw new InboundError(400, 'O certificado A1 deste ambiente está fora da validade.');
  }
  try {
    const password = decryptPassword(certificate.passwordCipher, env.auth.jwtSecret);
    const material = readPfxMaterial(certificate.pfx, password);
    if (!material.certificatePem || !material.privateKeyPem) {
      throw new Error('sem chave');
    }
    return { ...material, taxId: certificate.taxId };
  } catch (error) {
    if (error instanceof InboundError) throw error;
    throw new InboundError(400, 'Não foi possível ler o certificado A1.');
  }
}

export async function syncTenantDfe(tenantId: string, query: DfeSyncQuery) {
  const settings = await getOrCreateNfeSettings(tenantId);
  const material = await certificateMaterial(tenantId, settings.environment);
  const emitter = await emitterStateCode(tenantId);
  if (!emitter.cUF) {
    throw new InboundError(400, 'Cadastre a UF do emitente para consultar o DF-e.');
  }
  if (material.taxId !== emitter.cnpj) {
    throw new InboundError(400, 'O certificado não é do CNPJ desta empresa.');
  }
  return runDfeSync({
    tenantId,
    environment: settings.environment,
    cnpj: emitter.cnpj,
    cUF: emitter.cUF,
    query,
    fetch: async (request) => {
      let response: { statusCode: number | null; body: string };
      try {
        response = await postCertificate({
          endpoint: request.endpoint,
          body: request.body,
          headers: request.headers,
          timeoutMs: connectionTimeoutMs,
          certificatePem: material.certificatePem,
          privateKeyPem: material.privateKeyPem,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Falha ao consultar a SEFAZ.';
        throw new InboundError(502, message);
      }
      if (response.statusCode === null || response.statusCode >= 400) {
        throw new InboundError(502, 'A SEFAZ não respondeu a consulta de DF-e.');
      }
      return response.body;
    },
  });
}

const lookupBody = z
  .object({
    nsu: z
      .string()
      .regex(/^[0-9]{15}$/)
      .optional(),
    accessKey: z
      .string()
      .regex(/^[0-9]{44}$/)
      .optional(),
  })
  .refine(
    (value) => Number(Boolean(value.nsu)) + Number(Boolean(value.accessKey)) === 1,
    {
      message: 'Informe o NSU ou a chave da NF-e.',
    },
  );

export async function listDfeDocuments(tenantId: string, search = '') {
  const settings = await getOrCreateNfeSettings(tenantId);
  const cursor = await getOrCreateDfeCursor(tenantId, settings.environment);
  const digits = search.replace(/\D/g, '').slice(0, 44);
  const filters = [
    eq(dfeDocuments.tenantId, tenantId),
    eq(dfeDocuments.environment, settings.environment),
  ];
  const match = digits
    ? or(like(dfeDocuments.nsu, `%${digits}%`), like(dfeDocuments.accessKey, `%${digits}%`))
    : undefined;
  if (match) filters.push(match);
  const rows = await db
    .select({
      id: dfeDocuments.id,
      nsu: dfeDocuments.nsu,
      kind: dfeDocuments.kind,
      accessKey: dfeDocuments.accessKey,
      xml: dfeDocuments.xml,
      createdAt: dfeDocuments.createdAt,
    })
    .from(dfeDocuments)
    .where(and(...filters))
    .orderBy(desc(dfeDocuments.nsu))
    .limit(200);

  return {
    environment: settings.environment,
    cursor: {
      ultNsu: cursor.ultNsu,
      maxNsu: cursor.maxNsu,
      lastStatus: cursor.lastStatus,
      queriedAt: cursor.queriedAt?.toISOString() ?? null,
    },
    documents: rows.map((row) => ({
      id: row.id,
      nsu: row.nsu,
      kind: row.kind,
      accessKey: row.accessKey,
      ...describeDfeDocument(row.xml),
      receivedAt: row.createdAt.toISOString(),
    })),
  };
}

export const dfeSyncRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('preHandler', fastify.autenticarETenant);

  fastify.get(
    '/dfe',
    {
      schema: {
        querystring: z.object({
          search: z.string().max(44).optional(),
        }),
      },
    },
    async (request) => listDfeDocuments(request.user.tenantId, request.query.search ?? ''),
  );

  fastify.post('/dfe/sync', async (request) => {
    return syncTenantDfe(request.user.tenantId, { kind: 'cursor' });
  });

  fastify.post('/dfe/lookup', { schema: { body: lookupBody } }, async (request) => {
    const query: DfeSyncQuery = request.body.nsu
      ? { kind: 'nsu', nsu: request.body.nsu }
      : { kind: 'accessKey', accessKey: request.body.accessKey ?? '' };
    return syncTenantDfe(request.user.tenantId, query);
  });
};
