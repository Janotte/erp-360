import { pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

// 1. Tabela de Tenants (as Empresas/Organizações)
export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 2. Tabela de Usuários (Vinculados a um Tenant)
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .references(() => tenants.id, { onDelete: 'cascade' })
    .notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(), // Para Bcrypt/Argon2
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 3. Helper Utilitário: Cria colunas padrão de Tenant para os outros módulos usarem
export const tenantColumns = {
  tenantId: uuid('tenant_id')
    .references(() => tenants.id, { onDelete: 'cascade' })
    .notNull(),
};