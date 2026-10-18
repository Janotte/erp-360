import { tenantColumns } from '@erp-360/mod-core';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const catalogCategories = pgTable(
  'catalog_categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...tenantColumns,
    /** Categoria pai. Vazio na raiz da árvore. */
    parentId: uuid('parent_id'),
    name: varchar('name', { length: 80 }).notNull(),
    description: text('description'),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    unique('catalog_categories_id_tenant_id_unique').on(table.id, table.tenantId),
    unique('catalog_categories_sibling_name_unique').on(
      table.tenantId,
      table.parentId,
      table.name,
    ),
    uniqueIndex('catalog_categories_root_name_unique')
      .on(table.tenantId, table.name)
      .where(sql`${table.parentId} is null`),
    foreignKey({
      name: 'catalog_categories_parent_tenant_fk',
      columns: [table.parentId, table.tenantId],
      foreignColumns: [table.id, table.tenantId],
    }).onDelete('restrict'),
    check('catalog_categories_name_not_blank', sql`length(trim(${table.name})) > 0`),
    check(
      'catalog_categories_parent_not_self',
      sql`${table.parentId} is null or ${table.parentId} <> ${table.id}`,
    ),
  ],
);
