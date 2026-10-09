import { tenantColumns } from '@erp-360/mod-core';
import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const typePlanAccountEnum = pgEnum('type_plan_account', [
  'revenue',
  'expense',
  'bank',
  'withdrawal',
]);

export const planAccounts = pgTable(
  'plan_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...tenantColumns,
    /** Código do plano de contas */
    accountCode: varchar('account_code', { length: 10 }).notNull(),
    /** Nome do plano de contas */
    name: varchar('name', { length: 120 }).notNull(),
    /** Tipo de plano de contas */
    type: typePlanAccountEnum('type').notNull(),
    /** Código do plano de contas pai */
    parentAccountCode: varchar('parent_account_code', { length: 10 }),
    /** Saldo da conta no dia (centavos) */
    dayBalance: integer('day_balance'),
    /** Saldo da conta no mês (centavos) */
    monthBalance: integer('month_balance'),
    /** Saldo no ano na conta (centavos) */
    yearBalance: integer('year_balance'),
    /** Saldo do plano de contas (centavos) */
    balance: integer('balance'),
    /** Descrição contábil do plano de contas */
    accountingDescription: varchar('accounting_description', { length: 60 }),
    /** Identificador do plano de contas */
    accountIdentifier: varchar('account_identifier', { length: 10 }),
    /** Código contábil do plano de contas */
    accountingAccountCode: varchar('accounting_account_code', { length: 20 }),
    /** Flag para identificar se o plano de contas está ativo */
    isActive: boolean('is_active').default(true).notNull(),
  },
  (table) => [
    unique('plan_accounts_id_tenant_id_unique').on(table.id, table.tenantId),
    unique('plan_accounts_tenant_account_code_unique').on(
      table.tenantId,
      table.accountCode,
    ),
    unique('plan_accounts_tenant_name_unique').on(table.tenantId, table.name),
  ],
);
