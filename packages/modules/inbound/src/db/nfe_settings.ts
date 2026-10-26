import { tenants } from '@erp-360/mod-core';
import { pgEnum, pgTable, uuid } from 'drizzle-orm/pg-core';

/** Ambiente em que a empresa consulta e, depois, emite NF-e. */
export const nfeEnvironmentEnum = pgEnum('nfe_environment', [
  'homologation',
  'production',
]);

export const nfeSettings = pgTable('nfe_settings', {
  tenantId: uuid('tenant_id')
    .primaryKey()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  environment: nfeEnvironmentEnum('environment').default('homologation').notNull(),
});
