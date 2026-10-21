import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  customType,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { tenantColumns } from './schema.ts';

const bytea = customType<{ data: Buffer; default: false }>({
  dataType() {
    return 'bytea';
  },
  toDriver(value: Buffer) {
    return value;
  },
  fromDriver(value: unknown) {
    if (Buffer.isBuffer(value)) return value;
    if (value instanceof Uint8Array) return Buffer.from(value);
    throw new Error('Valor bytea inválido.');
  },
});

export const certificateModelEnum = pgEnum('certificate_model', ['a1', 'a3']);

export const certificateEnvironmentEnum = pgEnum('certificate_environment', [
  'homologation',
  'production',
]);

export const tenantCertificates = pgTable(
  'tenant_certificates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...tenantColumns,
    model: certificateModelEnum('model').default('a1').notNull(),
    environment: certificateEnvironmentEnum('environment').notNull(),
    label: varchar('label', { length: 60 }),
    pfx: bytea('pfx').notNull(),
    passwordCipher: bytea('password_cipher').notNull(),
    serialNumber: varchar('serial_number', { length: 40 }).notNull(),
    thumbprintSha256: varchar('thumbprint_sha256', { length: 64 }).notNull(),
    subjectName: text('subject_name').notNull(),
    issuerName: text('issuer_name').notNull(),
    taxId: varchar('tax_id', { length: 14 }).notNull(),
    validFrom: timestamp('valid_from', { withTimezone: true, mode: 'date' }).notNull(),
    validUntil: timestamp('valid_until', { withTimezone: true, mode: 'date' }).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    unique('tenant_certificates_id_tenant_id_unique').on(table.id, table.tenantId),
    uniqueIndex('tenant_certificates_one_active_per_environment')
      .on(table.tenantId, table.environment)
      .where(sql`${table.isActive}`),
    index('tenant_certificates_tenant_valid_until_idx').on(
      table.tenantId,
      table.validUntil,
    ),
    check(
      'tenant_certificates_tax_id_digits',
      sql`${table.taxId} ~ '^[0-9]{14}$'`,
    ),
    check(
      'tenant_certificates_thumbprint_hex',
      sql`${table.thumbprintSha256} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      'tenant_certificates_serial_hex',
      sql`${table.serialNumber} ~ '^[0-9A-F]{1,40}$'`,
    ),
    check(
      'tenant_certificates_label_not_blank',
      sql`${table.label} is null or length(trim(${table.label})) > 0`,
    ),
  ],
);
