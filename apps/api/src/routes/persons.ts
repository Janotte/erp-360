import { persons } from '@erp-360/mod-persons';
import { parseTaxpayerType, PersonSchema, type Person } from '@erp-360/shared';
import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import '../types/fastify.js';
import { payables, receivables } from '@erp-360/mod-financial';
import { personAddressRoutes } from './person-addresses.js';
import { personContactRoutes } from './person-contacts.js';

function emptyToNull(value?: string | null) {
  return value ? value : null;
}

function readTaxpayerType(person: object) {
  const row = person as Record<string, unknown>;
  return parseTaxpayerType(row.taxpayerType ?? row.taxpayer_type);
}

function serializePerson(person: typeof persons.$inferSelect) {
  return {
    ...person,
    taxpayerType: readTaxpayerType(person),
  };
}

function toPersonValues(data: Person) {
  return {
    name: data.name,
    taxId: emptyToNull(data.taxId),
    taxpayerType: parseTaxpayerType(data.taxpayerType),
    stateRegistration: emptyToNull(data.stateRegistration),
    isRuralProducer: data.isRuralProducer,
    birthDate: emptyToNull(data.birthDate),
    nfeEmail: emptyToNull(data.nfeEmail),
    documentEmails: data.documentEmails?.length ? data.documentEmails : null,
    notes: emptyToNull(data.notes),
    isActive: data.isActive,
    isVisible: data.isVisible,
    isClient: data.isClient,
    isSupplier: data.isSupplier,
    isEmployee: data.isEmployee,
  };
}

const listPersonsQuery = z.object({
  type: z.enum(['cliente', 'fornecedor', 'colaborador', 'instituicao']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  sortField: z.enum(['nome', 'createdAt']).default('nome'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
  busca: z.string().optional(),
});

export const personsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.autenticarETenant);
  await fastify.register(personAddressRoutes);
  await fastify.register(personContactRoutes);

  // 1. Rota para Cadastrar uma Pessoa (Protegida por Tenant)
  fastify.post(
    '/',
    {
      schema: { body: PersonSchema },
    },
    async (request, reply) => {
      const { tenantId } = request.user;
      const data = request.body as Person;

      const [newPerson] = await db
        .insert(persons)
        .values({
          ...toPersonValues(data),
          tenantId,
        })
        .returning();

      return reply.status(201).send(serializePerson(newPerson));
    },
  );

  // 2. Rota para Listar as persons do Tenant (com filtro opcional por tipo)
  fastify.get(
    '/',
    {
      schema: { querystring: listPersonsQuery },
    },
    async (request, reply) => {
      const { tenantId } = request.user;
      const {
        page,
        limit,
        sortField,
        sortOrder,
        type,
        busca: search,
      } = request.query as z.infer<typeof listPersonsQuery>;

      const offset = (page - 1) * limit;
      const conditions = [eq(persons.tenantId, tenantId)];

      // 1. Filtros por Perfil
      if (type === 'cliente') conditions.push(eq(persons.isClient, true));
      if (type === 'fornecedor') conditions.push(eq(persons.isSupplier, true));
      if (type === 'colaborador') conditions.push(eq(persons.isEmployee, true));
      if (type === 'instituicao')
        conditions.push(eq(persons.isFinancialInstitution, true));

      // 2. Filtro por Busca Textual (Nome, CPF/CNPJ ou e-mail da NF-e)
      if (search) {
        conditions.push(
          or(
            ilike(persons.name, `%${search}%`),
            ilike(persons.taxId, `%${search}%`),
            ilike(persons.nfeEmail, `%${search}%`),
          )!,
        );
      }

      // 3. Configuração de Ordenação Dinâmica
      const sortColumns = {
        nome: persons.name,
        createdAt: persons.createdAt,
      } as const;
      const sortColumn = sortColumns[sortField];
      const orderBy = sortOrder === 'asc' ? [asc(sortColumn)] : [desc(sortColumn)];

      // 4. Executa a Query trazendo os dados paginados
      const data = await db
        .select()
        .from(persons)
        .where(and(...conditions))
        .orderBy(...orderBy)
        .limit(limit)
        .offset(offset);

      // 5. Conta o total de registros para o Front saber o limite de páginas
      const [totalCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(persons)
        .where(and(...conditions));

      // Retorna a estrutura envelopada com os metadados de paginação
      return reply.send({
        data: data.map(serializePerson),
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

      const [person] = await db
        .select()
        .from(persons)
        .where(and(eq(persons.id, id), eq(persons.tenantId, tenantId)));

      if (!person) {
        return reply.status(404).send({ error: 'Pessoa não encontrada' });
      }

      return serializePerson(person);
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
        .set(toPersonValues(data))
        .where(and(eq(persons.id, id), eq(persons.tenantId, tenantId)))
        .returning();

      if (!person) {
        return reply.status(404).send({ message: 'Pessoa não encontrada' });
      }

      return serializePerson(person);
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
          .select()
          .from(payables)
          .where(and(eq(payables.creditorId, id), eq(payables.tenantId, tenantId)))
          .limit(1);

        const [hasReceivable] = await db
          .select()
          .from(receivables)
          .where(and(eq(receivables.debtorId, id), eq(receivables.tenantId, tenantId)))
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
