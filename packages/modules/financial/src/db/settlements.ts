import { tenantColumns } from '@erp-360/mod-core';
import { boolean, date, integer, pgEnum, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { bankAccounts } from './bank_accounts.ts';
import { planAccounts } from './plan_accounts.ts';

export const settlementKindEnum = pgEnum('settlement_kind', ['payable', 'receivable']);
export const treasuryKindEnum = pgEnum('treasury_kind', ['cash', 'bank']);
export const remainderModeEnum = pgEnum('remainder_mode', [
  'none',
  'new_title',
  'plan_account',
]);

export const settlements = pgTable('settlements', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...tenantColumns,
  kind: settlementKindEnum('kind').notNull(),
  titleId: uuid('title_id').notNull(),
  settledOn: date('settled_on').notNull(),
  treasury: treasuryKindEnum('treasury').notNull(),
  bankAccountId: uuid('bank_account_id').references(() => bankAccounts.id, {
    onDelete: 'restrict',
  }),
  originalAmount: integer('original_amount').notNull(),
  fineAmount: integer('fine_amount').default(0).notNull(),
  interestAmount: integer('interest_amount').default(0).notNull(),
  dueAmount: integer('due_amount').notNull(),
  settledAmount: integer('settled_amount').notNull(),
  waivedCharges: boolean('waived_charges').default(false).notNull(),
  remainderMode: remainderModeEnum('remainder_mode').default('none').notNull(),
  differencePlanAccountId: uuid('difference_plan_account_id').references(
    () => planAccounts.id,
    { onDelete: 'restrict' },
  ),
  includeChargesOnNewTitle: boolean('include_charges_on_new_title')
    .default(false)
    .notNull(),
  createdTitleId: uuid('created_title_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
