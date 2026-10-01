import { payables } from '@erp-360/mod-financial';
import { and, asc, desc, eq, gte, ilike, lte, or, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.ts';
import '../types/fastify.ts';

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de data deve ser YYYY-MM-DD');

const createPayableSchema = z.object({
  creditorId: z.string().uuid({ message: 'Creditor ID precisa ser um UUID válido' }),
  documentNumber: z.string().max(44).optional(),
  description: z.string().min(1, 'Descrição é obrigatória').max(255),
  issueOn: dateString.optional(),
  installmentAmount: z.number().int('O valor deve ser em centavos (inteiro)'),
  dueOn: dateString,
  planAccountId: z.string().uuid().optional(),
});

const paySchema = z.object({
  paidOn: dateString,
  paidAmount: z.number().int('O valor pago deve ser em centavos (inteiro)'),
});

const listPayablesQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  sortField: z.enum(['description', 'dueOn', 'installmentAmount']).default('dueOn'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
  status: z.enum(['pendente', 'pago', 'cancelado']).optional(),
  busca: z.string().optional(),
  dueFrom: dateString.optional(),
  dueTo: dateString.optional(),
});

export const payablesRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.autenticarETenant);

  fastify.post('/', { schema: { body: createPayableSchema } }, async (request, reply) => {
    const { tenantId } = request.user;
    const data = request.body as z.infer<typeof createPayableSchema>;

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
  });

  fastify.get(
    '/',
    { schema: { querystring: listPayablesQuery } },
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
      } = request.query as z.infer<typeof listPayablesQuery>;

      const offset = (page - 1) * limit;
      const conditions = [eq(payables.tenantId, tenantId)];

      if (status) conditions.push(eq(payables.status, status));
      if (dueFrom) conditions.push(gte(payables.dueOn, dueFrom));
      if (dueTo) conditions.push(lte(payables.dueOn, dueTo));
      if (search) {
        conditions.push(
          or(
            ilike(payables.description, `%${search}%`),
            ilike(payables.documentNumber, `%${search}%`),
          )!,
        );
      }

      const sortColumns = {
        description: payables.description,
        dueOn: payables.dueOn,
        installmentAmount: payables.installmentAmount,
      } as const;
      const sortColumn = sortColumns[sortField];
      const orderBy = sortOrder === 'asc' ? [asc(sortColumn)] : [desc(sortColumn)];

      const data = await db
        .select()
        .from(payables)
        .where(and(...conditions))
        .orderBy(...orderBy)
        .limit(limit)
        .offset(offset);

      const [totalCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(payables)
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

  fastify.post(
    '/:id/pay',
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: paySchema,
      },
    },
    async (request, reply) => {
      const { tenantId } = request.user;
      const { id } = request.params as { id: string };
      const { paidOn, paidAmount } = request.body as z.infer<typeof paySchema>;

      const [updatedAccount] = await db
        .update(payables)
        .set({
          paidOn,
          paidAmount,
          status: 'pago',
        })
        .where(and(eq(payables.id, id), eq(payables.tenantId, tenantId)))
        .returning();

      if (!updatedAccount) {
        return reply.status(404).send({ message: 'Conta a pagar não encontrada.' });
      }

      return updatedAccount;
    },
  );
};
