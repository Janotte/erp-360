import '../../types/fastify.ts';

import { billingDocuments } from '@erp-360/mod-billing';
import { nfseRequests } from '@erp-360/mod-nfse';
import { persons } from '@erp-360/mod-persons';
import { escapeIlike, listPageMeta } from '@erp-360/shared';
import { and, asc, eq, ilike, or, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { db } from '../../db/index.ts';
import { listPageQuery } from '../../lib/list-page.ts';

const sortFields = [
  'dpsNumber',
  'series',
  'status',
  'createdAt',
  'customerName',
  'serviceAmount',
  'accessKey',
] as const;

const listQuery = z.object({
  ...listPageQuery,
  q: z.string().max(120).optional(),
  status: z.enum(['pending', 'authorized', 'rejected', 'canceled']).optional(),
  issuedFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  issuedTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  sortField: z.enum(sortFields).default('dpsNumber'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export const nfseListRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('preHandler', fastify.autenticarETenant);

  fastify.get('/', { schema: { querystring: listQuery } }, async (request) => {
    const { tenantId } = request.user;
    const {
      page,
      limit: rawLimit,
      q,
      status,
      issuedFrom,
      issuedTo,
      sortField,
      sortOrder,
    } = request.query;
    const limit = rawLimit ?? 10;
    const offset = (page - 1) * limit;

    const personJoin = and(
      eq(persons.id, billingDocuments.personId),
      eq(persons.tenantId, billingDocuments.tenantId),
    );
    const documentJoin = and(
      eq(billingDocuments.id, nfseRequests.billingDocumentId),
      eq(billingDocuments.tenantId, nfseRequests.tenantId),
    );

    const filters = [eq(nfseRequests.tenantId, tenantId)];
    if (status) filters.push(eq(nfseRequests.status, status));
    if (issuedFrom) {
      filters.push(
        sql`((${nfseRequests.createdAt} AT TIME ZONE 'America/Sao_Paulo')::date >= ${issuedFrom}::date)`,
      );
    }
    if (issuedTo) {
      filters.push(
        sql`((${nfseRequests.createdAt} AT TIME ZONE 'America/Sao_Paulo')::date <= ${issuedTo}::date)`,
      );
    }
    const term = q?.trim();
    if (term) {
      const like = `%${escapeIlike(term)}%`;
      const matches = [
        sql`cast(${nfseRequests.dpsNumber} as text) ilike ${like}`,
        ilike(nfseRequests.series, like),
        sql`unaccent(${persons.name}) ilike unaccent(${like})`,
        ilike(nfseRequests.accessKey, like),
      ];
      const match = or(...matches);
      if (match) filters.push(match);
    }

    const direction = sortOrder === 'asc' ? 'ASC' : 'DESC';
    const sortSql = {
      dpsNumber: sql`${nfseRequests.dpsNumber} ${sql.raw(direction)} NULLS LAST`,
      series: sql`${nfseRequests.series} ${sql.raw(direction)} NULLS LAST`,
      status: sql`${nfseRequests.status} ${sql.raw(direction)}`,
      createdAt: sql`${nfseRequests.createdAt} ${sql.raw(direction)}`,
      customerName: sql`${persons.name} ${sql.raw(direction)}`,
      serviceAmount: sql`${nfseRequests.serviceAmount} ${sql.raw(direction)}`,
      accessKey: sql`${nfseRequests.accessKey} ${sql.raw(direction)} NULLS LAST`,
    } as const;

    const where = and(...filters);
    const rows = await db
      .select({
        id: nfseRequests.id,
        dpsNumber: nfseRequests.dpsNumber,
        series: nfseRequests.series,
        status: nfseRequests.status,
        createdAt: nfseRequests.createdAt,
        customerName: persons.name,
        serviceAmount: nfseRequests.serviceAmount,
        accessKey: nfseRequests.accessKey,
      })
      .from(nfseRequests)
      .innerJoin(billingDocuments, documentJoin)
      .innerJoin(persons, personJoin)
      .where(where)
      .orderBy(sortSql[sortField], asc(nfseRequests.id))
      .limit(limit)
      .offset(offset);

    const [totalRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(nfseRequests)
      .innerJoin(billingDocuments, documentJoin)
      .innerJoin(persons, personJoin)
      .where(where);

    const total = Number(totalRow?.count || 0);
    return {
      data: rows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
      })),
      meta: listPageMeta(total, page, limit),
    };
  });
};
