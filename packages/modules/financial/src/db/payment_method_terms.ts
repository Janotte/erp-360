import { tenantColumns } from '@erp-360/mod-core';
import { sql } from 'drizzle-orm';
import { check, foreignKey, integer, pgEnum, pgTable, unique, uuid } from 'drizzle-orm/pg-core';

import { paymentMethods } from './payment_methods.ts';

/**
 * none: sem juros.
 * simple: juros simples da loja, taxa ao mês sobre o principal, vezes a quantidade.
 * price: Tabela Price, taxa ao mês.
 * flat: um percentual sobre o principal, sem multiplicar pela quantidade.
 * issuer: juros do emissor. A loja não altera o total da venda.
 */
export const paymentInterestTypeEnum = pgEnum('payment_interest_type', [
  'none',
  'simple',
  'price',
  'flat',
  'issuer',
]);

export const paymentInterestTypes = paymentInterestTypeEnum.enumValues;

export const paymentMethodTerms = pgTable(
  'payment_method_terms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...tenantColumns,
    paymentMethodId: uuid('payment_method_id').notNull(),
    /** De 1 a 48. 1 é à vista quando firstDueDays também é 0. */
    installmentCount: integer('installment_count').notNull(),
    /** Dias até a primeira parcela. 0 = no dia da venda. */
    firstDueDays: integer('first_due_days').default(0).notNull(),
    /** Dias entre uma parcela e a seguinte. 0 somente quando a quantidade é 1. */
    intervalDays: integer('interval_days').default(0).notNull(),
    interestType: paymentInterestTypeEnum('interest_type').default('none').notNull(),
    /** 199 = 1,99%. Ao mês em simple e price. Sobre o principal em flat. */
    interestRateBps: integer('interest_rate_bps').default(0).notNull(),
    /** MDR da loja, uma vez, sobre o principal. 250 = 2,50%. */
    administrativeFeeBps: integer('administrative_fee_bps').default(0).notNull(),
    /**
     * Centavos por título. Se a forma não gera título, centavos do pagamento.
     * PIX de R$ 0,50 = 50. Boleto de R$ 2,00 por carnê = 200 em cada título.
     */
    fixedFeeAmount: integer('fixed_fee_amount').default(0).notNull(),
  },
  (table) => [
    unique('payment_method_terms_id_tenant_id_unique').on(table.id, table.tenantId),
    unique('payment_method_terms_method_count_unique').on(
      table.tenantId,
      table.paymentMethodId,
      table.installmentCount,
    ),
    foreignKey({
      name: 'payment_method_terms_method_tenant_fk',
      columns: [table.paymentMethodId, table.tenantId],
      foreignColumns: [paymentMethods.id, paymentMethods.tenantId],
    }).onDelete('cascade'),
    check(
      'payment_method_terms_installment_count_check',
      sql`${table.installmentCount} between 1 and 48`,
    ),
    check(
      'payment_method_terms_first_due_days_check',
      sql`${table.firstDueDays} between 0 and 365`,
    ),
    check(
      'payment_method_terms_interval_days_check',
      sql`(
        (${table.installmentCount} = 1 and ${table.intervalDays} = 0)
        or (${table.installmentCount} > 1 and ${table.intervalDays} between 1 and 365)
      )`,
    ),
    check(
      'payment_method_terms_interest_rate_check',
      sql`${table.interestRateBps} between 0 and 10000 and (
        (${table.interestType} in ('none', 'issuer') and ${table.interestRateBps} = 0)
        or (${table.interestType} in ('simple', 'price', 'flat') and ${table.interestRateBps} > 0)
      )`,
    ),
    check(
      'payment_method_terms_administrative_fee_check',
      sql`${table.administrativeFeeBps} between 0 and 10000`,
    ),
    check('payment_method_terms_fixed_fee_check', sql`${table.fixedFeeAmount} >= 0`),
  ],
);
