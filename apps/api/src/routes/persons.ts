import { persons } from '@erp-360/mod-persons';
import {
  emptyToNull,
  escapeIlike,
  isValidCnpj,
  isValidCpf,
  normalizeEmail,
  normalizePersonName,
  normalizeTaxId,
  onlyDigits,
  parsePersonKind,
  parseTaxpayerType,
  PersonSchema,
  type Person,
} from '@erp-360/shared';
import { and, asc, desc, eq, or, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import '../types/fastify.js';
import { payables, receivables } from '@erp-360/mod-financial';
import { personAddressRoutes } from './person-addresses.js';
import { personContactRoutes } from './person-contacts.js';

function personDocumentError(data: Person) {
  const taxId = data.taxId?.trim();
  if (!taxId) return null;
  const type = parsePersonKind(data.type);
  if (type === 'individual' && !isValidCpf(taxId)) return 'CPF inválido';
  if (type === 'company' && !isValidCnpj(taxId)) return 'CNPJ inválido';
  return null;
}

function readTaxpayerType(person: object) {
  const row = person as Record<string, unknown>;
  return parseTaxpayerType(row.taxpayerType ?? row.taxpayer_type);
}

function serializePerson(person: typeof persons.$inferSelect) {
  return {
    ...person,
    taxpayerType:
      person.type === 'individual' ? 9 : readTaxpayerType(person),
  };
}

function toPersonValues(data: Person) {
  const type = parsePersonKind(data.type);
  const documentEmails = (data.documentEmails ?? [])
    .map((email) => normalizeEmail(email))
    .filter(Boolean);
  return {
    type,
    name: normalizePersonName(data.name, Boolean(data.preserveNameCasing)),
    preserveNameCasing: Boolean(data.preserveNameCasing),
    taxId: emptyToNull(normalizeTaxId(type, data.taxId)),
    taxpayerType: type === 'individual' ? 9 : parseTaxpayerType(data.taxpayerType),
    stateRegistration: emptyToNull(data.stateRegistration),
    isRuralProducer: data.isRuralProducer,
    birthDate: emptyToNull(data.birthDate),
    nfeEmail: emptyToNull(normalizeEmail(data.nfeEmail)),
    documentEmails: documentEmails.length ? documentEmails : null,
    notes: emptyToNull(data.notes),
    isActive: data.isActive,
    isVisible: data.isVisible,
    isClient: data.isClient,
    isSupplier: data.isSupplier,
    isEmployee: data.isEmployee,
    isFinancialInstitution: Boolean(data.isFinancialInstitution),
  };
}

const personTypeEnum = z.enum([
  'cliente',
  'fornecedor',
  'colaborador',
  'instituicao',
]);

function normalizePersonTypes(value: unknown) {
  if (value == null || value === '') return undefined;
  const parts = Array.isArray(value) ? value : [value];
  const types = parts
    .flatMap((item) => String(item).split(','))
    .map((item) => item.trim())
    .filter(Boolean);
  return types.length ? types : undefined;
}

function personTypeCondition(type: z.infer<typeof personTypeEnum>) {
  if (type === 'cliente') return eq(persons.isClient, true);
  if (type === 'fornecedor') return eq(persons.isSupplier, true);
  if (type === 'colaborador') return eq(persons.isEmployee, true);
  return eq(persons.isFinancialInstitution, true);
}

const listPersonsQuery = z.object({
  type: z.preprocess(normalizePersonTypes, z.array(personTypeEnum).optional()),
  kind: z.enum(['individual', 'company', 'foreigner']).optional(),
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
      const documentError = personDocumentError(data);
      if (documentError) {
        return reply.status(400).send({ message: documentError });
      }

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
        kind,
        busca: search,
      } = request.query as z.infer<typeof listPersonsQuery>;

      const offset = (page - 1) * limit;
      const conditions = [eq(persons.tenantId, tenantId)];

      // 1. Filtros por Perfil (OR quando há mais de um tipo)
      if (type?.length) {
        const typeFilters = type.map(personTypeCondition);
        conditions.push(
          typeFilters.length === 1 ? typeFilters[0] : or(...typeFilters)!,
        );
      }

      if (kind) conditions.push(eq(persons.type, kind));

      // 2. Filtro por Busca Textual (Nome, CPF/CNPJ ou e-mail da NF-e)
      if (search?.trim()) {
        const term = search.trim();
        const like = `%${escapeIlike(term)}%`;
        const digits = onlyDigits(term);
        conditions.push(
          or(
            sql`unaccent(${persons.name}) ilike unaccent(${like})`,
            sql`unaccent(coalesce(${persons.nfeEmail}, '')) ilike unaccent(${like})`,
            digits ? sql`coalesce(${persons.taxId}, '') like ${`%${digits}%`}` : sql`false`,
          )!,
        );
      }

      // 3. Configuração de Ordenação Dinâmica
      const sortColumns = {
        nome: persons.name,
        createdAt: persons.createdAt,
      } as const;
      const sortColumn = sortColumns[sortField];
      const orderBy =
        sortOrder === 'asc'
          ? [asc(sortColumn), asc(persons.id)]
          : [desc(sortColumn), asc(persons.id)];

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
      const documentError = personDocumentError(data);
      if (documentError) {
        return reply.status(400).send({ message: documentError });
      }

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
