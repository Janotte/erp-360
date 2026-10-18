import '../../types/fastify.ts';

import { catalogCategories, catalogItems } from '@erp-360/mod-catalog';
import { escapeIlike } from '@erp-360/shared';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { db } from '../../db/index.ts';

const categoryBodySchema = z
  .object({
    name: z.string().min(1, 'Informe o nome.').max(80),
    description: z.string().max(2000).nullable().optional(),
    parentId: z.string().uuid().nullable().optional(),
    isActive: z.boolean().optional().default(true),
  })
  .superRefine((data, ctx) => {
    if (!data.name.trim()) {
      ctx.addIssue({ code: 'custom', path: ['name'], message: 'Informe o nome.' });
    }
  });

const listCategoriesQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  sortField: z.enum(['name']).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
  busca: z.string().optional(),
});

const parentCategory = alias(catalogCategories, 'parent_category');

type CategoryNode = {
  id: string;
  name: string;
  parentId: string | null;
};

type CategoryBody = z.infer<typeof categoryBodySchema>;

function toCategoryValues(data: CategoryBody) {
  const description = data.description?.trim() ?? '';
  return {
    name: data.name.trim(),
    description: description || null,
    parentId: data.parentId ?? null,
    isActive: data.isActive ?? true,
  };
}

async function loadTree(tenantId: string): Promise<CategoryNode[]> {
  return db
    .select({
      id: catalogCategories.id,
      name: catalogCategories.name,
      parentId: catalogCategories.parentId,
    })
    .from(catalogCategories)
    .where(eq(catalogCategories.tenantId, tenantId));
}

function blockedIds(rows: CategoryNode[], rootId: string) {
  const children = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.parentId) continue;
    const list = children.get(row.parentId) ?? [];
    list.push(row.id);
    children.set(row.parentId, list);
  }

  const blocked = new Set<string>([rootId]);
  const stack = [rootId];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    for (const child of children.get(current) ?? []) {
      if (blocked.has(child)) continue;
      blocked.add(child);
      stack.push(child);
    }
  }
  return blocked;
}

function categoryPath(rows: CategoryNode[], id: string) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const parts: string[] = [];
  const seen = new Set<string>();
  let current: string | null = id;
  while (current && !seen.has(current)) {
    seen.add(current);
    const row = byId.get(current);
    if (!row) break;
    parts.push(row.name);
    current = row.parentId;
  }
  return parts.reverse().join(' / ');
}

async function parentProblem(
  tenantId: string,
  categoryId: string | null,
  parentId: string | null,
) {
  if (!parentId) return null;
  if (categoryId && parentId === categoryId) {
    return 'A categoria não pode ser pai de si mesma.';
  }

  const rows = await loadTree(tenantId);
  const byId = new Map(rows.map((row) => [row.id, row]));
  if (!byId.has(parentId)) return 'A categoria pai informada não existe.';

  const seen = new Set<string>();
  let current: string | null = parentId;
  while (current) {
    if (categoryId && current === categoryId) {
      return 'A categoria pai não pode ser uma subcategoria desta.';
    }
    if (seen.has(current)) break;
    seen.add(current);
    current = byId.get(current)?.parentId ?? null;
  }
  return null;
}

const categoryColumns = {
  id: catalogCategories.id,
  name: catalogCategories.name,
  description: catalogCategories.description,
  parentId: catalogCategories.parentId,
  parentName: parentCategory.name,
  isActive: catalogCategories.isActive,
};

async function loadCategory(tenantId: string, id: string) {
  const [row] = await db
    .select(categoryColumns)
    .from(catalogCategories)
    .leftJoin(
      parentCategory,
      and(
        eq(parentCategory.id, catalogCategories.parentId),
        eq(parentCategory.tenantId, catalogCategories.tenantId),
      ),
    )
    .where(and(eq(catalogCategories.id, id), eq(catalogCategories.tenantId, tenantId)));
  return row ?? null;
}

