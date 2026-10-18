import '../../types/fastify.ts';

import { catalogItems, measures } from '@erp-360/mod-catalog';
import { escapeIlike, type MeasureType, measureTypes } from '@erp-360/shared';
import { and, asc, desc, eq, or, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { db } from '../../db/index.ts';

const measureBodySchema = z
  .object({
    name: z.string().min(1, 'Informe o nome.').max(30),
    abbreviation: z.string().min(1, 'Informe a sigla.').max(6),
    measureType: z.enum(measureTypes),
    showOnProduct: z.boolean().optional().default(false),
    showOnService: z.boolean().optional().default(false),
    isActive: z.boolean().optional().default(true),
  })
  .superRefine((data, ctx) => {
    if (!data.name.trim()) {
      ctx.addIssue({ code: 'custom', path: ['name'], message: 'Informe o nome.' });
    }
    if (!data.abbreviation.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['abbreviation'],
        message: 'Informe a sigla.',
      });
    }
    if (!data.showOnProduct && !data.showOnService) {
      ctx.addIssue({
        code: 'custom',
        path: ['showOnProduct'],
        message: 'Marque produto, serviço ou os dois.',
      });
    }
  });

const listMeasuresQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  sortField: z.enum(['abbreviation', 'name']).default('abbreviation'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
  busca: z.string().optional(),
});

type MeasureBody = z.infer<typeof measureBodySchema>;

function toMeasureValues(data: MeasureBody) {
  return {
    name: data.name.trim(),
    abbreviation: data.abbreviation.trim().toUpperCase(),
    measureType: data.measureType,
    showOnProduct: data.showOnProduct ?? false,
    showOnService: data.showOnService ?? false,
    isActive: data.isActive ?? true,
  };
}

const measureColumns = {
  id: measures.id,
  name: measures.name,
  abbreviation: measures.abbreviation,
  measureType: measures.measureType,
  showOnProduct: measures.showOnProduct,
  showOnService: measures.showOnService,
  isActive: measures.isActive,
};

function serializeMeasure(row: {
  id: string;
  name: string;
  abbreviation: string;
  measureType: MeasureType;
  showOnProduct: boolean;
  showOnService: boolean;
  isActive: boolean;
}) {
  return row;
}

async function loadMeasure(tenantId: string, id: string) {
  const [row] = await db
    .select(measureColumns)
    .from(measures)
    .where(and(eq(measures.id, id), eq(measures.tenantId, tenantId)));
  return row ? serializeMeasure(row) : null;
}

export const measureRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('preHandler', fastify.autenticarETenant);

  fastify.get('/', { schema: { querystring: listMeasuresQuery } }, async (request) => {
    const { tenantId } = request.user;
    const { page, limit, sortField, sortOrder, busca: search } = request.query;
    const offset = (page - 1) * limit;
    const conditions = [eq(measures.tenantId, tenantId)];

    if (search?.trim()) {
      const like = `%${escapeIlike(search.trim())}%`;
      conditions.push(
        or(
          sql`unaccent(${measures.name}) ilike unaccent(${like})`,
          sql`${measures.abbreviation} ilike ${like}`,
        )!,
      );
    }

    const sortColumns = {
      abbreviation: measures.abbreviation,
      name: measures.name,
    } as const;
    const sortColumn = sortColumns[sortField];
    const orderBy =
      sortOrder === 'asc'
        ? [asc(sortColumn), asc(measures.id)]
        : [desc(sortColumn), asc(measures.id)];

    const data = await db
      .select(measureColumns)
      .from(measures)
      .where(and(...conditions))
      .orderBy(...orderBy)
      .limit(limit)
      .offset(offset);

    const [totalCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(measures)
      .where(and(...conditions));

    const total = Number(totalCount?.count || 0);
    return {
      data: data.map(serializeMeasure),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  });

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
      const measure = await loadMeasure(request.user.tenantId, request.params.id);
      if (!measure) return reply.status(404).send({ message: 'Medida não encontrada.' });
      return measure;
    },
  );

  fastify.post('/', { schema: { body: measureBodySchema } }, async (request, reply) => {
    const { tenantId } = request.user;
    const [created] = await db
      .insert(measures)
      .values({ ...toMeasureValues(request.body), tenantId })
      .returning({ id: measures.id });
    const measure = await loadMeasure(tenantId, created.id);
    return reply.status(201).send(measure);
  });

  fastify.put(
    '/:id',
    {
      schema: {
        params: z.object({
          id: z.string().uuid({ message: 'ID precisa ser um UUID válido' }),
        }),
        body: measureBodySchema,
      },
    },
    async (request, reply) => {
      const { tenantId } = request.user;
      const { id } = request.params;
      const current = await loadMeasure(tenantId, id);
      if (!current) return reply.status(404).send({ message: 'Medida não encontrada.' });

      await db
        .update(measures)
        .set(toMeasureValues(request.body))
        .where(and(eq(measures.id, id), eq(measures.tenantId, tenantId)));
      return loadMeasure(tenantId, id);
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
      const { id } = request.params;

      const [item] = await db
        .select({ id: catalogItems.id })
        .from(catalogItems)
        .where(and(eq(catalogItems.measureId, id), eq(catalogItems.tenantId, tenantId)))
        .limit(1);
      if (item) {
        return reply.status(400).send({
          message: 'Não é possível excluir esta medida porque ela está em uso.',
        });
      }

      const [deleted] = await db
        .delete(measures)
        .where(and(eq(measures.id, id), eq(measures.tenantId, tenantId)))
        .returning({ id: measures.id });
      if (!deleted) return reply.status(404).send({ message: 'Medida não encontrada.' });
      return { success: true };
    },
  );
};
