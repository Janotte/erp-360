import { tenantColumns } from '@erp-360/mod-core';
import { boolean, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const persons = pgTable('persons', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...tenantColumns, // 🌟 Garante o isolamento Multi-Tenant por coluna

  name: varchar('name', { length: 255 }).notNull(),
  document: varchar('document', { length: 20 }), // CPF ou CNPJ
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 20 }),

  // Flags para identificar o papel da pessoa no ERP (pode acumular papéis)
  isClient: boolean('is_client').default(false).notNull(),
  isSupplier: boolean('is_supplier').default(false).notNull(),
  isEmployee: boolean('is_employee').default(false).notNull(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
});
