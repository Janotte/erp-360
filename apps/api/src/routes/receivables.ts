import { accountsReceivable } from '@erp-360/mod-financial';
import { and, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.ts';
import '../types/fastify.ts';

// Schemas de Validação com Zod
const createReceivableSchema = z.object({
  personId: z.string().uuid({ message: 'Person ID precisa ser um UUID válido' }),
  document: z.string().optional(),
  description: z.string().min(1, 'Descrição é obrigatória'),
  amount: z.number().int('O valor deve ser em centavos (inteiro)'),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de data deve ser YYYY-MM-DD'),
});

const receiveSchema = z.object({
  receiveDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de data deve ser YYYY-MM-DD'),
  amountReceived: z.number().int('O valor recebido deve ser em centavos (inteiro)'),
});

export const receivablesRoutes: FastifyPluginAsync = async (fastify) => {
  // Exige autenticação e injeta o tenantId em todas as rotas deste plugin
  fastify.addHook('preHandler', fastify.autenticarETenant);

  // 1. Lançar Conta a Receber
  fastify.post(
    '/',
    { schema: { body: createReceivableSchema } },
    async (request, reply) => {
      const { tenantId } = request.user;
      const data = request.body as z.infer<typeof createReceivableSchema>;

      const [newAccount] = await db
        .insert(accountsReceivable)
        .values({
          ...data,
          tenantId,
          status: 'pendente',
        })
        .returning();

      return reply.status(201).send(newAccount);
    },
  );

  // 2. Listar Contas a Receber do Tenant
  fastify.get('/', async (request) => {
    const { tenantId } = request.user;

    return db
      .select()
      .from(accountsReceivable)
      .where(eq(accountsReceivable.tenantId, tenantId));
  });

  // 3. Dar Baixa em Conta a Receber (Receber)
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
      const { receiveDate, amountReceived } = request.body as z.infer<
        typeof receiveSchema
      >;

      const [updatedAccount] = await db
        .update(accountsReceivable)
        .set({
          receiveDate,
          amountReceived,
          status: 'pago',
        })
        .where(
          and(eq(accountsReceivable.id, id), eq(accountsReceivable.tenantId, tenantId)),
        )
        .returning();

      if (!updatedAccount) {
        return reply.status(404).send({ message: 'Conta a receber não encontrada.' });
      }

      return updatedAccount;
    },
  );
};
