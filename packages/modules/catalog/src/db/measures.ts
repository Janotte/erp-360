import { tenantColumns } from '@erp-360/mod-core';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  numeric,
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
    /**
     * Quantas unidades da medida base esta medida contém.
     * Caixa com base UN e fator 12 equivale a 12 unidades.
     * A medida base deixa `baseMeasureId` vazio e o fator em 1.
     */
    factor: numeric('factor', { precision: 18, scale: 6 }).default('1').notNull(),
    baseMeasureId: uuid('base_measure_id'),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    unique('measures_id_tenant_id_unique').on(table.id, table.tenantId),
    unique('measures_tenant_name_unique').on(table.tenantId, table.name),
    unique('measures_tenant_abbreviation_unique').on(table.tenantId, table.abbreviation),
    foreignKey({
      name: 'measures_base_measure_tenant_fk',
      columns: [table.baseMeasureId, table.tenantId],
      foreignColumns: [table.id, table.tenantId],
    }).onDelete('restrict'),
    check(
      'measures_factor_base_check',
      sql`(
        (${table.baseMeasureId} is null and ${table.factor} = 1)
        or (${table.baseMeasureId} is not null and ${table.factor} > 0)
      )`,
    ),
    check(
      'measures_base_not_self',
      sql`${table.baseMeasureId} is null or ${table.baseMeasureId} <> ${table.id}`,
    ),
    check('measures_name_not_blank', sql`length(trim(${table.name})) > 0`),
    check(
      'measures_abbreviation_not_blank',
      sql`length(trim(${table.abbreviation})) > 0`,
    ),
    check(
      'measures_abbreviation_uppercase',
      sql`${table.abbreviation} = upper(${table.abbreviation})`,
    ),
  ],
);
