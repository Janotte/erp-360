import '../../types/fastify.ts';

import { billingDocuments } from '@erp-360/mod-billing';
import { catalogItems } from '@erp-360/mod-catalog';
import { nfseRequestLines, nfseRequests } from '@erp-360/mod-nfse';
import { serviceOrderLines, serviceOrders } from '@erp-360/mod-service-orders';
import { and, asc, eq, ne } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { db } from '../../db/index.ts';
import { sendServiceOrderNfse } from './send.ts';

const messages = {
  missingOrder: 'Ordem não encontrada.',
  missingDocument: 'Gere o financeiro antes de solicitar a NFS-e.',
  noService: 'Este documento não tem serviço.',
  mismatch: 'O valor de serviço do documento não fecha com as linhas.',
  already: 'A NFS-e deste documento já foi solicitada.',
  done: 'NFS-e solicitada.',
};

export type NfseRequestLineView = {
  lineNumber: number;
  description: string;
  nationalServiceCode: string | null;
  municipalServiceCode: string | null;
  issRate: string | null;
  amount: number;
};

export type NfseRequestView = {
  id: string;
  status: 'pending' | 'authorized' | 'rejected' | 'canceled';
  serviceAmount: number;
  series: string | null;
  dpsNumber: number | null;
  accessKey: string | null;
  environment: 'homologation' | 'production' | null;
  statusMessage: string | null;
  lines: NfseRequestLineView[];
};

function httpError(message: string, status: number): never {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  throw error;
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const current = error as { code?: string; cause?: unknown };
  if (current.code === '23505') return true;
  return current.cause !== error && isUniqueViolation(current.cause);
}

async function linesOf(tenantId: string, requestId: string): Promise<NfseRequestLineView[]> {
  const rows = await db
    .select({
      lineNumber: nfseRequestLines.lineNumber,
      description: nfseRequestLines.description,
      nationalServiceCode: nfseRequestLines.nationalServiceCode,
      municipalServiceCode: nfseRequestLines.municipalServiceCode,
      issRate: nfseRequestLines.issRate,
      amount: nfseRequestLines.amount,
    })
    .from(nfseRequestLines)
    .where(
      and(eq(nfseRequestLines.tenantId, tenantId), eq(nfseRequestLines.requestId, requestId)),
    )
    .orderBy(asc(nfseRequestLines.lineNumber));
  return rows;
}

export async function loadIssuedNfseRequest(
  tenantId: string,
  billingDocumentId: string,
): Promise<NfseRequestView | null> {
  const [row] = await db
    .select({
      id: nfseRequests.id,
      status: nfseRequests.status,
      serviceAmount: nfseRequests.serviceAmount,
      series: nfseRequests.series,
      dpsNumber: nfseRequests.dpsNumber,
      accessKey: nfseRequests.accessKey,
      environment: nfseRequests.environment,
      statusMessage: nfseRequests.statusMessage,
    })
    .from(nfseRequests)
    .where(
      and(
        eq(nfseRequests.tenantId, tenantId),
        eq(nfseRequests.billingDocumentId, billingDocumentId),
        ne(nfseRequests.status, 'canceled'),
      ),
    )
    .limit(1);
  if (!row) return null;
  return { ...row, lines: await linesOf(tenantId, row.id) };
}

