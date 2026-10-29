import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  pgEnum,
  pgTable,
  text,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/** Grupo fiscal que a emissão precisa preencher além do tPag. */
export const meansFiscalGroupEnum = pgEnum('means_fiscal_group', [
  'none',
  'card',
  'electronic',
  'other',
]);

/**
 * Catálogo global do tPag da NF-e, compartilhado por todos os tenants.
 * Um código alterado pela SEFAZ atualiza a mesma linha.
 */
export const meansOfPayment = pgTable(
  'means_of_payment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** tPag, dois dígitos. Ex.: 03, 17, 99. */
    code: varchar('code', { length: 2 }).notNull(),
    /** Texto oficial vigente. O maior hoje tem 73 caracteres. */
    description: varchar('description', { length: 100 }).notNull(),
    /** Observação do informe técnico. Ajuda a escolher 05, 21 e 99. */
    notes: text('notes'),
    /** none: só o tPag. card: grupo card. electronic: tpIntegra e id da transação, sem bandeira. other: xPag. */
    fiscalGroup: meansFiscalGroupEnum('fiscal_group').notNull(),
    /** Entra no select da forma comercial. 22 e 90 ficam fora. */
    isSelectable: boolean('is_selectable').default(true).notNull(),
    startsOn: date('starts_on').notNull(),
    endsOn: date('ends_on'),
  },
  (table) => [
    unique('means_of_payment_code_unique').on(table.code),
    check('means_of_payment_code_format', sql`${table.code} ~ '^[0-9]{2}$'`),
    check(
      'means_of_payment_description_not_blank',
      sql`length(trim(${table.description})) > 0`,
    ),
    check(
      'means_of_payment_validity',
      sql`${table.endsOn} is null or ${table.endsOn} >= ${table.startsOn}`,
    ),
  ],
);
