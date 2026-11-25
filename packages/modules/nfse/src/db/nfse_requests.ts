import { billingDocuments } from '@erp-360/mod-billing';
import { tenantColumns } from '@erp-360/mod-core';
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/** Pedido local da NFS-e. pending ainda não saiu da empresa. */
export const nfseRequestStatusEnum = pgEnum('nfse_request_status', [
  'pending',
  'authorized',
  'rejected',
  'canceled',
]);

/** Uma NFS-e por documento de faturamento. Não guarda XML. */
export const nfseRequests = pgTable(
  'nfse_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...tenantColumns,
    billingDocumentId: uuid('billing_document_id').notNull(),
    status: nfseRequestStatusEnum('status').default('pending').notNull(),
    /** Soma das linhas de serviço, em centavos. */
    serviceAmount: integer('service_amount').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    unique('nfse_requests_id_tenant_id_unique').on(table.id, table.tenantId),
    unique('nfse_requests_tenant_document_unique').on(table.tenantId, table.billingDocumentId),
    foreignKey({
      name: 'nfse_requests_document_tenant_fk',
      columns: [table.billingDocumentId, table.tenantId],
      foreignColumns: [billingDocuments.id, billingDocuments.tenantId],
    }).onDelete('restrict'),
    check('nfse_requests_service_amount_check', sql`${table.serviceAmount} > 0`),
  ],
);

/** Cópia do serviço no momento do pedido. O item pode mudar depois. */
export const nfseRequestLines = pgTable(
  'nfse_request_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...tenantColumns,
    requestId: uuid('request_id').notNull(),
    lineNumber: integer('line_number').notNull(),
    description: text('description').notNull(),
    nationalServiceCode: varchar('national_service_code', { length: 6 }),
    municipalServiceCode: varchar('municipal_service_code', { length: 3 }),
    issRate: numeric('iss_rate', { precision: 3, scale: 2 }),
    amount: integer('amount').notNull(),
  },
  (table) => [
    unique('nfse_request_lines_id_tenant_id_unique').on(table.id, table.tenantId),
    unique('nfse_request_lines_request_number_unique').on(
      table.tenantId,
      table.requestId,
      table.lineNumber,
    ),
    foreignKey({
      name: 'nfse_request_lines_request_tenant_fk',
      columns: [table.requestId, table.tenantId],
      foreignColumns: [nfseRequests.id, nfseRequests.tenantId],
    }).onDelete('cascade'),
    check('nfse_request_lines_number_check', sql`${table.lineNumber} >= 1`),
    check('nfse_request_lines_amount_check', sql`${table.amount} > 0`),
    check(
      'nfse_request_lines_description_check',
      sql`(
        length(trim(${table.description})) > 0
        and length(${table.description}) <= 2000
        and ${table.description} = upper(${table.description})
      )`,
    ),
    check(
      'nfse_request_lines_national_code_check',
      sql`${table.nationalServiceCode} is null or ${table.nationalServiceCode} ~ '^[0-9]{6}$'`,
    ),
    check(
      'nfse_request_lines_municipal_code_check',
      sql`${table.municipalServiceCode} is null or ${table.municipalServiceCode} ~ '^[0-9]{3}$'`,
    ),
    check(
      'nfse_request_lines_iss_rate_check',
      sql`${table.issRate} is null or (${table.issRate} >= 0 and ${table.issRate} < 10)`,
    ),
  ],
);
