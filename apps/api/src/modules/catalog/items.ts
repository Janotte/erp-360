import '../../types/fastify.ts';

import {
  catalogCategories,
  catalogItemCounters,
  catalogItems,
  measures,
  ncms,
} from '@erp-360/mod-catalog';
import {
  type CatalogItemType,
  catalogItemTypes,
  escapeIlike,
  fiscalItemTypes,
} from '@erp-360/shared';
import { and, asc, desc, eq, or, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { db } from '../../db/index.ts';

const itemCodeLimit = 999999;

const itemBodySchema = z
  .object({
    sku: z.string().max(60).nullable().optional(),
    name: z.string().min(1, 'Informe o nome.').max(120),
    type: z.enum(catalogItemTypes),
    fiscalItemType: z.enum(fiscalItemTypes),
    tracksStock: z.boolean().optional(),
    categoryId: z.string().uuid().nullable().optional(),
    measureId: z.string().uuid({ message: 'Informe a medida.' }),
    description: z.string().max(2000).nullable().optional(),
    barcode: z.string().max(20).nullable().optional(),
    listPrice: z.string().max(20).nullable().optional(),
    ncmCode: z.string().max(12).nullable().optional(),
    cestCode: z.string().max(10).nullable().optional(),
    netWeightKg: z.string().max(20).nullable().optional(),
    grossWeightKg: z.string().max(20).nullable().optional(),
    lengthCm: z.string().max(20).nullable().optional(),
    widthCm: z.string().max(20).nullable().optional(),
    heightCm: z.string().max(20).nullable().optional(),
    isActive: z.boolean().optional().default(true),
  })
  .superRefine((data, ctx) => {
    if (!data.name.trim()) {
      ctx.addIssue({ code: 'custom', path: ['name'], message: 'Informe o nome.' });
    }
  });

const listItemsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  sortField: z.enum(['code', 'name']).default('code'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
  busca: z.string().optional(),
});

type ItemBody = z.infer<typeof itemBodySchema>;

type DecimalResult = { ok: true; value: string | null } | { ok: false };

function onlyDigits(value: string | null | undefined) {
  return (value ?? '').replace(/\D/g, '');
}

function parseDecimal(
  value: string | null | undefined,
  scale: number,
  precision: number,
): DecimalResult {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return { ok: true, value: null };
  const normalized = trimmed.replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) return { ok: false };
  const [ints, frac = ''] = normalized.split('.');
  if (frac.length > scale || ints.length > precision - scale) return { ok: false };
  const whole = ints.replace(/^0+(?=\d)/, '');
  return { ok: true, value: frac ? `${whole}.${frac}` : whole };
}

function normalizeNcm(value: string | null | undefined) {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, '');
  const code =
    digits.length === 8
      ? `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6)}`
      : trimmed;
  return /^[0-9]{4}\.[0-9]{2}\.[0-9]{2}$/.test(code) ? code : null;
}

function formatItemCode(value: number) {
  return String(value).padStart(6, '0');
}

async function nextItemCode(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  tenantId: string,
) {
  const [created] = await tx
    .insert(catalogItemCounters)
    .values({ tenantId, lastNumber: 1 })
    .onConflictDoNothing({ target: catalogItemCounters.tenantId })
    .returning({ lastNumber: catalogItemCounters.lastNumber });
  if (created) return formatItemCode(created.lastNumber);

  const [updated] = await tx
    .update(catalogItemCounters)
    .set({ lastNumber: sql`${catalogItemCounters.lastNumber} + 1` })
    .where(
      and(
        eq(catalogItemCounters.tenantId, tenantId),
        sql`${catalogItemCounters.lastNumber} < ${itemCodeLimit}`,
      ),
    )
    .returning({ lastNumber: catalogItemCounters.lastNumber });
  if (!updated) return null;
  return formatItemCode(updated.lastNumber);
}

