import { persons } from '@erp-360/mod-persons';
import { PersonSchema, type Person } from '@erp-360/shared';
import { and, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import '../types/fastify.js';
import { accountsPayable, accountsReceivable } from '@erp-360/mod-financial';

const listPersonsQuery = z.object({
  tipo: z.enum(['cliente', 'fornecedor', 'colaborador']).optional(),
});

export const personsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.autenticarETenant);

  // 1. Rota para Cadastrar uma Pessoa (Protegida por Tenant)
  fastify.post(
    '/',
    {
      preHandler: [fastify.autenticarETenant],
      schema: { body: PersonSchema },
    },
    async (request, reply) => {
      const { tenantId } = request.user;
      const data = request.body as Person;

      const [newPerson] = await db
        .insert(persons)
        .values({
          ...data,
          tenantId,
        })
        .returning();

      return reply.status(201).send(newPerson);
    },
  );

  // 2. Rota para Listar as persons do Tenant (com filtro opcional por tipo)
  fastify.get(
    '/',
    {
      preHandler: [fastify.autenticarETenant],
      schema: {
        querystring: listPersonsQuery,
      },
    },
    async (request) => {
      const { tenantId } = request.user;
      const { tipo } = request.query as z.infer<typeof listPersonsQuery>;

      const condicoes = [eq(persons.tenantId, tenantId)];

      if (tipo === 'cliente') condicoes.push(eq(persons.isClient, true));
      if (tipo === 'fornecedor') condicoes.push(eq(persons.isSupplier, true));
      if (tipo === 'colaborador') condicoes.push(eq(persons.isEmployee, true));

      return db
        .select()
        .from(persons)
        .where(and(...condicoes));
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

      const [person] = await db
        .select()
        .from(persons)
        .where(and(eq(persons.id, id), eq(persons.tenantId, tenantId)));

      if (!person) {
        return reply.status(404).send({ error: 'Pessoa não encontrada' });
      }

      return person;
    },
  );

  fastify.put(
    '/:id',
    {
      schema: {
        params: z.object({
          id: z.string().uuid({ message: 'ID precisa ser um UUID válido' }),
        }),
        body: PersonSchema,
      },
    },
    async (request, reply) => {
      const { tenantId } = request.user;
      const { id } = request.params as { id: string };
      const data = request.body as Person;

      const [person] = await db
        .update(persons)
        .set(data)
        .where(and(eq(persons.id, id), eq(persons.tenantId, tenantId)))
        .returning();

      if (!person) {
        return reply.status(404).send({ message: 'Pessoa não encontrada' });
      }

      return person;
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
        // 🌟 1. Verifica se a pessoa possui vínculos em contas a pagar
        const [hasPayable] = await db
          .select()
          .from(accountsPayable)
          .where(
            and(eq(accountsPayable.personId, id), eq(accountsPayable.tenantId, tenantId)),
          )
          .limit(1);

        // 🌟 2. Verifica se a pessoa possui vínculos em contas a receber
        const [hasReceivable] = await db
          .select()
          .from(accountsReceivable)
          .where(
            and(
              eq(accountsReceivable.personId, id),
              eq(accountsReceivable.tenantId, tenantId),
            ),
          )
          .limit(1);

        // Se houver qualquer vínculo, bloqueia e retorna erro 400
        if (hasPayable || hasReceivable) {
          return reply.status(400).send({
            message:
              'Não é possível excluir esta pessoa porque ela possui movimentações financeiras vinculadas.',
          });
        }

        // Executa a deleção garantindo que a pessoa pertence ao Tenant do usuário logado
        const [deletedPerson] = await db
          .delete(persons)
          .where(and(eq(persons.id, id), eq(persons.tenantId, tenantId)))
          .returning();

        // Se o ID não existir ou pertencer a outro tenant, o array retornará vazio
        if (!deletedPerson) {
          return reply.status(404).send({ message: 'Pessoa não encontrada' });
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
