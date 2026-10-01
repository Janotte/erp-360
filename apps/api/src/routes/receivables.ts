import { receivables } from '@erp-360/mod-financial';
import { and, asc, desc, eq, gte, ilike, lte, or, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.ts';
import '../types/fastify.ts';

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de data deve ser YYYY-MM-DD');

const createReceivableSchema = z.object({
  debtorId: z.string().uuid({ message: 'Debtor ID precisa ser um UUID válido' }),
  documentNumber: z.string().max(44).optional(),
  description: z.string().min(1, 'Descrição é obrigatória').max(255),
  issueOn: dateString.optional(),
  installmentAmount: z.number().int('O valor deve ser em centavos (inteiro)'),
  dueOn: dateString,
  planAccountId: z.string().uuid().optional(),
  bearerName: z.string().max(60).optional(),
  barcode: z.string().max(50).optional(),
  bankSlipOurNumber: z.string().max(20).optional(),
  invoiceNumber: z.string().max(44).optional(),
  financialInstitutionId: z.string().uuid().optional(),
  paymentMethodId: z.string().uuid().optional(),
  cardBrandId: z.string().uuid().optional(),
  transactionAuthorization: z.string().max(128).optional(),
});

const receiveSchema = z.object({
  receivedOn: dateString,
  receivedAmount: z.number().int('O valor recebido deve ser em centavos (inteiro)'),
});

const listReceivablesQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  sortField: z.enum(['description', 'dueOn', 'installmentAmount']).default('dueOn'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
  status: z.enum(['pendente', 'recebido', 'cancelado']).optional(),
  busca: z.string().optional(),
  dueFrom: dateString.optional(),
  dueTo: dateString.optional(),
});

