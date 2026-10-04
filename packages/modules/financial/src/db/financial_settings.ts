import { tenants } from '@erp-360/mod-core';
import { integer, pgTable, uuid } from 'drizzle-orm/pg-core';
import { planAccounts } from './plan_accounts.ts';

export const financialSettings = pgTable('financial_settings', {
  tenantId: uuid('tenant_id')
    .primaryKey()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  /** Multa por atraso em basis points (200 = 2,00%) */
  lateFeeBps: integer('late_fee_bps').default(200).notNull(),
  /** Juros ao dia em basis points (3 = 0,03%) */
  dailyInterestBps: integer('daily_interest_bps').default(3).notNull(),
  /** Carência em dias após o vencimento */
  graceDays: integer('grace_days').default(0).notNull(),
  cashPlanAccountId: uuid('cash_plan_account_id').references(() => planAccounts.id, {
    onDelete: 'restrict',
  }),
  discountObtainedPlanAccountId: uuid('discount_obtained_plan_account_id').references(
    () => planAccounts.id,
    { onDelete: 'restrict' },
  ),
  discountGrantedPlanAccountId: uuid('discount_granted_plan_account_id').references(
    () => planAccounts.id,
    { onDelete: 'restrict' },
  ),
  lateFeePaidPlanAccountId: uuid('late_fee_paid_plan_account_id').references(
    () => planAccounts.id,
    { onDelete: 'restrict' },
  ),
  lateFeeReceivedPlanAccountId: uuid('late_fee_received_plan_account_id').references(
    () => planAccounts.id,
    { onDelete: 'restrict' },
  ),
});
