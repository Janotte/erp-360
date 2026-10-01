import { tenantColumns } from '@erp-360/mod-core';
import { persons } from '@erp-360/mod-persons';
import { sql } from 'drizzle-orm';
import { date, foreignKey, integer, pgEnum, pgTable, uuid, varchar } from 'drizzle-orm/pg-core';
import { cardBrands } from './card_brands.ts';
import { paymentMethods } from './payment_methods.ts';
import { planAccounts } from './plan_accounts.ts';

export const statusReceivableEnum = pgEnum('status_receivable', [
  'pendente',
  'recebido',
  'cancelado',
]);

export const receivables = pgTable(
  'receivables',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...tenantColumns,
    /** Devedor / cliente */
    debtorId: uuid('debtor_id').notNull(),
    /** Número do documento do recebimento */
    documentNumber: varchar('document_number', { length: 44 }),
    /** Descrição do recebimento */
    description: varchar('description', { length: 255 }).notNull(),
    /** Data de emissão do recebimento */
    issueOn: date('issue_on')
      .default(sql`CURRENT_DATE`)
      .notNull(),
    /** Valor da parcela do recebimento em centavos */
    installmentAmount: integer('installment_amount').notNull(),
    /** Data de vencimento do recebimento */
    dueOn: date('due_on').notNull(),
    /** Data de recebimento */
    receivedOn: date('received_on'),
    /** Valor recebido em centavos */
    receivedAmount: integer('received_amount'),
    /** Identificador do plano de contas */
    planAccountId: uuid('plan_account_id'),
    /** Portador do boleto */
    bearerName: varchar('bearer_name', { length: 60 }),
    /** Código de barras */
    barcode: varchar('barcode', { length: 50 }),
    /** Nosso número */
    bankSlipOurNumber: varchar('bank_slip_our_number', { length: 20 }),
    /** Número da fatura */
    invoiceNumber: varchar('invoice_number', { length: 44 }),
    /** Instituição financeira */
    financialInstitutionId: uuid('financial_institution_id'),
    /** Método de pagamento */
    paymentMethodId: uuid('payment_method_id').references(() => paymentMethods.id, {
      onDelete: 'restrict',
    }),
    /** Bandeira do cartão */
    cardBrandId: uuid('card_brand_id').references(() => cardBrands.id, {
      onDelete: 'restrict',
    }),
    /** Autorização da transação */
    transactionAuthorization: varchar('transaction_authorization', { length: 128 }),
    status: statusReceivableEnum('status').default('pendente').notNull(),
  },
  (table) => [
    foreignKey({
      name: 'receivables_debtor_tenant_fk',
      columns: [table.debtorId, table.tenantId],
      foreignColumns: [persons.id, persons.tenantId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'receivables_plan_account_tenant_fk',
      columns: [table.planAccountId, table.tenantId],
      foreignColumns: [planAccounts.id, planAccounts.tenantId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'receivables_financial_institution_tenant_fk',
      columns: [table.financialInstitutionId, table.tenantId],
      foreignColumns: [persons.id, persons.tenantId],
    }).onDelete('restrict'),
  ],
);
