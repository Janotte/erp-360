import { tenantColumns } from '@erp-360/mod-core';
import { integer, pgTable, unique, uuid, varchar } from 'drizzle-orm/pg-core';

export const planAccounts = pgTable(
  'plan_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...tenantColumns,
    /** Código do plano de contas */
    accountCode: varchar('account_code', { length: 30 }).notNull(),
    /** Nome do plano de contas */
    name: varchar('name', { length: 120 }).notNull(),
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
  },
  (table) => [
    unique('plan_accounts_id_tenant_id_unique').on(table.id, table.tenantId),
    unique('plan_accounts_tenant_account_code_unique').on(table.tenantId, table.accountCode),
  ],
);