export async function requestServiceOrderNfse(tenantId: string, orderId: string) {
  const [order] = await db
    .select({ id: serviceOrders.id })
    .from(serviceOrders)
    .where(and(eq(serviceOrders.id, orderId), eq(serviceOrders.tenantId, tenantId)))
    .limit(1);
  if (!order) httpError(messages.missingOrder, 404);

  try {
    return await db.transaction(async (tx) => {
      const [document] = await tx
        .select({
          id: billingDocuments.id,
          servicesAmount: billingDocuments.servicesAmount,
        })
        .from(billingDocuments)
        .where(
          and(
            eq(billingDocuments.tenantId, tenantId),
            eq(billingDocuments.serviceOrderId, orderId),
            eq(billingDocuments.commercialStatus, 'issued'),
          ),
        )
        .limit(1)
        .for('update');
      if (!document) httpError(messages.missingDocument, 400);
      if (document.servicesAmount <= 0) httpError(messages.noService, 400);

      const [existing] = await tx
        .select({ id: nfseRequests.id })
        .from(nfseRequests)
        .where(
          and(
            eq(nfseRequests.tenantId, tenantId),
            eq(nfseRequests.billingDocumentId, document.id),
          ),
        )
        .limit(1);
      if (existing) {
        return { created: false as const, message: messages.already, requestId: existing.id };
      }

      const source = await tx
        .select({
          lineNumber: serviceOrderLines.lineNumber,
          lineDescription: serviceOrderLines.description,
          lineAmount: serviceOrderLines.lineAmount,
          nationalServiceCode: catalogItems.nationalServiceCode,
          municipalServiceCode: catalogItems.municipalServiceCode,
          issRate: catalogItems.issRate,
          serviceDescription: catalogItems.serviceDescription,
        })
        .from(serviceOrderLines)
        .innerJoin(
          catalogItems,
          and(
            eq(catalogItems.id, serviceOrderLines.itemId),
            eq(catalogItems.tenantId, serviceOrderLines.tenantId),
          ),
        )
        .where(
          and(
            eq(serviceOrderLines.tenantId, tenantId),
            eq(serviceOrderLines.orderId, orderId),
            eq(serviceOrderLines.kind, 'service'),
          ),
        )
        .orderBy(asc(serviceOrderLines.lineNumber));

      const lines = source
        .filter((line) => line.lineAmount > 0)
        .map((line) => ({
          lineNumber: line.lineNumber,
          description: (line.serviceDescription?.trim() || line.lineDescription).slice(0, 2000),
          nationalServiceCode: line.nationalServiceCode,
          municipalServiceCode: line.municipalServiceCode,
          issRate: line.issRate,
          amount: line.lineAmount,
        }));
      const serviceAmount = lines.reduce((sum, line) => sum + line.amount, 0);
      if (lines.length === 0 || serviceAmount !== document.servicesAmount) {
        httpError(messages.mismatch, 400);
      }

      const [created] = await tx
        .insert(nfseRequests)
        .values({
          tenantId,
          billingDocumentId: document.id,
          status: 'pending',
          serviceAmount,
        })
        .returning({ id: nfseRequests.id });
      if (!created) throw new Error('Não foi possível gravar a NFS-e.');

      await tx.insert(nfseRequestLines).values(
        lines.map((line) => ({
          tenantId,
          requestId: created.id,
          ...line,
        })),
      );
      await tx
        .update(billingDocuments)
        .set({ fiscalStatus: 'pending' })
        .where(
          and(eq(billingDocuments.id, document.id), eq(billingDocuments.tenantId, tenantId)),
        );

      return { created: true as const, message: messages.done, requestId: created.id };
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const [existing] = await db
      .select({ id: nfseRequests.id })
      .from(nfseRequests)
      .innerJoin(
        billingDocuments,
        and(
          eq(billingDocuments.id, nfseRequests.billingDocumentId),
          eq(billingDocuments.tenantId, nfseRequests.tenantId),
        ),
      )
      .where(
        and(
          eq(nfseRequests.tenantId, tenantId),
          eq(billingDocuments.serviceOrderId, orderId),
          eq(billingDocuments.commercialStatus, 'issued'),
        ),
      )
      .limit(1);
    if (!existing) throw error;
    return { created: false as const, message: messages.already, requestId: existing.id };
  }
}

async function viewOf(tenantId: string, requestId: string): Promise<NfseRequestView> {
  const [row] = await db
    .select({
      id: nfseRequests.id,
      status: nfseRequests.status,
      serviceAmount: nfseRequests.serviceAmount,
      series: nfseRequests.series,
      dpsNumber: nfseRequests.dpsNumber,
      accessKey: nfseRequests.accessKey,
      environment: nfseRequests.environment,
      statusMessage: nfseRequests.statusMessage,
    })
    .from(nfseRequests)
    .where(and(eq(nfseRequests.id, requestId), eq(nfseRequests.tenantId, tenantId)))
    .limit(1);
  if (!row) throw new Error('Não foi possível ler a NFS-e.');
  return { ...row, lines: await linesOf(tenantId, row.id) };
}

export const serviceOrderNfseRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.post(
    '/:id/nfse',
    { schema: { params: z.object({ id: z.string().uuid() }) } },
    async (request, reply) => {
      const result = await requestServiceOrderNfse(request.user.tenantId, request.params.id);
      const body = {
        message: result.message,
        request: await viewOf(request.user.tenantId, result.requestId),
      };
      if (!result.created) return reply.status(409).send(body);
      return body;
    },
  );

  fastify.post(
    '/:id/nfse/send',
    { schema: { params: z.object({ id: z.string().uuid() }) } },
    async (request) => {
      const result = await sendServiceOrderNfse(request.user.tenantId, request.params.id);
      return {
        message: result.message,
        request: await viewOf(request.user.tenantId, result.requestId),
      };
    },
  );
};
