import { tenantColumns } from '@erp-360/mod-core';
import { persons } from '@erp-360/mod-persons';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  integer,
  pgEnum,
  pgTable,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { bankAccounts } from './bank_accounts.ts';
import { cardBrands } from './card_brands.ts';
import { meansOfPayment } from './means_of_payment.ts';

/** Para onde o valor vai no financeiro. */
export const paymentReceiptKindEnum = pgEnum('payment_receipt_kind', [
  'cash',
  'bank',
  'customer_receivable',
  'acquirer_receivable',
  'store_credit',
]);

/** tpIntegra: integrated = 1, not_integrated = 2. */
export const paymentIntegrationTypeEnum = pgEnum('payment_integration_type', [
  'integrated',
  'not_integrated',
]);

export const paymentReceiptKinds = paymentReceiptKindEnum.enumValues;
export const paymentIntegrationTypes = paymentIntegrationTypeEnum.enumValues;

export const paymentMethods = pgTable(
  'payment_methods',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...tenantColumns,
    /** Atalho do PDV. Gravado em maiúsculas. Ex.: DIN, PIX, CREDITO. */
    code: varchar('code', { length: 15 }).notNull(),
    /** Rótulo do select e, no tPag 99, o xPag. Máximo fiscal do xPag: 60. */
    name: varchar('name', { length: 60 }).notNull(),
    meansOfPaymentId: uuid('means_of_payment_id')
      .notNull()
      .references(() => meansOfPayment.id, { onDelete: 'restrict' }),
    isActive: boolean('is_active').default(true).notNull(),
    receiptKind: paymentReceiptKindEnum('receipt_kind').notNull(),
    /**
     * Dias até o crédito da credenciadora quando o parcelado é do emissor
     * e existe um único título. Nas demais formas fica nulo e o vencimento
     * sai da condição.
     */
    settlementDays: integer('settlement_days'),
    integrationType: paymentIntegrationTypeEnum('integration_type'),
    /** Credenciadora. Pessoa da empresa com isFinancialInstitution. */
    acquirerId: uuid('acquirer_id'),
    /** Bandeira padrão. No TEF integrado pode nascer vazia e vir da captura. */
    cardBrandId: uuid('card_brand_id').references(() => cardBrands.id, {
      onDelete: 'restrict',
    }),
    /** Conta usada no PIX, no depósito e na liquidação do cartão. */
    bankAccountId: uuid('bank_account_id'),
    useInQuote: boolean('use_in_quote').default(true).notNull(),
    useInSale: boolean('use_in_sale').default(true).notNull(),
    useInPos: boolean('use_in_pos').default(true).notNull(),
    useInServiceOrder: boolean('use_in_service_order').default(true).notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
  },
  (table) => [
    unique('payment_methods_id_tenant_id_unique').on(table.id, table.tenantId),
    unique('payment_methods_tenant_code_unique').on(table.tenantId, table.code),
    unique('payment_methods_tenant_name_unique').on(table.tenantId, table.name),
    foreignKey({
      name: 'payment_methods_acquirer_tenant_fk',
      columns: [table.acquirerId, table.tenantId],
      foreignColumns: [persons.id, persons.tenantId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'payment_methods_bank_account_tenant_fk',
      columns: [table.bankAccountId, table.tenantId],
      foreignColumns: [bankAccounts.id, bankAccounts.tenantId],
    }).onDelete('restrict'),
    check(
      'payment_methods_code_format',
      sql`${table.code} ~ '^[A-Z0-9][A-Z0-9-]{0,14}$'`,
    ),
    check('payment_methods_name_not_blank', sql`length(trim(${table.name})) > 0`),
    check(
      'payment_methods_settlement_days_check',
      sql`${table.settlementDays} is null or ${table.settlementDays} between 0 and 365`,
    ),
    check(
      'payment_methods_settlement_days_kind_check',
      sql`${table.receiptKind} = 'acquirer_receivable' or ${table.settlementDays} is null`,
    ),
    check(
      'payment_methods_acquirer_kind_check',
      sql`${table.receiptKind} <> 'acquirer_receivable' or ${table.acquirerId} is not null`,
    ),
    check(
      'payment_methods_integrated_acquirer_check',
      sql`${table.integrationType} is distinct from 'integrated' or ${table.acquirerId} is not null`,
    ),
    check(
      'payment_methods_channel_check',
      sql`${table.useInQuote} or ${table.useInSale} or ${table.useInPos} or ${table.useInServiceOrder}`,
    ),
  ],
);