export const receivablesRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.autenticarETenant);

  fastify.post(
    '/',
    { schema: { body: createReceivableSchema } },
    async (request, reply) => {
      const { tenantId } = request.user;
      const data = request.body as z.infer<typeof createReceivableSchema>;

      const [newAccount] = await db
        .insert(receivables)
        .values({
          debtorId: data.debtorId,
          documentNumber: data.documentNumber || null,
          description: data.description,
          issueOn: data.issueOn,
          installmentAmount: data.installmentAmount,
          dueOn: data.dueOn,
          planAccountId: data.planAccountId || null,
          bearerName: data.bearerName || null,
          barcode: data.barcode || null,
          bankSlipOurNumber: data.bankSlipOurNumber || null,
          invoiceNumber: data.invoiceNumber || null,
          financialInstitutionId: data.financialInstitutionId || null,
          paymentMethodId: data.paymentMethodId || null,
          cardBrandId: data.cardBrandId || null,
          transactionAuthorization: data.transactionAuthorization || null,
          tenantId,
          status: 'pendente',
        })
        .returning();

      return reply.status(201).send(newAccount);
    },
  );

  fastify.get(
    '/',
    { schema: { querystring: listReceivablesQuery } },
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
      } = request.query as z.infer<typeof listReceivablesQuery>;

      const offset = (page - 1) * limit;
      const conditions = [eq(receivables.tenantId, tenantId)];

      if (status) conditions.push(eq(receivables.status, status));
      if (dueFrom) conditions.push(gte(receivables.dueOn, dueFrom));
      if (dueTo) conditions.push(lte(receivables.dueOn, dueTo));
      if (search) {
        conditions.push(
          or(
            ilike(receivables.description, `%${search}%`),
            ilike(receivables.documentNumber, `%${search}%`),
          )!,
        );
      }

      const sortColumns = {
        description: receivables.description,
        dueOn: receivables.dueOn,
        installmentAmount: receivables.installmentAmount,
      } as const;
      const sortColumn = sortColumns[sortField];
      const orderBy = sortOrder === 'asc' ? [asc(sortColumn)] : [desc(sortColumn)];

      const data = await db
        .select()
        .from(receivables)
        .where(and(...conditions))
        .orderBy(...orderBy)
        .limit(limit)
        .offset(offset);

      const [totalCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(receivables)
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
    '/:id/receive',
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: receiveSchema,
      },
    },
    async (request, reply) => {
      const { tenantId } = request.user;
      const { id } = request.params as { id: string };
      const { receivedOn, receivedAmount } = request.body as z.infer<typeof receiveSchema>;

      const [existing] = await db
        .select({ status: receivables.status })
        .from(receivables)
        .where(and(eq(receivables.id, id), eq(receivables.tenantId, tenantId)))
        .limit(1);

      if (!existing) {
        return reply.status(404).send({ message: 'Conta a receber não encontrada.' });
      }
      if (existing.status !== 'pendente') {
        return reply.status(400).send({
          message: 'Somente contas pendentes podem ser liquidadas.',
        });
      }

      const [updatedAccount] = await db
        .update(receivables)
        .set({
          receivedOn,
          receivedAmount,
          status: 'recebido',
        })
        .where(and(eq(receivables.id, id), eq(receivables.tenantId, tenantId)))
        .returning();

      return updatedAccount;
    },
  );

  fastify.put(
    '/:id',
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: createReceivableSchema,
      },
    },
    async (request, reply) => {
      const { tenantId } = request.user;
      const { id } = request.params as { id: string };
      const data = request.body as z.infer<typeof createReceivableSchema>;

      const [existing] = await db
        .select({ status: receivables.status })
        .from(receivables)
        .where(and(eq(receivables.id, id), eq(receivables.tenantId, tenantId)))
        .limit(1);

      if (!existing) {
        return reply.status(404).send({ message: 'Conta a receber não encontrada.' });
      }
      if (existing.status !== 'pendente') {
        return reply.status(400).send({
          message: 'Somente contas pendentes podem ser editadas.',
        });
      }

      const [updated] = await db
        .update(receivables)
        .set({
          debtorId: data.debtorId,
          documentNumber: data.documentNumber || null,
          description: data.description,
          issueOn: data.issueOn,
          installmentAmount: data.installmentAmount,
          dueOn: data.dueOn,
          planAccountId: data.planAccountId || null,
          bearerName: data.bearerName || null,
          barcode: data.barcode || null,
          bankSlipOurNumber: data.bankSlipOurNumber || null,
          invoiceNumber: data.invoiceNumber || null,
          financialInstitutionId: data.financialInstitutionId || null,
          paymentMethodId: data.paymentMethodId || null,
          cardBrandId: data.cardBrandId || null,
          transactionAuthorization: data.transactionAuthorization || null,
        })
        .where(and(eq(receivables.id, id), eq(receivables.tenantId, tenantId)))
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
      const { id } = request.params as { id: string };

      const [existing] = await db
        .select({ status: receivables.status })
        .from(receivables)
        .where(and(eq(receivables.id, id), eq(receivables.tenantId, tenantId)))
        .limit(1);

      if (!existing) {
        return reply.status(404).send({ message: 'Conta a receber não encontrada.' });
      }
      if (existing.status !== 'pendente') {
        return reply.status(400).send({
          message: 'Somente contas pendentes podem ser excluídas.',
        });
      }

      await db
        .delete(receivables)
        .where(and(eq(receivables.id, id), eq(receivables.tenantId, tenantId)));

      return { success: true };
    },
  );

  fastify.post(
    '/:id/reverse',
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
      },
    },
    async (request, reply) => {
      const { tenantId } = request.user;
      const { id } = request.params as { id: string };

      const [existing] = await db
        .select({ status: receivables.status })
        .from(receivables)
        .where(and(eq(receivables.id, id), eq(receivables.tenantId, tenantId)))
        .limit(1);

      if (!existing) {
        return reply.status(404).send({ message: 'Conta a receber não encontrada.' });
      }
      if (existing.status !== 'recebido') {
        return reply.status(400).send({
          message: 'Somente contas recebidas podem ser estornadas.',
        });
      }

      const [updated] = await db
        .update(receivables)
        .set({
          receivedOn: null,
          receivedAmount: null,
          status: 'pendente',
        })
        .where(and(eq(receivables.id, id), eq(receivables.tenantId, tenantId)))
        .returning();

      return updated;
    },
  );
};