function buildItemValues(
  data: ItemBody,
): { values: ReturnType<typeof itemValues> } | { message: string } {
  const name = data.name.trim();
  const sku = data.sku?.trim() ?? '';
  if (!name) return { message: 'Informe o nome.' };
  if (data.type === 'service' && data.fiscalItemType !== 'service') {
    return { message: 'Serviço usa o tipo fiscal 09 Serviços.' };
  }
  if (data.type === 'product' && data.fiscalItemType === 'service') {
    return { message: 'Produto não usa o tipo fiscal de serviço.' };
  }

  const barcode = onlyDigits(data.barcode);
  if (barcode && !/^[0-9]{8}$|^[0-9]{12,14}$/.test(barcode)) {
    return { message: 'O código de barras precisa ter 8, 12, 13 ou 14 dígitos.' };
  }
  const cestCode = onlyDigits(data.cestCode);
  if (cestCode && !/^[0-9]{7}$/.test(cestCode)) {
    return { message: 'O CEST precisa ter 7 dígitos.' };
  }
  if (data.ncmCode?.trim() && !normalizeNcm(data.ncmCode)) {
    return { message: 'Informe a NCM no formato 0000.00.00.' };
  }

  const listPrice = parseDecimal(data.listPrice, 4, 15);
  if (!listPrice.ok) {
    return { message: 'Informe o preço de tabela com até 4 casas decimais.' };
  }
  const netWeightKg = parseDecimal(data.netWeightKg, 3, 12);
  if (!netWeightKg.ok) {
    return { message: 'Informe o peso líquido com até 3 casas decimais.' };
  }
  const grossWeightKg = parseDecimal(data.grossWeightKg, 3, 12);
  if (!grossWeightKg.ok) {
    return { message: 'Informe o peso bruto com até 3 casas decimais.' };
  }
  const lengthCm = parseDecimal(data.lengthCm, 2, 8);
  if (!lengthCm.ok) return { message: 'Informe o comprimento com até 2 casas decimais.' };
  const widthCm = parseDecimal(data.widthCm, 2, 8);
  if (!widthCm.ok) return { message: 'Informe a largura com até 2 casas decimais.' };
  const heightCm = parseDecimal(data.heightCm, 2, 8);
  if (!heightCm.ok) return { message: 'Informe a altura com até 2 casas decimais.' };

  const description = data.description?.trim() ?? '';
  return {
    values: itemValues({
      sku: sku || null,
      name,
      type: data.type,
      fiscalItemType: data.fiscalItemType,
      tracksStock:
        data.type === 'service' || data.fiscalItemType === 'fixed_asset'
          ? false
          : (data.tracksStock ?? true),
      categoryId: data.categoryId ?? null,
      measureId: data.measureId,
      description: description || null,
      barcode: barcode || null,
      listPrice: listPrice.value,
      ncmCode: normalizeNcm(data.ncmCode),
      cestCode: cestCode || null,
      netWeightKg: netWeightKg.value,
      grossWeightKg: grossWeightKg.value,
      lengthCm: lengthCm.value,
      widthCm: widthCm.value,
      heightCm: heightCm.value,
      isActive: data.isActive ?? true,
    }),
  };
}

function itemValues(values: {
  sku: string | null;
  name: string;
  type: CatalogItemType;
  fiscalItemType: ItemBody['fiscalItemType'];
  tracksStock: boolean;
  categoryId: string | null;
  measureId: string;
  description: string | null;
  barcode: string | null;
  listPrice: string | null;
  ncmCode: string | null;
  cestCode: string | null;
  netWeightKg: string | null;
  grossWeightKg: string | null;
  lengthCm: string | null;
  widthCm: string | null;
  heightCm: string | null;
  isActive: boolean;
}) {
  return values;
}

async function relationProblem(
  tenantId: string,
  values: ReturnType<typeof itemValues>,
  current: { measureId: string; ncmCode: string | null } | null,
) {
  if (values.categoryId) {
    const [category] = await db
      .select({ id: catalogCategories.id })
      .from(catalogCategories)
      .where(
        and(
          eq(catalogCategories.id, values.categoryId),
          eq(catalogCategories.tenantId, tenantId),
        ),
      );
    if (!category) return 'A categoria informada não existe.';
  }

  const [measure] = await db
    .select({
      id: measures.id,
      isActive: measures.isActive,
      showOnProduct: measures.showOnProduct,
      showOnService: measures.showOnService,
    })
    .from(measures)
    .where(and(eq(measures.id, values.measureId), eq(measures.tenantId, tenantId)));
  if (!measure) return 'A medida informada não existe.';
  const keepsMeasure = current?.measureId === values.measureId;
  if (!keepsMeasure) {
    if (!measure.isActive) return 'A medida informada está inativa.';
    const visible =
      values.type === 'product' ? measure.showOnProduct : measure.showOnService;
    if (!visible) {
      return values.type === 'product'
        ? 'Esta medida não aparece em produto.'
        : 'Esta medida não aparece em serviço.';
    }
  }

  if (values.ncmCode && values.ncmCode !== current?.ncmCode) {
    const [ncm] = await db
      .select({ code: ncms.code, isActive: ncms.isActive })
      .from(ncms)
      .where(eq(ncms.code, values.ncmCode));
    if (!ncm) return 'A NCM informada não existe.';
    if (!ncm.isActive) return 'A NCM informada não está vigente.';
  }
  return null;
}

