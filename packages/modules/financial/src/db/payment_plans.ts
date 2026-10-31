import { tenantColumns } from '@erp-360/mod-core';
import { persons } from '@erp-360/mod-persons';
import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  integer,
  pgTable,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { cardBrands } from './card_brands.ts';
import { meansOfPayment } from './means_of_payment.ts';
import {
  paymentIntegrationTypeEnum,
  paymentMethods,
  paymentReceiptKindEnum,
} from './payment_methods.ts';
import { paymentInterestTypeEnum } from './payment_method_terms.ts';

/** Plano reutilizável. A ordem, o orçamento e a venda apontam para ele. */
export const paymentPlans = pgTable(
  'payment_plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...tenantColumns,
  },
  (table) => [unique('payment_plans_id_tenant_id_unique').on(table.id, table.tenantId)],
);

/**
 * Parcela concreta. A condição só sugere vencimento e divisão;
 * a data e o valor gravados são os que o usuário confirmou.
 * Juros e taxas são cópia do custo da loja e não entram no valor.
 */
export const paymentPlanLines = pgTable(
  'payment_plan_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...tenantColumns,
    planId: uuid('plan_id').notNull(),
    lineNumber: integer('line_number').notNull(),
    paymentMethodId: uuid('payment_method_id').notNull(),
    methodName: varchar('method_name', { length: 60 }).notNull(),
    dueOn: date('due_on').notNull(),
    amount: integer('amount').notNull(),
    installmentCount: integer('installment_count').notNull(),
    meansOfPaymentId: uuid('means_of_payment_id')
      .notNull()
      .references(() => meansOfPayment.id, { onDelete: 'restrict' }),
    interestType: paymentInterestTypeEnum('interest_type').notNull(),
    interestRateBps: integer('interest_rate_bps').notNull(),
    administrativeFeeBps: integer('administrative_fee_bps').notNull(),
    fixedFeeAmount: integer('fixed_fee_amount').notNull(),
    firstDueDays: integer('first_due_days').notNull(),
    intervalDays: integer('interval_days').notNull(),
    receiptKind: paymentReceiptKindEnum('receipt_kind').notNull(),
    integrationType: paymentIntegrationTypeEnum('integration_type'),
    acquirerId: uuid('acquirer_id'),
    cardBrandId: uuid('card_brand_id').references(() => cardBrands.id, {
      onDelete: 'restrict',
    }),
  },
  (table) => [
    unique('payment_plan_lines_id_tenant_id_unique').on(table.id, table.tenantId),
    unique('payment_plan_lines_plan_line_unique').on(
      table.tenantId,
      table.planId,
      table.lineNumber,
    ),
    foreignKey({
      name: 'payment_plan_lines_plan_tenant_fk',
      columns: [table.planId, table.tenantId],
      foreignColumns: [paymentPlans.id, paymentPlans.tenantId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'payment_plan_lines_method_tenant_fk',
      columns: [table.paymentMethodId, table.tenantId],
      foreignColumns: [paymentMethods.id, paymentMethods.tenantId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'payment_plan_lines_acquirer_tenant_fk',
      columns: [table.acquirerId, table.tenantId],
      foreignColumns: [persons.id, persons.tenantId],
    }).onDelete('restrict'),
    check('payment_plan_lines_amount_check', sql`${table.amount} >= 0`),
    check('payment_plan_lines_number_check', sql`${table.lineNumber} >= 1`),
    check('payment_plan_lines_count_check', sql`${table.installmentCount} between 1 and 48`),
  ],
);
