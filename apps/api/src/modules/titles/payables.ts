import '../../types/fastify.ts';

import { payables } from '@erp-360/mod-financial';
import { persons } from '@erp-360/mod-persons';
import {
  escapeIlike,
  payableTitleSchema,
  settlementPreviewSchema,
  titlePageSchema,
} from '@erp-360/shared';
import { and, asc, desc, eq, getTableColumns, gte, ilike, lt, lte, or, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { db } from '../../db/index.ts';
import { titleListStatus } from './listStatus.ts';
import {
  previewSettlement,
  reverseSettlement,
  settleTitle,
} from './settlement.ts';

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de data deve ser YYYY-MM-DD');

const errorMessageSchema = z.object({ message: z.string() });

const createPayableSchema = z.object({
  creditorId: z.string().uuid({ message: 'Creditor ID precisa ser um UUID válido' }),
  documentNumber: z.string().max(44).optional(),
  description: z.string().min(1, 'Descrição é obrigatória').max(255),
  issueOn: dateString.optional(),
  installmentAmount: z
    .number()
    .int('O valor deve ser em centavos (inteiro)')
    .positive('O valor deve ser maior que zero.'),
  dueOn: dateString,
  planAccountId: z.string().uuid().optional(),
});

const paySchema = z.object({
  settledOn: dateString,
  settledAmount: z
    .number()
    .int('O valor pago deve ser em centavos (inteiro)')
    .positive('O valor pago deve ser maior que zero.'),
  treasury: z.enum(['cash', 'bank']),
  bankAccountId: z.string().uuid().optional().nullable(),
  remainderMode: z.enum(['none', 'new_title', 'plan_account']).optional().default('none'),
  differencePlanAccountId: z.string().uuid().optional().nullable(),
  remainderDueOn: dateString.optional().nullable(),
});

const listPayablesQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  sortField: z
    .enum([
      'documentNumber',
      'personName',
      'description',
      'issueOn',
      'dueOn',
      'installmentAmount',
    ])
    .default('dueOn'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
  status: z.enum(['pendente', 'pago', 'cancelado', 'atrasado']).optional(),
  busca: z.string().optional(),
  dueFrom: dateString.optional(),
  dueTo: dateString.optional(),
  issueFrom: dateString.optional(),
  issueTo: dateString.optional(),
});