const itemColumns = {
  id: catalogItems.id,
  code: catalogItems.code,
  sku: catalogItems.sku,
  name: catalogItems.name,
  type: catalogItems.type,
  fiscalItemType: catalogItems.fiscalItemType,
  tracksStock: catalogItems.tracksStock,
  categoryId: catalogItems.categoryId,
  categoryName: catalogCategories.name,
  measureId: catalogItems.measureId,
  measureAbbreviation: measures.abbreviation,
  measureName: measures.name,
  description: catalogItems.description,
  barcode: catalogItems.barcode,
  listPrice: catalogItems.listPrice,
  ncmCode: catalogItems.ncmCode,
  ncmDescription: ncms.description,
  cestCode: catalogItems.cestCode,
  netWeightKg: catalogItems.netWeightKg,
  grossWeightKg: catalogItems.grossWeightKg,
  lengthCm: catalogItems.lengthCm,
  widthCm: catalogItems.widthCm,
  heightCm: catalogItems.heightCm,
  isActive: catalogItems.isActive,
};

function itemQuery() {
  return db
    .select(itemColumns)
    .from(catalogItems)
    .innerJoin(
      measures,
      and(
        eq(measures.id, catalogItems.measureId),
        eq(measures.tenantId, catalogItems.tenantId),
      ),
    )
    .leftJoin(
      catalogCategories,
      and(
        eq(catalogCategories.id, catalogItems.categoryId),
        eq(catalogCategories.tenantId, catalogItems.tenantId),
      ),
    )
    .leftJoin(ncms, eq(ncms.code, catalogItems.ncmCode));
}

async function loadItem(tenantId: string, id: string) {
  const [row] = await itemQuery().where(
    and(eq(catalogItems.id, id), eq(catalogItems.tenantId, tenantId)),
  );
  return row ?? null;
}

export const itemRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('preHandler', fastify.autenticarETenant);

  fastify.get('/', { schema: { querystring: listItemsQuery } }, async (request) => {
    const { tenantId } = request.user;
    const { page, limit, sortField, sortOrder, busca: search } = request.query;
    const offset = (page - 1) * limit;
    const conditions = [eq(catalogItems.tenantId, tenantId)];

    if (search?.trim()) {
      const like = `%${escapeIlike(search.trim())}%`;
      conditions.push(
        or(
          sql`unaccent(${catalogItems.name}) ilike unaccent(${like})`,
          sql`${catalogItems.code} ilike ${like}`,
          sql`${catalogItems.sku} ilike ${like}`,
          sql`${catalogItems.barcode} ilike ${like}`,
        )!,
      );
    }

    const sortColumn = sortField === 'name' ? catalogItems.name : catalogItems.code;
    const orderBy =
      sortOrder === 'asc'
        ? [asc(sortColumn), asc(catalogItems.id)]
        : [desc(sortColumn), asc(catalogItems.id)];

    const data = await itemQuery()
      .where(and(...conditions))
      .orderBy(...orderBy)
      .limit(limit)
      .offset(offset);

    const [totalCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(catalogItems)
      .where(and(...conditions));

    const total = Number(totalCount?.count || 0);
    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
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
      const item = await loadItem(request.user.tenantId, request.params.id);
      if (!item) return reply.status(404).send({ message: 'Item não encontrado.' });
      return item;
    },
  );

  fastify.post('/', { schema: { body: itemBodySchema } }, async (request, reply) => {
    const { tenantId } = request.user;
    const built = buildItemValues(request.body);
    if ('message' in built) return reply.status(400).send({ message: built.message });
    const problem = await relationProblem(tenantId, built.values, null);
    if (problem) return reply.status(400).send({ message: problem });

    const created = await db.transaction(async (tx) => {
      const code = await nextItemCode(tx, tenantId);
      if (!code) return null;
      const [row] = await tx
        .insert(catalogItems)
        .values({ ...built.values, code, tenantId })
        .returning({ id: catalogItems.id });
      return row;
    });
    if (!created) {
      return reply.status(400).send({
        message: 'O código do item chegou ao limite 999999.',
      });
    }
    return reply.status(201).send(await loadItem(tenantId, created.id));
  });

  fastify.put(
    '/:id',
    {
      schema: {
        params: z.object({
          id: z.string().uuid({ message: 'ID precisa ser um UUID válido' }),
        }),
        body: itemBodySchema,
      },
    },
    async (request, reply) => {
      const { tenantId } = request.user;
      const { id } = request.params;
      const current = await loadItem(tenantId, id);
      if (!current) return reply.status(404).send({ message: 'Item não encontrado.' });

      const built = buildItemValues(request.body);
      if ('message' in built) return reply.status(400).send({ message: built.message });
      const problem = await relationProblem(tenantId, built.values, current);
      if (problem) return reply.status(400).send({ message: problem });

      await db
        .update(catalogItems)
        .set(built.values)
        .where(and(eq(catalogItems.id, id), eq(catalogItems.tenantId, tenantId)));
      return loadItem(tenantId, id);
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
      const [deleted] = await db
        .delete(catalogItems)
        .where(and(eq(catalogItems.id, id), eq(catalogItems.tenantId, tenantId)))
        .returning({ id: catalogItems.id });
      if (!deleted) return reply.status(404).send({ message: 'Item não encontrado.' });
      return { success: true };
    },
  );
};
