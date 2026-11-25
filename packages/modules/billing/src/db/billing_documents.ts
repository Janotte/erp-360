import { tenantColumns, tenants } from '@erp-360/mod-core';
import { persons } from '@erp-360/mod-persons';
import { serviceOrders } from '@erp-360/mod-service-orders';
import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  integer,
  pgEnum,
  pgTable,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/** Situação comercial. O número existe; o cancelamento segue o financeiro. */
export const billingCommercialStatusEnum = pgEnum('billing_commercial_status', [
  'issued',
  'canceled',
]);

/**
 * Situação fiscal. not_requested até alguém pedir nota.
 * pending é o pedido local, ainda na empresa.
 * authorized, rejected e canceled entram quando o ambiente responder.
 */
export const billingFiscalStatusEnum = pgEnum('billing_fiscal_status', [
  'not_requested',
  'pending',
  'authorized',
  'rejected',
  'canceled',
]);

/** Próximo número do documento comercial da empresa. */
export const billingDocumentCounters = pgTable(
  'billing_document_counters',
  {
    tenantId: uuid('tenant_id')
      .primaryKey()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    lastNumber: integer('last_number').default(0).notNull(),
  },
  (table) => [
    check(
      'billing_document_counters_last_number_check',
      sql`${table.lastNumber} >= 0`,
    ),
  ],
);

/**
 * Número comercial que o cliente vê. A NFS-e e a NF-e penduram aqui, não no título.
 * Nesta entrega só a ordem nova cria o documento.
 */
export const billingDocuments = pgTable(
  'billing_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...tenantColumns,
    number: integer('number').notNull(),
    personId: uuid('person_id').notNull(),
    serviceOrderId: uuid('service_order_id').notNull(),
    productsAmount: integer('products_amount').notNull(),
    servicesAmount: integer('services_amount').notNull(),
    freightAmount: integer('freight_amount').notNull(),
    discountAmount: integer('discount_amount').notNull(),
    surchargeAmount: integer('surcharge_amount').notNull(),
    totalAmount: integer('total_amount').notNull(),
    commercialStatus: billingCommercialStatusEnum('commercial_status')
      .default('issued')
      .notNull(),
    fiscalStatus: billingFiscalStatusEnum('fiscal_status')
      .default('not_requested')
      .notNull(),
    issuedOn: date('issued_on').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    unique('billing_documents_id_tenant_id_unique').on(table.id, table.tenantId),
    unique('billing_documents_tenant_number_unique').on(table.tenantId, table.number),
    uniqueIndex('billing_documents_tenant_issued_order_unique')
      .on(table.tenantId, table.serviceOrderId)
      .where(sql`${table.commercialStatus} = 'issued'`),
    foreignKey({
      name: 'billing_documents_person_tenant_fk',
      columns: [table.personId, table.tenantId],
      foreignColumns: [persons.id, persons.tenantId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'billing_documents_order_tenant_fk',
      columns: [table.serviceOrderId, table.tenantId],
      foreignColumns: [serviceOrders.id, serviceOrders.tenantId],
    }).onDelete('restrict'),
    check('billing_documents_number_check', sql`${table.number} > 0`),
    check('billing_documents_products_check', sql`${table.productsAmount} >= 0`),
    check('billing_documents_services_check', sql`${table.servicesAmount} >= 0`),
    check('billing_documents_freight_check', sql`${table.freightAmount} >= 0`),
    check('billing_documents_discount_check', sql`${table.discountAmount} >= 0`),
    check('billing_documents_surcharge_check', sql`${table.surchargeAmount} >= 0`),
    check('billing_documents_total_check', sql`${table.totalAmount} >= 0`),
    check(
      'billing_documents_total_formula_check',
      sql`${table.totalAmount} = ${table.productsAmount} + ${table.servicesAmount} + ${table.freightAmount} - ${table.discountAmount} + ${table.surchargeAmount}`,
    ),
  ],
);