export const payablesRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('preHandler', fastify.autenticarETenant);

  fastify.post(
    '/',
    { schema: { body: createPayableSchema, response: { 201: payableTitleSchema } } },
    async (request, reply) => {
      const { tenantId } = request.user;
      const data = request.body;

      const [newAccount] = await db
        .insert(payables)
        .values({
          creditorId: data.creditorId,
          documentNumber: data.documentNumber || null,
          description: data.description,
          issueOn: data.issueOn,
          installmentAmount: data.installmentAmount,
          dueOn: data.dueOn,
          planAccountId: data.planAccountId || null,
          tenantId,
          status: 'pendente',
        })
        .returning();

      return reply.status(201).send(newAccount);
    },
  );

  fastify.get(
    '/',
    {
      schema: {
        querystring: listPayablesQuery,
        response: { 200: titlePageSchema(payableTitleSchema) },
      },
    },
    async (request, reply) => {
      const { tenantId } = request.user;
      const {
        page,
        limit,
        sortField,
        sortOrder,
        status,
        busca: search,
        dueFrom,
        dueTo,
        issueFrom,
        issueTo,
      } = request.query;

      const offset = (page - 1) * limit;
      const conditions = [eq(payables.tenantId, tenantId)];

      const statusFilter = titleListStatus(status);
      if (statusFilter) {
        conditions.push(eq(payables.status, statusFilter.status));
        if (statusFilter.dueBefore) {
          conditions.push(lt(payables.dueOn, statusFilter.dueBefore));
        }
      }
      if (dueFrom) conditions.push(gte(payables.dueOn, dueFrom));
      if (dueTo) conditions.push(lte(payables.dueOn, dueTo));
      if (issueFrom) conditions.push(gte(payables.issueOn, issueFrom));
      if (issueTo) conditions.push(lte(payables.issueOn, issueTo));
      if (search) {
        const like = `%${escapeIlike(search)}%`;
        conditions.push(
          or(
            ilike(payables.description, like),
            ilike(payables.documentNumber, like),
            sql`unaccent(${persons.name}) ilike unaccent(${like})`,
          )!,
        );
      }

      const creditor = and(
        eq(persons.id, payables.creditorId),
        eq(persons.tenantId, payables.tenantId),
      );

      const sortColumns = {
        documentNumber: payables.documentNumber,
        personName: persons.name,
        description: payables.description,
        issueOn: payables.issueOn,
        dueOn: payables.dueOn,
        installmentAmount: payables.installmentAmount,
      } as const;
      const sortColumn = sortColumns[sortField];
      const orderBy =
        sortOrder === 'asc'
          ? [asc(sortColumn), asc(payables.id)]
          : [desc(sortColumn), asc(payables.id)];

      const data = await db
        .select({
          ...getTableColumns(payables),
          personName: persons.name,
        })
        .from(payables)
        .innerJoin(persons, creditor)
        .where(and(...conditions))
        .orderBy(...orderBy)
        .limit(limit)
        .offset(offset);

      const [totalCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(payables)
        .innerJoin(persons, creditor)
        .where(and(...conditions));

      return reply.send({
        data,
        meta: {
          total: Number(totalCount?.count || 0),
          page,
          limit,
          totalPages: Math.ceil(Number(totalCount?.count || 0) / limit),
        },
      });
    },
  );

  fastify.get(
    '/:id/settlement-preview',
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        querystring: z.object({
          settledOn: dateString,
        }),
        response: { 200: settlementPreviewSchema },
      },
    },
    async (request, _reply) => {
      const { tenantId } = request.user;
      const { id } = request.params;
      const { settledOn } = request.query;
      return await previewSettlement({
        kind: 'payable',
        tenantId,
        titleId: id,
        settledOn,
      });
    },
  );

  fastify.post(
    '/:id/pay',
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: paySchema,
        response: { 200: payableTitleSchema },
      },
    },
    async (request, _reply) => {
      const { tenantId } = request.user;
      const { id } = request.params;
      const data = request.body;

      const result = await settleTitle({
        kind: 'payable',
        tenantId,
        titleId: id,
        settledOn: data.settledOn,
        settledAmount: data.settledAmount,
        treasury: data.treasury,
        bankAccountId: data.bankAccountId,
        remainderMode: data.remainderMode,
        differencePlanAccountId: data.differencePlanAccountId,
        remainderDueOn: data.remainderDueOn,
      });
      return payableTitleSchema.parse(result.title);
    },
  );

  fastify.put(
    '/:id',
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: createPayableSchema,
        response: {
          200: payableTitleSchema,
          400: errorMessageSchema,
          404: errorMessageSchema,
        },
      },
    },
    async (request, reply) => {
      const { tenantId } = request.user;
      const { id } = request.params;
      const data = request.body;

      const [existing] = await db
        .select({ status: payables.status })
        .from(payables)
        .where(and(eq(payables.id, id), eq(payables.tenantId, tenantId)))
        .limit(1);

      if (!existing) {
        return reply.status(404).send({ message: 'Conta a pagar não encontrada.' });
      }
      if (existing.status !== 'pendente') {
        return reply.status(400).send({
          message: 'Somente contas pendentes podem ser editadas.',
        });
      }

      const [updated] = await db
        .update(payables)
        .set({
          creditorId: data.creditorId,
          documentNumber: data.documentNumber || null,
          description: data.description,
          issueOn: data.issueOn,
          installmentAmount: data.installmentAmount,
          dueOn: data.dueOn,
          planAccountId: data.planAccountId || null,
        })
        .where(and(eq(payables.id, id), eq(payables.tenantId, tenantId)))
        .returning();

      return updated;
    },
  );

  fastify.delete(
    '/:id',
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
      },
    },
    async (request, reply) => {
      const { tenantId } = request.user;
      const { id } = request.params;

      const [existing] = await db
        .select({ status: payables.status })
        .from(payables)
        .where(and(eq(payables.id, id), eq(payables.tenantId, tenantId)))
        .limit(1);

      if (!existing) {
        return reply.status(404).send({ message: 'Conta a pagar não encontrada.' });
      }
      if (existing.status !== 'pendente') {
        return reply.status(400).send({
          message: 'Somente contas pendentes podem ser excluídas.',
        });
      }

      await db
        .delete(payables)
        .where(and(eq(payables.id, id), eq(payables.tenantId, tenantId)));

      return { success: true };
    },
  );

  fastify.post(
    '/:id/reverse',
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: payableTitleSchema },
      },
    },
    async (request, _reply) => {
      const { tenantId } = request.user;
      const { id } = request.params;

      const updated = await reverseSettlement({
        kind: 'payable',
        tenantId,
        titleId: id,
      });
      return payableTitleSchema.parse(updated);
    },
  );
};
