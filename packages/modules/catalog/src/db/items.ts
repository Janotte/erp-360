import { tenantColumns, tenants } from '@erp-360/mod-core';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { catalogCategories } from './categories.ts';
import { measures } from './measures.ts';
import { ncms } from './ncms.ts';

export const catalogItemTypeEnum = pgEnum('catalog_item_type', ['product', 'service']);

/** Tipo de item do SPED, registro 0200. */
export const fiscalItemTypeEnum = pgEnum('fiscal_item_type', [
  'resale', // 00 Mercadoria para revenda
  'raw_material', // 01 Matéria-prima
  'packaging', // 02 Embalagem
  'work_in_process', // 03 Produto em processo
  'finished_product', // 04 Produto acabado
  'byproduct', // 05 Subproduto
  'intermediate_product', // 06 Produto intermediário
  'consumable', // 07 Material de uso e consumo
  'fixed_asset', // 08 Ativo imobilizado
  'service', // 09 Serviços
  'other_input', // 10 Outros insumos
  'other', // 99 Outros
]);

export const catalogItems = pgTable(
  'catalog_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...tenantColumns,
    /** Código comercial de 000001 a 999999. Vai para cProd na NF-e. */
    code: varchar('code', { length: 6 }).notNull(),
    /** Código livre da empresa. Opcional. */
    sku: varchar('sku', { length: 60 }),
    type: catalogItemTypeEnum('type').notNull(),
    fiscalItemType: fiscalItemTypeEnum('fiscal_item_type').notNull(),
    /**
     * Inventário só movimenta item com este marcador.
     * O cadastro grava falso em serviço e ativo imobilizado.
     */
    tracksStock: boolean('tracks_stock').default(true).notNull(),
    categoryId: uuid('category_id'),
    measureId: uuid('measure_id').notNull(),
    /** Descrição do item na nota (xProd). */
    name: varchar('name', { length: 120 }).notNull(),
    description: text('description'),
    /** GTIN, quando houver. */
    barcode: varchar('barcode', { length: 14 }),
    /** Preço de tabela, com 4 casas. O documento grava o preço negociado. */
    listPrice: numeric('list_price', { precision: 15, scale: 4 }),
    /** NCM no formato 0000.00.00. */
    ncmCode: varchar('ncm_code', { length: 10 }).references(() => ncms.code, {
      onDelete: 'restrict',
    }),
    cestCode: varchar('cest_code', { length: 7 }),
    netWeightKg: numeric('net_weight_kg', { precision: 12, scale: 3 }),
    grossWeightKg: numeric('gross_weight_kg', { precision: 12, scale: 3 }),
    lengthCm: numeric('length_cm', { precision: 8, scale: 2 }),
    widthCm: numeric('width_cm', { precision: 8, scale: 2 }),
    heightCm: numeric('height_cm', { precision: 8, scale: 2 }),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    unique('catalog_items_id_tenant_id_unique').on(table.id, table.tenantId),
    unique('catalog_items_tenant_code_unique').on(table.tenantId, table.code),
    unique('catalog_items_tenant_sku_unique').on(table.tenantId, table.sku),
    unique('catalog_items_tenant_barcode_unique').on(table.tenantId, table.barcode),
    foreignKey({
      name: 'catalog_items_category_tenant_fk',
      columns: [table.categoryId, table.tenantId],
      foreignColumns: [catalogCategories.id, catalogCategories.tenantId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'catalog_items_measure_tenant_fk',
      columns: [table.measureId, table.tenantId],
      foreignColumns: [measures.id, measures.tenantId],
    }).onDelete('restrict'),
    index('catalog_items_tenant_category_idx').on(table.tenantId, table.categoryId),
    index('catalog_items_tenant_measure_idx').on(table.tenantId, table.measureId),
    index('catalog_items_ncm_code_idx').on(table.ncmCode),
    check(
      'catalog_items_fiscal_type_check',
      sql`(
        (${table.type} = 'service' and ${table.fiscalItemType} = 'service')
        or (${table.type} = 'product' and ${table.fiscalItemType} <> 'service')
      )`,
    ),
    check('catalog_items_code_format', sql`${table.code} ~ '^[0-9]{6}$'`),
    check(
      'catalog_items_sku_not_blank',
      sql`${table.sku} is null or length(trim(${table.sku})) > 0`,
    ),
    check('catalog_items_name_not_blank', sql`length(trim(${table.name})) > 0`),
    check(
      'catalog_items_barcode_check',
      sql`${table.barcode} is null or ${table.barcode} ~ '^[0-9]{8}$|^[0-9]{12,14}$'`,
    ),
    check(
      'catalog_items_cest_check',
      sql`${table.cestCode} is null or ${table.cestCode} ~ '^[0-9]{7}$'`,
    ),
    check(
      'catalog_items_list_price_check',
      sql`${table.listPrice} is null or ${table.listPrice} >= 0`,
    ),
    check(
      'catalog_items_measures_check',
      sql`(
        (${table.netWeightKg} is null or ${table.netWeightKg} >= 0)
        and (${table.grossWeightKg} is null or ${table.grossWeightKg} >= 0)
        and (${table.lengthCm} is null or ${table.lengthCm} >= 0)
        and (${table.widthCm} is null or ${table.widthCm} >= 0)
        and (${table.heightCm} is null or ${table.heightCm} >= 0)
      )`,
    ),
  ],
);

/** Próximo código do item, um contador por empresa. Excluir um item não reaproveita o número. */
export const catalogItemCounters = pgTable(
  'catalog_item_counters',
  {
    tenantId: uuid('tenant_id')
      .primaryKey()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    lastNumber: integer('last_number').notNull(),
  },
  (table) => [
    check(
      'catalog_item_counters_range',
      sql`${table.lastNumber} >= 0 and ${table.lastNumber} <= 999999`,
    ),
  ],
);
