import { payables, planAccounts, receivables } from '@erp-360/mod-financial';
import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.ts';
import '../types/fastify.ts';

const planAccountBodySchema = z.object({
  accountCode: z.string().min(1, 'Código é obrigatório').max(30),
  name: z.string().min(1, 'Nome é obrigatório').max(120),
  accountingDescription: z.string().max(60).optional().nullable(),
  accountIdentifier: z.string().max(10).optional().nullable(),
  accountingAccountCode: z.string().max(20).optional().nullable(),
});

const listPlanAccountsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  sortField: z.enum(['accountCode', 'name']).default('accountCode'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
  busca: z.string().optional(),
});

function emptyToNull(value?: string | null) {
  return value ? value : null;
}

function toPlanAccountValues(data: z.infer<typeof planAccountBodySchema>) {
  return {
    accountCode: data.accountCode.trim(),
    name: data.name.trim(),
    accountingDescription: emptyToNull(data.accountingDescription),
    accountIdentifier: emptyToNull(data.accountIdentifier),
    accountingAccountCode: emptyToNull(data.accountingAccountCode),
  };
}

export const planAccountsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.autenticarETenant);

  fastify.post(
    '/',
    { schema: { body: planAccountBodySchema } },
    async (request, reply) => {
      const { tenantId } = request.user;
      const data = request.body as z.infer<typeof planAccountBodySchema>;

      try {
        const [created] = await db
          .insert(planAccounts)
          .values({
            ...toPlanAccountValues(data),
            tenantId,
          })
          .returning();

        return reply.status(201).send(created);
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code === '23505') {
          return reply.status(400).send({
            message: 'Já existe um plano de contas com este código.',
          });
        }
        throw error;
      }
    },
  );

  fastify.get(
    '/',
    { schema: { querystring: listPlanAccountsQuery } },
    async (request, reply) => {
      const { tenantId } = request.user;
      const {
        page,
        limit,
        sortField,
        sortOrder,
        busca: search,
      } = request.query as z.infer<typeof listPlanAccountsQuery>;

      const offset = (page - 1) * limit;
      const conditions = [eq(planAccounts.tenantId, tenantId)];

      if (search) {
        conditions.push(
          or(
            ilike(planAccounts.accountCode, `%${search}%`),
            ilike(planAccounts.name, `%${search}%`),
          )!,
        );
      }

      const sortColumns = {
        accountCode: planAccounts.accountCode,
        name: planAccounts.name,
      } as const;
      const sortColumn = sortColumns[sortField];
      const orderBy = sortOrder === 'asc' ? [asc(sortColumn)] : [desc(sortColumn)];

      const data = await db
        .select()
        .from(planAccounts)
        .where(and(...conditions))
        .orderBy(...orderBy)
        .limit(limit)
        .offset(offset);

      const [totalCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(planAccounts)
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
    '/:id',
    {
      schema: {
        params: z.object({
          id: z.string().uuid({ message: 'ID precisa ser um UUID válido' }),
        }),
      },
    },
    async (request, reply) => {
      const { tenantId } = request.user;
      const { id } = request.params as { id: string };

      const [account] = await db
        .select()
        .from(planAccounts)
        .where(and(eq(planAccounts.id, id), eq(planAccounts.tenantId, tenantId)));

      if (!account) {
        return reply.status(404).send({ message: 'Plano de contas não encontrado.' });
      }

      return account;
    },
  );

  fastify.put(
    '/:id',
    {
      schema: {
        params: z.object({
          id: z.string().uuid({ message: 'ID precisa ser um UUID válido' }),
        }),
        body: planAccountBodySchema,
      },
    },
    async (request, reply) => {
      const { tenantId } = request.user;
      const { id } = request.params as { id: string };
      const data = request.body as z.infer<typeof planAccountBodySchema>;

      try {
        const [updated] = await db
          .update(planAccounts)
          .set(toPlanAccountValues(data))
          .where(and(eq(planAccounts.id, id), eq(planAccounts.tenantId, tenantId)))
          .returning();

        if (!updated) {
          return reply.status(404).send({ message: 'Plano de contas não encontrado.' });
        }

        return updated;
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code === '23505') {
          return reply.status(400).send({
            message: 'Já existe um plano de contas com este código.',
          });
        }
        throw error;
      }
    },
  );

  fastify.delete(
    '/:id',
    {
      schema: {
        params: z.object({
          id: z.string().uuid({ message: 'ID precisa ser um UUID válido' }),
        }),
      },
    },
    async (request, reply) => {
      const { tenantId } = request.user;
      const { id } = request.params as { id: string };

      try {
        const [hasPayable] = await db
          .select({ id: payables.id })
          .from(payables)
          .where(and(eq(payables.planAccountId, id), eq(payables.tenantId, tenantId)))
          .limit(1);

        const [hasReceivable] = await db
          .select({ id: receivables.id })
          .from(receivables)
          .where(
            and(eq(receivables.planAccountId, id), eq(receivables.tenantId, tenantId)),
          )
          .limit(1);

        if (hasPayable || hasReceivable) {
          return reply.status(400).send({
            message:
              'Não é possível excluir este plano de contas porque ele possui lançamentos financeiros vinculados.',
          });
        }

        const [deleted] = await db
          .delete(planAccounts)
          .where(and(eq(planAccounts.id, id), eq(planAccounts.tenantId, tenantId)))
          .returning();

        if (!deleted) {
          return reply.status(404).send({ message: 'Plano de contas não encontrado.' });
        }

        return { success: true };
      } catch (error) {
        fastify.log.error(error);
        return reply
          .status(500)
          .send({ message: 'Erro interno ao tentar excluir o registro.' });
      }
    },
  );
};
