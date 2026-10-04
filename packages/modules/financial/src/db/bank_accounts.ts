import { tenantColumns } from '@erp-360/mod-core';
import { persons } from '@erp-360/mod-persons';
import { foreignKey, integer, pgTable, unique, uuid, varchar } from 'drizzle-orm/pg-core';
import { planAccounts } from './plan_accounts.ts';

export const bankAccounts = pgTable(
  'bank_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...tenantColumns,
    name: varchar('name', { length: 60 }).notNull(),
    branchNumber: varchar('branch_number', { length: 10 }),
    accountCode: varchar('account_code', { length: 16 }),
    planAccountId: uuid('plan_account_id'),
    balance: integer('balance').default(0).notNull(),
    financialInstitutionId: uuid('financial_institution_id'),
    staticPixFlag: varchar('static_pix_flag', { length: 1 }),
    pixKeyType: varchar('pix_key_type', { length: 20 }),
    pixHolderName: varchar('pix_holder_name', { length: 25 }),
    pixKey: varchar('pix_key', { length: 40 }),
  },
  (table) => [
    unique('bank_accounts_tenant_name_unique').on(table.tenantId, table.name),
    unique('bank_accounts_id_tenant_id_unique').on(table.id, table.tenantId),
    foreignKey({
      name: 'bank_accounts_plan_account_tenant_fk',
      columns: [table.planAccountId, table.tenantId],
      foreignColumns: [planAccounts.id, planAccounts.tenantId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'bank_accounts_financial_institution_tenant_fk',
      columns: [table.financialInstitutionId, table.tenantId],
      foreignColumns: [persons.id, persons.tenantId],
    }).onDelete('restrict'),
  ],
);
