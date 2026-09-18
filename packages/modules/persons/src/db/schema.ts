import { pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core';
import { tenantColumns } from '@erp-360/mod-core';

export const persons = pgTable('persons', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...tenantColumns, // 🌟 injeta automaticamente 'tenant_id' nesta tabela!
  name: varchar('name', { length: 255 }).notNull(),
  document: varchar('document', { length: 30 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});