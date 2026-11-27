import { billingDocuments } from '@erp-360/mod-billing';
import { tenantColumns, tenants } from '@erp-360/mod-core';
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { nfseEnvironmentEnum } from './nfse_settings.ts';

/** Pedido local da NFS-e. pending ainda não saiu da empresa. */
export const nfseRequestStatusEnum = pgEnum('nfse_request_status', [
  'pending',
  'authorized',
  'rejected',
  'canceled',
]);

/** Numeração da DPS por empresa e série. A série fica congelada no pedido. */
export const nfseDpsCounters = pgTable(
  'nfse_dps_counters',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    series: varchar('series', { length: 5 }).notNull(),
    lastNumber: integer('last_number').default(0).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.series] }),
    check(
      'nfse_dps_counters_series_check',
      sql`${table.series} ~ '^[0-9]{5}$' and ${table.series}::integer between 1 and 49999`,
    ),
    check('nfse_dps_counters_last_number_check', sql`${table.lastNumber} >= 0`),
  ],
);

/** Pedido de NFS-e ligado ao documento. Cancelados ficam no histórico. */
export const nfseRequests = pgTable(
  'nfse_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...tenantColumns,
    billingDocumentId: uuid('billing_document_id').notNull(),
    status: nfseRequestStatusEnum('status').default('pending').notNull(),
    /** Soma das linhas de serviço, em centavos. */
    serviceAmount: integer('service_amount').notNull(),
    /** Série usada neste pedido. Não muda se a configuração mudar depois. */
    series: varchar('series', { length: 5 }),
    dpsNumber: integer('dps_number'),
    dpsId: varchar('dps_id', { length: 45 }),
    accessKey: varchar('access_key', { length: 50 }),
    environment: nfseEnvironmentEnum('environment'),
    statusMessage: text('status_message'),
    nfseXml: text('nfse_xml'),
    sentAt: timestamp('sent_at', { withTimezone: true, mode: 'date' }),
    claimedAt: timestamp('claimed_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    unique('nfse_requests_id_tenant_id_unique').on(table.id, table.tenantId),
    /** Um pedido vivo por documento; vários cancelados podem coexistir. */
    uniqueIndex('nfse_requests_tenant_document_live_unique')
      .on(table.tenantId, table.billingDocumentId)
      .where(sql`${table.status} in ('pending', 'rejected', 'authorized')`),
    uniqueIndex('nfse_requests_series_number_unique')
      .on(table.tenantId, table.series, table.dpsNumber)
      .where(sql`${table.dpsNumber} is not null`),
    check(
      'nfse_requests_series_check',
      sql`${table.series} is null or (
        ${table.series} ~ '^[0-9]{5}$' and ${table.series}::integer between 1 and 49999
      )`,
    ),
    check(
      'nfse_requests_dps_number_check',
      sql`${table.dpsNumber} is null or ${table.dpsNumber} > 0`,
    ),
    check(
      'nfse_requests_dps_id_check',
      sql`${table.dpsId} is null or ${table.dpsId} ~ '^DPS[0-9]{42}$'`,
    ),
    check(
      'nfse_requests_access_key_check',
      sql`${table.accessKey} is null or ${table.accessKey} ~ '^[0-9]{50}$'`,
    ),
    check(
      'nfse_requests_identity_check',
      sql`${table.dpsNumber} is null or (
        ${table.series} is not null and ${table.dpsId} is not null and ${table.environment} is not null
      )`,
    ),
    check(
      'nfse_requests_status_message_check',
      sql`${table.statusMessage} is null or (
        length(trim(${table.statusMessage})) > 0 and length(${table.statusMessage}) <= 2000
      )`,
    ),
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

/** Eventos SEFIN aceitos para um pedido (ex.: cancelamento e101101). */
export const nfseEvents = pgTable(
  'nfse_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...tenantColumns,
    requestId: uuid('request_id').notNull(),
    type: varchar('type', { length: 16 }).notNull(),
    sequence: integer('sequence').notNull(),
    reasonCode: varchar('reason_code', { length: 1 }),
    reasonText: text('reason_text'),
    eventXml: text('event_xml').notNull(),
    registeredAt: timestamp('registered_at', { withTimezone: true, mode: 'date' }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    unique('nfse_events_id_tenant_id_unique').on(table.id, table.tenantId),
    unique('nfse_events_request_type_sequence_unique').on(
      table.tenantId,
      table.requestId,
      table.type,
      table.sequence,
    ),
    foreignKey({
      name: 'nfse_events_request_tenant_fk',
      columns: [table.requestId, table.tenantId],
      foreignColumns: [nfseRequests.id, nfseRequests.tenantId],
    }).onDelete('cascade'),
    check(
      'nfse_events_type_check',
      sql`${table.type} ~ '^[a-z][a-z0-9]{0,15}$'`,
    ),
    check('nfse_events_sequence_check', sql`${table.sequence} between 1 and 999`),
    check(
      'nfse_events_reason_code_check',
      sql`${table.reasonCode} is null or ${table.reasonCode} in ('1', '2', '9')`,
    ),
    check(
      'nfse_events_reason_text_check',
      sql`${table.reasonText} is null or (
        length(trim(${table.reasonText})) >= 15 and length(${table.reasonText}) <= 255
      )`,
    ),
    check(
      'nfse_events_event_xml_check',
      sql`length(trim(${table.eventXml})) > 0 and length(${table.eventXml}) <= 500000`,
    ),
  ],
);
