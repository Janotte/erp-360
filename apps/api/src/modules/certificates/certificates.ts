import '../../types/fastify.ts';

import { tenantCertificates, tenants } from '@erp-360/mod-core';
import { cities, states } from '@erp-360/mod-persons';
import {
  certificateConnectionSchema,
  type CertificateConnectionTarget,
  certificateConnectionTargets,
  type CertificateEnvironment,
  certificateInspectionSchema,
  type CertificateWarning,
  certificateWarningSchema,
  tenantCertificateListSchema,
  tenantCertificateSchema,
} from '@erp-360/shared';
import { and, asc, eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { env } from '../../config/index.ts';
import { db } from '../../db/index.ts';
import { certificateReadMessage, decryptPassword, encryptPassword } from './cipher.ts';
import { CertificateError } from './errors.ts';
import {
  decodePfxBase64,
  type ParsedCertificate,
  readPfx,
  readPfxMaterial,
} from './pfx.ts';
import { probeHttps, probeSefaz } from './probe.ts';
import {
  connectionTimeoutMs,
  ecacUrl,
  sefazStatusUrl,
  stateCode,
  subjectStateAbbreviation,
} from './sefaz.ts';
import {
  certificateDaysLeft,
  certificateIsCurrent,
  certificateNotice,
} from './status.ts';

const certificateBody = z.object({
  environment: z.enum(['homologation', 'production']),
  label: z.string().max(60).optional().nullable(),
  pfxBase64: z.string().min(1),
  password: z.string().min(1).max(128),
});

function cleanLabel(label: string | null | undefined) {
  const trimmed = label?.trim();
  return trimmed ? trimmed : null;
}

function viewOf(
  row: {
    id: string;
    model: 'a1' | 'a3';
    environment: CertificateEnvironment;
    label: string | null;
    serialNumber: string;
    thumbprintSha256: string;
    subjectName: string;
    issuerName: string;
    taxId: string;
    validFrom: Date;
    validUntil: Date;
    isActive: boolean;
  },
  today?: string,
) {
  const daysLeft = certificateDaysLeft(row.validUntil, today);
  return tenantCertificateSchema.parse({
    id: row.id,
    model: row.model,
    environment: row.environment,
    label: row.label,
    serialNumber: row.serialNumber,
    thumbprintSha256: row.thumbprintSha256,
    subjectName: row.subjectName,
    issuerName: row.issuerName,
    taxId: row.taxId,
    validFrom: row.validFrom.toISOString(),
    validUntil: row.validUntil.toISOString(),
    isActive: row.isActive,
    daysLeft,
    expired: daysLeft < 0,
  });
}

async function tenantCnpj(tenantId: string) {
  const [tenant] = await db
    .select({ cnpj: tenants.cnpj })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  if (!tenant) throw new CertificateError(404, 'Empresa não encontrada.');
  return tenant.cnpj;
}

function inspectParsed(parsed: ParsedCertificate, cnpj: string, now = new Date()) {
  const daysLeft = certificateDaysLeft(parsed.validUntil);
  const current = certificateIsCurrent(parsed.validFrom, parsed.validUntil, now);
  const belongsToTenant = parsed.taxId === cnpj;
  const messages: string[] = [];
  if (!belongsToTenant) {
    messages.push('O certificado não pertence a esta empresa.');
  }
  if (now < parsed.validFrom) messages.push('O certificado ainda não está válido.');
  if (now > parsed.validUntil) messages.push('O certificado está vencido.');
  if (messages.length === 0) messages.push('Certificado válido para esta empresa.');

  return certificateInspectionSchema.parse({
    model: 'a1' as const,
    label: null,
    serialNumber: parsed.serialNumber,
    thumbprintSha256: parsed.thumbprintSha256,
    subjectName: parsed.subjectName,
    issuerName: parsed.issuerName,
    taxId: parsed.taxId,
    validFrom: parsed.validFrom.toISOString(),
    validUntil: parsed.validUntil.toISOString(),
    daysLeft,
    expired: daysLeft < 0,
    current,
    belongsToTenant,
    messages,
  });
}

function openBody(body: { pfxBase64: string; password: string }) {
  return readPfx(decodePfxBase64(body.pfxBase64), body.password);
}

export async function listCertificateWarnings(
  tenantId: string,
): Promise<CertificateWarning[]> {
  const rows = await db
    .select({
      environment: tenantCertificates.environment,
      label: tenantCertificates.label,
      validUntil: tenantCertificates.validUntil,
    })
    .from(tenantCertificates)
    .where(
      and(
        eq(tenantCertificates.tenantId, tenantId),
        eq(tenantCertificates.isActive, true),
      ),
    );

  return rows.flatMap((row) => {
    const notice = certificateNotice(row.validUntil);
    if (!notice) return [];
    return [
      certificateWarningSchema.parse({
        environment: row.environment,
        label: row.label,
        validUntil: row.validUntil.toISOString(),
        daysLeft: notice.daysLeft,
        expired: notice.expired,
      }),
    ];
  });
}

export async function deleteCertificate(tenantId: string, id: string) {
  const deleted = await db
    .delete(tenantCertificates)
    .where(and(eq(tenantCertificates.id, id), eq(tenantCertificates.tenantId, tenantId)))
    .returning({ id: tenantCertificates.id });
  if (deleted.length === 0) {
    throw new CertificateError(404, 'Certificado não encontrado.');
  }
}

export const certificateRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('preHandler', fastify.autenticarETenant);

  fastify.get(
    '/',
    { schema: { response: { 200: tenantCertificateListSchema } } },
    async (request) => {
      const rows = await db
        .select({
          id: tenantCertificates.id,
          model: tenantCertificates.model,
          environment: tenantCertificates.environment,
          label: tenantCertificates.label,
          serialNumber: tenantCertificates.serialNumber,
          thumbprintSha256: tenantCertificates.thumbprintSha256,
          subjectName: tenantCertificates.subjectName,
          issuerName: tenantCertificates.issuerName,
          taxId: tenantCertificates.taxId,
          validFrom: tenantCertificates.validFrom,
          validUntil: tenantCertificates.validUntil,
          isActive: tenantCertificates.isActive,
        })
        .from(tenantCertificates)
        .where(
          and(
            eq(tenantCertificates.tenantId, request.user.tenantId),
            eq(tenantCertificates.isActive, true),
          ),
        )
        .orderBy(asc(tenantCertificates.environment));

      return rows.map((row) => viewOf(row));
    },
  );

  fastify.post(
    '/inspect',
    {
      bodyLimit: 2_000_000,
      schema: {
        body: certificateBody.pick({ pfxBase64: true, password: true }),
        response: { 200: certificateInspectionSchema },
      },
    },
    async (request) => {
      const cnpj = await tenantCnpj(request.user.tenantId);
      return inspectParsed(openBody(request.body), cnpj);
    },
  );

  fastify.post(
    '/',
    {
      bodyLimit: 2_000_000,
      schema: {
        body: certificateBody,
        response: { 201: tenantCertificateSchema },
      },
    },
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const cnpj = await tenantCnpj(tenantId);
      const parsed = openBody(request.body);
      const inspection = inspectParsed(parsed, cnpj);
      if (!inspection.belongsToTenant || !inspection.current) {
        throw new CertificateError(
          400,
          inspection.messages[0] ?? 'Certificado recusado.',
        );
      }

      const existing = await db
        .select({ id: tenantCertificates.id })
        .from(tenantCertificates)
        .where(
          and(
            eq(tenantCertificates.tenantId, tenantId),
            eq(tenantCertificates.environment, request.body.environment),
            eq(tenantCertificates.isActive, true),
            eq(tenantCertificates.thumbprintSha256, parsed.thumbprintSha256),
          ),
        )
        .limit(1);
      if (existing.length > 0) {
        throw new CertificateError(409, 'Este certificado já está ativo neste ambiente.');
      }

      const created = await db.transaction(async (tx) => {
        await tx
          .update(tenantCertificates)
          .set({ isActive: false })
          .where(
            and(
              eq(tenantCertificates.tenantId, tenantId),
              eq(tenantCertificates.environment, request.body.environment),
              eq(tenantCertificates.isActive, true),
            ),
          );

        const [row] = await tx
          .insert(tenantCertificates)
          .values({
            tenantId,
            model: 'a1',
            environment: request.body.environment,
            label: cleanLabel(request.body.label),
            pfx: decodePfxBase64(request.body.pfxBase64),
            passwordCipher: encryptPassword(request.body.password, env.certificate.secret),
            serialNumber: parsed.serialNumber,
            thumbprintSha256: parsed.thumbprintSha256,
            subjectName: parsed.subjectName,
            issuerName: parsed.issuerName,
            taxId: parsed.taxId,
            validFrom: parsed.validFrom,
            validUntil: parsed.validUntil,
            isActive: true,
          })
          .returning({
            id: tenantCertificates.id,
            model: tenantCertificates.model,
            environment: tenantCertificates.environment,
            label: tenantCertificates.label,
            serialNumber: tenantCertificates.serialNumber,
            thumbprintSha256: tenantCertificates.thumbprintSha256,
            subjectName: tenantCertificates.subjectName,
            issuerName: tenantCertificates.issuerName,
            taxId: tenantCertificates.taxId,
            validFrom: tenantCertificates.validFrom,
            validUntil: tenantCertificates.validUntil,
            isActive: tenantCertificates.isActive,
          });
        return row;
      });

      return reply.status(201).send(viewOf(created));
    },
  );

  fastify.post(
    '/:id/connection',
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.object({ target: z.enum(certificateConnectionTargets) }),
        response: { 200: certificateConnectionSchema },
      },
    },
    async (request) => {
      const tenantId = request.user.tenantId;
      const [certificate] = await db
        .select({
          id: tenantCertificates.id,
          isActive: tenantCertificates.isActive,
          environment: tenantCertificates.environment,
          pfx: tenantCertificates.pfx,
          passwordCipher: tenantCertificates.passwordCipher,
          validFrom: tenantCertificates.validFrom,
          validUntil: tenantCertificates.validUntil,
        })
        .from(tenantCertificates)
        .where(
          and(
            eq(tenantCertificates.id, request.params.id),
            eq(tenantCertificates.tenantId, tenantId),
          ),
        )
        .limit(1);
      if (!certificate) throw new CertificateError(404, 'Certificado não encontrado.');

      let certificatePem = '';
      let privateKeyPem = '';
      let loadError: string | null = null;
      try {
        const password = decryptPassword(certificate.passwordCipher, env.certificate.secret);
        const material = readPfxMaterial(certificate.pfx, password);
        certificatePem = material.certificatePem;
        privateKeyPem = material.privateKeyPem;
        if (!certificatePem || !privateKeyPem) {
          loadError = 'Não foi possível carregar o certificado para a conexão.';
        }
      } catch (error) {
        loadError =
          certificateReadMessage(error) === 'saved-password'
            ? 'A senha salva do certificado não pode mais ser lida. Importe o certificado novamente.'
            : error instanceof CertificateError
              ? error.message
              : 'Não foi possível carregar o certificado para a conexão.';
      }

      const now = Date.now();
      const isActive = certificate.isActive;
      const notExpired =
        certificate.validFrom.getTime() <= now && certificate.validUntil.getTime() >= now;
      const hasPrivateKey = privateKeyPem.length > 0;
      const hasCertificate = certificatePem.length > 0;
      const localChecks = {
        certificateFound: true,
        isActive,
        notExpired,
        hasPrivateKey,
        hasCertificate,
      };
      const target = request.body.target;
      const remoteTarget = await connectionTarget({
        target,
        tenantId,
        environment: certificate.environment,
        certificatePem,
      });

      const unavailable = {
        ok: false,
        statusCode: null,
        statusMessage: null,
        latencyMs: 0,
      };
      const remote = !remoteTarget.endpoint
        ? { ...unavailable, error: remoteTarget.error }
        : loadError
          ? { ...unavailable, error: loadError }
          : target === 'sefaz'
            ? await probeSefaz({
                endpoint: remoteTarget.endpoint,
                timeoutMs: connectionTimeoutMs,
                certificatePem,
                privateKeyPem,
                cUF: remoteTarget.cUF,
                environment: certificate.environment,
              })
            : await probeHttps({
                endpoint: remoteTarget.endpoint,
                timeoutMs: connectionTimeoutMs,
                certificatePem,
                privateKeyPem,
              });

      return certificateConnectionSchema.parse({
        validLocal: isActive && notExpired && hasPrivateKey && hasCertificate,
        validRemote: remote.ok,
        checkedAt: new Date().toISOString(),
        target,
        endpoint: remoteTarget.endpoint,
        localChecks,
        remote,
      });
    },
  );

  fastify.delete(
    '/:id',
    { schema: { params: z.object({ id: z.string().uuid() }) } },
    async (request, reply) => {
      await deleteCertificate(request.user.tenantId, request.params.id);
      return reply.status(204).send();
    },
  );
};

async function connectionTarget(input: {
  target: CertificateConnectionTarget;
  tenantId: string;
  environment: CertificateEnvironment;
  certificatePem: string;
}) {
  if (input.target === 'ecac') return { endpoint: ecacUrl, cUF: '', error: null };

  const fromEmitter = await emitterState(input.tenantId);
  const abbreviation =
    fromEmitter ?? subjectStateAbbreviation(input.certificatePem)?.toUpperCase() ?? null;
  const cUF = stateCode(abbreviation);
  const endpoint = abbreviation ? sefazStatusUrl(abbreviation, input.environment) : null;
  if (!endpoint || !cUF) {
    return {
      endpoint: '',
      cUF: '',
      error: 'Cadastre a UF do emitente para testar a SEFAZ.',
    };
  }
  return { endpoint, cUF, error: null };
}

async function emitterState(tenantId: string) {
  const [row] = await db
    .select({ abbreviation: states.abbreviation })
    .from(tenants)
    .leftJoin(cities, eq(tenants.cityId, cities.id))
    .leftJoin(states, eq(cities.stateId, states.id))
    .where(eq(tenants.id, tenantId))
    .limit(1);
  const abbreviation = row?.abbreviation?.trim().toUpperCase();
  return abbreviation || null;
}
