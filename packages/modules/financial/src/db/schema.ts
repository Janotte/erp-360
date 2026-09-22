import { pgTable, uuid, varchar, integer, pgEnum, date } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenantColumns } from '@erp-360/mod-core';
import { persons } from '@erp-360/mod-persons';

// Enum para controle de status financeiro
export const statusFinancialEnum = pgEnum('status_financial', [
  'pendente',
  'pago',
  'cancelado',
]);

// 1. Tabela de Contas a Pagar
export const accountsPayable = pgTable('accounts_payable', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...tenantColumns,
  personId: uuid('person_id')
    .references(() => persons.id, { onDelete: 'restrict' })
    .notNull(),
  document: varchar('document', { length: 20 }),
  description: varchar('description', { length: 255 }).notNull(),
  issueDate: date('issue_date')
    .default(sql`CURRENT_DATE`)
    .notNull(),
  amount: integer('amount').notNull(),
  dueDate: date('due_date').notNull(),
  paymentDate: date('payment_date'),
  amountPaid: integer('amount_paid'),
  status: statusFinancialEnum('status').default('pendente').notNull(),
});

// 2. Tabela de Contas a Receber
export const accountsReceivable = pgTable('accounts_receivable', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...tenantColumns,
  personId: uuid('person_id')
    .references(() => persons.id, { onDelete: 'restrict' })
    .notNull(),
  document: varchar('document', { length: 20 }),
  description: varchar('description', { length: 255 }).notNull(),
  issueDate: date('issue_date')
    .default(sql`CURRENT_DATE`)
    .notNull(),
  amount: integer('amount').notNull(),
  dueDate: date('due_date').notNull(),
  receiveDate: date('receive_date'),
  amountReceived: integer('amount_received'),
  status: statusFinancialEnum('status').default('pendente').notNull(),
});
