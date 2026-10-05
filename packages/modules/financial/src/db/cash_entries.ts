import { tenantColumns } from '@erp-360/mod-core';
import { boolean, date, foreignKey, integer, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { payables } from './payables.ts';
import { planAccounts } from './plan_accounts.ts';
import { receivables } from './receivables.ts';
import { settlements } from './settlements.ts';
import { treasuryTransfers } from './treasury_transfers.ts';

export const cashEntries = pgTable(
  'cash_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...tenantColumns,
    occurredOn: date('occurred_on').notNull(),
    planAccountId: uuid('plan_account_id'),
    description: varchar('description', { length: 255 }).notNull(),
    inflowAmount: integer('inflow_amount').default(0).notNull(),
    outflowAmount: integer('outflow_amount').default(0).notNull(),
    balance: integer('balance').default(0).notNull(),
    receivableId: uuid('receivable_id'),
    payableId: uuid('payable_id'),
    settlementId: uuid('settlement_id').references(() => settlements.id, {
      onDelete: 'cascade',
    }),
    openingBalance: boolean('opening_balance').default(false).notNull(),
    transferId: uuid('transfer_id').references(() => treasuryTransfers.id, {
      onDelete: 'cascade',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: 'cash_entries_plan_account_tenant_fk',
      columns: [table.planAccountId, table.tenantId],
      foreignColumns: [planAccounts.id, planAccounts.tenantId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'cash_entries_receivable_tenant_fk',
      columns: [table.receivableId, table.tenantId],
      foreignColumns: [receivables.id, receivables.tenantId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'cash_entries_payable_tenant_fk',
      columns: [table.payableId, table.tenantId],
      foreignColumns: [payables.id, payables.tenantId],
    }).onDelete('restrict'),
  ],
);
