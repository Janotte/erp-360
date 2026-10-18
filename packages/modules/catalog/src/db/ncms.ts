import { sql } from 'drizzle-orm';
import { boolean, check, date, pgTable, text, varchar } from 'drizzle-orm/pg-core';

/**
 * Nomenclatura oficial, compartilhada por todos os tenants.
 * IPI, MVA, IBPT e CEST variam por exceção, UF ou item, e ficam no módulo fiscal.
 */
export const ncms = pgTable(
  'ncms',
  {
    /** Código oficial no formato 0000.00.00. */
    code: varchar('code', { length: 10 }).primaryKey(),
    description: text('description').notNull(),
    startsOn: date('starts_on').notNull(),
    endsOn: date('ends_on'),
    isActive: boolean('is_active').default(true).notNull(),
  },
  (table) => [
    check(
      'ncms_code_format',
      sql`${table.code} ~ '^[0-9]{4}[.][0-9]{2}[.][0-9]{2}$'`,
    ),
    check('ncms_description_not_blank', sql`length(trim(${table.description})) > 0`),
    check(
      'ncms_validity',
      sql`${table.endsOn} is null or ${table.endsOn} >= ${table.startsOn}`,
    ),
  ],
);
