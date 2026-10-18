import { tenantColumns } from '@erp-360/mod-core';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  pgEnum,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const measureTypeEnum = pgEnum('measure_type', [
  'weight', // kg, g, ton
  'volume', // L, mL, m³
  'length', // m, cm, mm
  'area', // m², cm²
  'unit', // un, peça, par, caixa
  'time', // hora, dia
]);

export const measures = pgTable(
  'measures',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...tenantColumns,
    name: varchar('name', { length: 30 }).notNull(),
    /** Sigla da NF-e (uCom / uTrib), no máximo 6 caracteres. */
    abbreviation: varchar('abbreviation', { length: 6 }).notNull(),
    measureType: measureTypeEnum('measure_type').notNull(),
    /** Oferece a medida no cadastro de produto. Nasce desmarcado. */
    showOnProduct: boolean('show_on_product').default(false).notNull(),
    /** Oferece a medida no cadastro de serviço. Nasce desmarcado. */
    showOnService: boolean('show_on_service').default(false).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    unique('measures_id_tenant_id_unique').on(table.id, table.tenantId),
    unique('measures_tenant_name_unique').on(table.tenantId, table.name),
    unique('measures_tenant_abbreviation_unique').on(table.tenantId, table.abbreviation),
    check('measures_name_not_blank', sql`length(trim(${table.name})) > 0`),
    check(
      'measures_abbreviation_not_blank',
      sql`length(trim(${table.abbreviation})) > 0`,
    ),
    check(
      'measures_abbreviation_uppercase',
      sql`${table.abbreviation} = upper(${table.abbreviation})`,
    ),
    check(
      'measures_visibility_check',
      sql`${table.showOnProduct} or ${table.showOnService}`,
    ),
  ],
);