export const categoryRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('preHandler', fastify.autenticarETenant);

  fastify.get('/', { schema: { querystring: listCategoriesQuery } }, async (request) => {
    const { tenantId } = request.user;
    const { page, limit, sortOrder, busca: search } = request.query;
    const offset = (page - 1) * limit;
    const conditions = [eq(catalogCategories.tenantId, tenantId)];

    if (search?.trim()) {
      const like = `%${escapeIlike(search.trim())}%`;
      conditions.push(sql`unaccent(${catalogCategories.name}) ilike unaccent(${like})`);
    }

    const orderBy =
      sortOrder === 'asc'
        ? [asc(catalogCategories.name), asc(catalogCategories.id)]
        : [desc(catalogCategories.name), asc(catalogCategories.id)];

    const data = await db
      .select(categoryColumns)
      .from(catalogCategories)
      .leftJoin(
        parentCategory,
        and(
          eq(parentCategory.id, catalogCategories.parentId),
          eq(parentCategory.tenantId, catalogCategories.tenantId),
        ),
      )
      .where(and(...conditions))
      .orderBy(...orderBy)
      .limit(limit)
      .offset(offset);

    const [totalCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(catalogCategories)
      .where(and(...conditions));

    const total = Number(totalCount?.count || 0);
    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  });

  fastify.get(
    '/options',
    {
      schema: {
        querystring: z.object({
          exclude: z.string().uuid().optional(),
        }),
      },
    },
    async (request) => {
      const rows = await loadTree(request.user.tenantId);
      const blocked = request.query.exclude
        ? blockedIds(rows, request.query.exclude)
        : new Set<string>();
      return rows
        .filter((row) => !blocked.has(row.id))
        .map((row) => ({
          id: row.id,
          name: row.name,
          parentId: row.parentId,
          path: categoryPath(rows, row.id),
        }))
        .sort((left, right) => left.path.localeCompare(right.path, 'pt-BR'));
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
      const category = await loadCategory(request.user.tenantId, request.params.id);
      if (!category) {
        return reply.status(404).send({ message: 'Categoria não encontrada.' });
      }
      return category;
    },
  );

  fastify.post('/', { schema: { body: categoryBodySchema } }, async (request, reply) => {
    const { tenantId } = request.user;
    const values = toCategoryValues(request.body);
    const problem = await parentProblem(tenantId, null, values.parentId);
    if (problem) return reply.status(400).send({ message: problem });

    const [created] = await db
      .insert(catalogCategories)
      .values({ ...values, tenantId })
      .returning({ id: catalogCategories.id });
    const category = await loadCategory(tenantId, created.id);
    return reply.status(201).send(category);
  });

  fastify.put(
    '/:id',
    {
      schema: {
        params: z.object({
          id: z.string().uuid({ message: 'ID precisa ser um UUID válido' }),
        }),
        body: categoryBodySchema,
      },
    },
    async (request, reply) => {
      const { tenantId } = request.user;
      const { id } = request.params;
      const current = await loadCategory(tenantId, id);
      if (!current) {
        return reply.status(404).send({ message: 'Categoria não encontrada.' });
      }

      const values = toCategoryValues(request.body);
      const problem = await parentProblem(tenantId, id, values.parentId);
      if (problem) return reply.status(400).send({ message: problem });

      await db
        .update(catalogCategories)
        .set(values)
        .where(
          and(eq(catalogCategories.id, id), eq(catalogCategories.tenantId, tenantId)),
        );
      return loadCategory(tenantId, id);
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

      const [child] = await db
        .select({ id: catalogCategories.id })
        .from(catalogCategories)
        .where(
          and(
            eq(catalogCategories.parentId, id),
            eq(catalogCategories.tenantId, tenantId),
          ),
        )
        .limit(1);
      if (child) {
        return reply.status(400).send({
          message:
            'Não é possível excluir esta categoria porque ela possui subcategorias.',
        });
      }

      const [item] = await db
        .select({ id: catalogItems.id })
        .from(catalogItems)
        .where(and(eq(catalogItems.categoryId, id), eq(catalogItems.tenantId, tenantId)))
        .limit(1);
      if (item) {
        return reply.status(400).send({
          message: 'Não é possível excluir esta categoria porque ela está em uso.',
        });
      }

      const [deleted] = await db
        .delete(catalogCategories)
        .where(
          and(eq(catalogCategories.id, id), eq(catalogCategories.tenantId, tenantId)),
        )
        .returning({ id: catalogCategories.id });
      if (!deleted) {
        return reply.status(404).send({ message: 'Categoria não encontrada.' });
      }
      return { success: true };
    },
  );
};
