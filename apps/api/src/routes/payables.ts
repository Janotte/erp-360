import { accountsPayable } from '@erp-360/mod-financial';
import { and, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.ts';
import '../types/fastify.ts';

// Schemas de Validação com Zod
const createPayableSchema = z.object({
  personId: z.string().uuid({ message: 'Person ID precisa ser um UUID válido' }),
  document: z.string().optional(),
  description: z.string().min(1, 'Descrição é obrigatória'),
  amount: z.number().int('O valor deve ser em centavos (inteiro)'),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de data deve ser YYYY-MM-DD'),
});

const paySchema = z.object({
  paymentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de data deve ser YYYY-MM-DD'),
  amountPaid: z.number().int('O valor pago deve ser em centavos (inteiro)'),
});

export const payablesRoutes: FastifyPluginAsync = async (fastify) => {
  // Exige autenticação e injeta o tenantId em todas as rotas deste plugin
  fastify.addHook('preHandler', fastify.autenticarETenant);

  // 1. Lançar Conta a Pagar
  fastify.post('/', { schema: { body: createPayableSchema } }, async (request, reply) => {
    const { tenantId } = request.user;
    const data = request.body as z.infer<typeof createPayableSchema>;

    const [newAccount] = await db
      .insert(accountsPayable)
      .values({
        ...data,
        tenantId,
        status: 'pendente',
      })
      .returning();

    return reply.status(201).send(newAccount);
  });

  // 2. Listar Contas a Pagar do Tenant
  fastify.get('/', async (request) => {
    const { tenantId } = request.user;

    return db
      .select()
      .from(accountsPayable)
      .where(eq(accountsPayable.tenantId, tenantId));
  });

  // 3. Dar Baixa em Conta a Pagar (Liquidar)
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
      const { paymentDate, amountPaid } = request.body as z.infer<typeof paySchema>;

      const [updatedAccount] = await db
        .update(accountsPayable)
        .set({
          paymentDate,
          amountPaid,
          status: 'pago',
        })
        .where(and(eq(accountsPayable.id, id), eq(accountsPayable.tenantId, tenantId)))
        .returning();

      if (!updatedAccount) {
        return reply.status(404).send({ message: 'Conta a pagar não encontrada.' });
      }

      return updatedAccount;
    },
  );
};
