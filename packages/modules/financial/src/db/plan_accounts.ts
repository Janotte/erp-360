import { tenantColumns } from '@erp-360/mod-core';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  integer,
  pgEnum,
  pgTable,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const planAccountNatureEnum = pgEnum('plan_account_nature', [
  'asset',
  'liability',
  'equity',
  'revenue',
  'expense',
]);

export const planAccountDreLineEnum = pgEnum('plan_account_dre_line', [
  'gross_revenue',
  'deduction',
  'cost',
  'operating_expense',
  'financial_income',
  'financial_expense',
  'other_income',
  'other_expense',
]);

export const planAccounts = pgTable(
  'plan_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...tenantColumns,
    /** Código do plano de contas */
    accountCode: varchar('account_code', { length: 15 }).notNull(),
    /** Nome do plano de contas */
    name: varchar('name', { length: 120 }).notNull(),
    /** Natureza patrimonial ou de resultado */
    nature: planAccountNatureEnum('nature').notNull(),
    /** Linha da DRE. Vazio em conta patrimonial */
    dreLine: planAccountDreLineEnum('dre_line'),
    /** Conta analítica, que recebe lançamento */
    acceptsEntries: boolean('accepts_entries').default(true).notNull(),
    /** Conta de caixa ou banco, usada na tesouraria */
    isTreasury: boolean('is_treasury').default(false).notNull(),
    /** Código do plano de contas pai */
    parentAccountCode: varchar('parent_account_code', { length: 15 }),
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
    check(
      'plan_accounts_dre_line_nature_check',
      sql`(
        (${table.nature} = 'revenue' AND ${table.dreLine} IN ('gross_revenue', 'financial_income', 'other_income'))
        OR (${table.nature} = 'expense' AND ${table.dreLine} IN ('deduction', 'cost', 'operating_expense', 'financial_expense', 'other_expense'))
        OR (${table.nature} IN ('asset', 'liability', 'equity') AND ${table.dreLine} IS NULL)
      ) AND (${table.isTreasury} = false OR ${table.nature} = 'asset')`,
    ),
  ],
);
