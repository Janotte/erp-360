import '../../types/fastify.ts';

import { billingDocuments } from '@erp-360/mod-billing';
import { tenants } from '@erp-360/mod-core';
import { nfseEvents, nfseRequests } from '@erp-360/mod-nfse';
import {
  type NfseCancelBody,
  nfseCancelBodySchema,
  type NfseEnvironment,
} from '@erp-360/shared';
import { and, asc, eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { db } from '../../db/index.ts';
import { InboundError } from '../inbound/errors.ts';
import {
  buildSignedCancelEvent,
  nfseCancelEventType,
  nfseEventEndpoint,
  readNfseEventSubmission,
} from './event.ts';
import { loadNfseCertificate, submitNfseHttp } from './send.ts';

const messages = {
  missing: 'NFS-e não encontrada.',
  notAuthorized: 'Só uma NFS-e autorizada pode ser cancelada.',
  missingKey: 'A chave de acesso da NFS-e não está disponível.',
  missingEnvironment: 'O ambiente da NFS-e não está disponível.',
  cnpj: 'O CNPJ da empresa está incompleto.',
  certificateCnpj: 'O certificado A1 não é o CNPJ desta empresa.',
  done: 'NFS-e cancelada.',
};

function httpError(message: string, status: number): never {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  throw error;
}

function certificateMessage(error: unknown): never {
  if (error instanceof InboundError) {
    httpError(error.message.replace(' da NF-e', ''), error.status);
  }
  throw error;
}

function connectionMessage(error: unknown) {
  if (error instanceof Error && error.message === 'Tempo esgotado ao conectar no serviço.') {
    return error.message;
  }
  return 'Não foi possível conectar ao ambiente nacional da NFS-e.';
}

function unreachableMessage(environment: NfseEnvironment, statusCode: number) {
  const place = environment === 'homologation' ? 'A homologação' : 'A produção';
  if (statusCode === 401 || statusCode === 403) {
    return `${place} recusou o certificado desta empresa. Nada foi cancelado.`;
  }
  if (statusCode >= 500) {
    return `${place} está indisponível no momento. Tente de novo em instantes.`;
  }
  return `${place} não confirmou o cancelamento. Nada foi alterado.`;
}

export type NfseEventView = {
  id: string;
  type: string;
  sequence: number;
  reasonCode: string | null;
  reasonText: string | null;
  registeredAt: string;
  eventXml: string;
};

export async function listNfseEvents(
  tenantId: string,
  requestId: string,
): Promise<NfseEventView[]> {
  const [request] = await db
    .select({ id: nfseRequests.id, accessKey: nfseRequests.accessKey })
    .from(nfseRequests)
    .where(and(eq(nfseRequests.id, requestId), eq(nfseRequests.tenantId, tenantId)))
    .limit(1);
  if (!request) httpError(messages.missing, 404);
  if (!request.accessKey) httpError('Esta NFS-e ainda não tem chave de acesso.', 400);

  const rows = await db
    .select({
      id: nfseEvents.id,
      type: nfseEvents.type,
      sequence: nfseEvents.sequence,
      reasonCode: nfseEvents.reasonCode,
      reasonText: nfseEvents.reasonText,
      registeredAt: nfseEvents.registeredAt,
      eventXml: nfseEvents.eventXml,
    })
    .from(nfseEvents)
    .where(and(eq(nfseEvents.tenantId, tenantId), eq(nfseEvents.requestId, requestId)))
    .orderBy(asc(nfseEvents.sequence), asc(nfseEvents.registeredAt));

  return rows.map((row) => ({
    ...row,
    registeredAt: row.registeredAt.toISOString(),
  }));
}

export async function cancelNfseRequest(
  tenantId: string,
  requestId: string,
  body: NfseCancelBody,
) {
  const [request] = await db
    .select({
      id: nfseRequests.id,
      status: nfseRequests.status,
      accessKey: nfseRequests.accessKey,
      environment: nfseRequests.environment,
      billingDocumentId: nfseRequests.billingDocumentId,
    })
    .from(nfseRequests)
    .where(and(eq(nfseRequests.id, requestId), eq(nfseRequests.tenantId, tenantId)))
    .limit(1);
  if (!request) httpError(messages.missing, 404);
  if (request.status !== 'authorized') httpError(messages.notAuthorized, 409);
  if (!request.accessKey) httpError(messages.missingKey, 400);
  if (!request.environment) httpError(messages.missingEnvironment, 400);

  const [company] = await db
    .select({ cnpj: tenants.cnpj })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  const cnpj = (company?.cnpj ?? '').replace(/\D/g, '');
  if (cnpj.length !== 14) httpError(messages.cnpj, 400);

  let certificate;
  try {
    certificate = await loadNfseCertificate(tenantId, request.environment);
  } catch (error) {
    certificateMessage(error);
  }
  const certTaxId = certificate.taxId.replace(/\D/g, '');
  if (certTaxId !== cnpj) httpError(messages.certificateCnpj, 400);

  const signed = buildSignedCancelEvent({
    environment: request.environment,
    accessKey: request.accessKey,
    cnpj,
    reasonCode: body.reasonCode,
    reasonText: body.reasonText,
    privateKeyPem: certificate.privateKeyPem,
    certificatePem: certificate.certificatePem,
  });

  const endpoint = nfseEventEndpoint(request.environment, request.accessKey);
  let response;
  try {
    response = await submitNfseHttp({
      endpoint,
      body: signed.body,
      certificatePem: certificate.certificatePem,
      privateKeyPem: certificate.privateKeyPem,
    });
  } catch (error) {
    httpError(connectionMessage(error), 502);
  }

  const result = readNfseEventSubmission(response.statusCode, response.body);
  if (result.outcome === 'rejected') {
    httpError(result.message, 409);
  }
  if (result.outcome === 'unreachable') {
    httpError(unreachableMessage(request.environment, response.statusCode), 502);
  }

  const eventXml = result.eventXml ?? signed.xml;
  const registeredAt = new Date();

  await db.transaction(async (tx) => {
    await tx.insert(nfseEvents).values({
      tenantId,
      requestId: request.id,
      type: nfseCancelEventType,
      sequence: signed.sequence,
      reasonCode: body.reasonCode,
      reasonText: body.reasonText.trim().slice(0, 255),
      eventXml,
      registeredAt,
    });
    await tx
      .update(nfseRequests)
      .set({ status: 'canceled', statusMessage: null })
      .where(and(eq(nfseRequests.id, request.id), eq(nfseRequests.tenantId, tenantId)));
    await tx
      .update(billingDocuments)
      .set({ fiscalStatus: 'canceled' })
      .where(
        and(
          eq(billingDocuments.id, request.billingDocumentId),
          eq(billingDocuments.tenantId, tenantId),
        ),
      );
  });

  const [event] = await db
    .select({
      id: nfseEvents.id,
      type: nfseEvents.type,
      sequence: nfseEvents.sequence,
      reasonCode: nfseEvents.reasonCode,
      reasonText: nfseEvents.reasonText,
      registeredAt: nfseEvents.registeredAt,
      eventXml: nfseEvents.eventXml,
    })
    .from(nfseEvents)
    .where(
      and(
        eq(nfseEvents.tenantId, tenantId),
        eq(nfseEvents.requestId, request.id),
        eq(nfseEvents.type, nfseCancelEventType),
        eq(nfseEvents.sequence, signed.sequence),
      ),
    )
    .limit(1);
  if (!event) throw new Error('Não foi possível ler o evento de cancelamento.');

  return {
    message: messages.done,
    event: {
      ...event,
      registeredAt: event.registeredAt.toISOString(),
    },
  };
}

export const nfseCancelRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('preHandler', fastify.autenticarETenant);

  fastify.get(
    '/:requestId/events',
    { schema: { params: z.object({ requestId: z.string().uuid() }) } },
    async (request) => ({
      data: await listNfseEvents(request.user.tenantId, request.params.requestId),
    }),
  );

  fastify.post(
    '/:requestId/cancel',
    {
      schema: {
        params: z.object({ requestId: z.string().uuid() }),
        body: nfseCancelBodySchema,
      },
    },
    async (request) => cancelNfseRequest(request.user.tenantId, request.params.requestId, request.body),
  );
};
