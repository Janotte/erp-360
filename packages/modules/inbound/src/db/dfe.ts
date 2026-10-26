import { tenants } from '@erp-360/mod-core';
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { nfeEnvironmentEnum } from './nfe_settings.ts';

export const dfeDocumentKindEnum = pgEnum('dfe_document_kind', [
  'summary',
  'nfe',
  'event_summary',
  'event',
  'unknown',
]);

/** Último NSU consultado na distribuição, separado por ambiente. */
export const dfeCursors = pgTable(
  'dfe_cursors',
  {
    tenantId: uuid('tenant_id').notNull(),
    environment: nfeEnvironmentEnum('environment').notNull(),
    ultNsu: varchar('ult_nsu', { length: 15 }).default('000000000000000').notNull(),
    maxNsu: varchar('max_nsu', { length: 15 }).default('000000000000000').notNull(),
    lastStatus: varchar('last_status', { length: 3 }),
    queriedAt: timestamp('queried_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.environment] }),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'dfe_cursors_tenant_id_tenants_id_fk',
    }).onDelete('cascade'),
    check(
      'dfe_cursors_nsu_digits',
      sql`${table.ultNsu} ~ '^[0-9]{15}$' and ${table.maxNsu} ~ '^[0-9]{15}$'`,
    ),
    check(
      'dfe_cursors_status_digits',
      sql`${table.lastStatus} is null or ${table.lastStatus} ~ '^[0-9]{3}$'`,
    ),
  ],
);

/** Documento recebido da distribuição: resumo, XML completo ou evento. */
export const dfeDocuments = pgTable(
  'dfe_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    environment: nfeEnvironmentEnum('environment').notNull(),
    nsu: varchar('nsu', { length: 15 }).notNull(),
    schemaName: varchar('schema_name', { length: 60 }).notNull(),
    kind: dfeDocumentKindEnum('kind').notNull(),
    accessKey: varchar('access_key', { length: 44 }),
    xml: text('xml').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique('dfe_documents_nsu_unique').on(table.tenantId, table.environment, table.nsu),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'dfe_documents_tenant_id_tenants_id_fk',
    }).onDelete('cascade'),
    index('dfe_documents_access_key_idx').on(
      table.tenantId,
      table.environment,
      table.accessKey,
    ),
    check('dfe_documents_nsu_digits', sql`${table.nsu} ~ '^[0-9]{15}$'`),
    check(
      'dfe_documents_access_key_digits',
      sql`${table.accessKey} is null or ${table.accessKey} ~ '^[0-9]{44}$'`,
    ),
  ],
);
