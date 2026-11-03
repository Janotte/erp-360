import { tenantColumns } from '@erp-360/mod-core';
import { persons } from '@erp-360/mod-persons';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  pgTable,
  smallint,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { bankAccounts } from './bank_accounts.ts';
import { cardBrands } from './card_brands.ts';

/** Cartão da empresa. A fatura é dívida com o emissor, não com o fornecedor. */
export const companyCards = pgTable(
  'company_cards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...tenantColumns,
    name: varchar('name', { length: 60 }).notNull(),
    /** Pessoa com isFinancialInstitution. Credor das parcelas da fatura. */
    issuerId: uuid('issuer_id').notNull(),
    cardBrandId: uuid('card_brand_id').references(() => cardBrands.id, {
      onDelete: 'restrict',
    }),
    /** Dia do fechamento, de 1 a 28. */
    closingDay: smallint('closing_day').notNull(),
    /** Dia de vencimento da fatura, de 1 a 28. */
    dueDay: smallint('due_day').notNull(),
    /** Conta usada quando a fatura é paga. */
    bankAccountId: uuid('bank_account_id'),
    isActive: boolean('is_active').default(true).notNull(),
  },
  (table) => [
    unique('company_cards_id_tenant_id_unique').on(table.id, table.tenantId),
    unique('company_cards_tenant_name_unique').on(table.tenantId, table.name),
    foreignKey({
      name: 'company_cards_issuer_tenant_fk',
      columns: [table.issuerId, table.tenantId],
      foreignColumns: [persons.id, persons.tenantId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'company_cards_bank_account_tenant_fk',
      columns: [table.bankAccountId, table.tenantId],
      foreignColumns: [bankAccounts.id, bankAccounts.tenantId],
    }).onDelete('restrict'),
    check('company_cards_closing_day_check', sql`${table.closingDay} between 1 and 28`),
    check('company_cards_due_day_check', sql`${table.dueDay} between 1 and 28`),
    check('company_cards_name_not_blank', sql`length(trim(${table.name})) > 0`),
  ],
);
