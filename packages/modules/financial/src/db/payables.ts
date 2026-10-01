import { tenantColumns } from '@erp-360/mod-core';
import { persons } from '@erp-360/mod-persons';
import { sql } from 'drizzle-orm';
import { date, foreignKey, integer, pgEnum, pgTable, uuid, varchar } from 'drizzle-orm/pg-core';
import { planAccounts } from './plan_accounts.ts';

export const statusPayableEnum = pgEnum('status_payable', [
  'pendente',
  'pago',
  'cancelado',
]);

export const payables = pgTable(
  'payables',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...tenantColumns,
    /** Credor / fornecedor */
    creditorId: uuid('creditor_id').notNull(),
    /** Número do documento */
    documentNumber: varchar('document_number', { length: 44 }),
    /** Descrição do pagamento */
    description: varchar('description', { length: 255 }).notNull(),
    /** Data de emissão do pagamento */
    issueOn: date('issue_on')
      .default(sql`CURRENT_DATE`)
      .notNull(),
    /** Valor da parcela em centavos */
    installmentAmount: integer('installment_amount').notNull(),
    /** Data de vencimento da parcela */
    dueOn: date('due_on').notNull(),
    /** Data de pagamento da parcela */
    paidOn: date('paid_on'),
    /** Valor pago da parcela em centavos */
    paidAmount: integer('paid_amount'),
    /** Identificador do plano de contas */
    planAccountId: uuid('plan_account_id'),
    /** Status do pagamento */
    status: statusPayableEnum('status').default('pendente').notNull(),
  },
  (table) => [
    foreignKey({
      name: 'payables_creditor_tenant_fk',
      columns: [table.creditorId, table.tenantId],
      foreignColumns: [persons.id, persons.tenantId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'payables_plan_account_tenant_fk',
      columns: [table.planAccountId, table.tenantId],
      foreignColumns: [planAccounts.id, planAccounts.tenantId],
    }).onDelete('restrict'),
  ],
);
