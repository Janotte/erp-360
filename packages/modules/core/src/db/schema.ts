import { pgEnum, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

/** CRT do emitente na NF-e: 1, 2, 3 ou 4. */
export const tenantCrtEnum = pgEnum('tenant_crt', ['1', '2', '3', '4']);

/** Situação da empresa. Ajuste reservado ao administrador do sistema. */
export const tenantStatusEnum = pgEnum('tenant_status', [
  'active',
  'inactive',
  'suspended',
  'archived',
]);

// 1. Tabela de Tenants (as Empresas/Organizações)
export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Razão social. xNome da NF-e aceita até 60. */
  name: varchar('name', { length: 60 }).notNull(),
  /** Nome fantasia. xFant da NF-e aceita até 60. */
  tradeName: varchar('trade_name', { length: 60 }).notNull(),
  cnpj: varchar('cnpj', { length: 14 }).notNull().unique(),
  /** Inscrição estadual. A NF-e aceita até 14, inclusive ISENTO. */
  stateRegistration: varchar('state_registration', { length: 14 }),
  /** Inscrição municipal. A NF-e aceita até 15. */
  municipalRegistration: varchar('municipal_registration', { length: 15 }),
  /** CNAE principal, 7 dígitos. */
  cnae: varchar('cnae', { length: 7 }),
  /** E-mail do emitente, usado sobretudo na NFS-e. */
  email: varchar('email', { length: 80 }),
  /** Telefone só com dígitos. A NF-e aceita de 6 a 14. */
  phone: varchar('phone', { length: 14 }),
  /** Celular só com dígitos, de 6 a 14. */
  mobilePhone: varchar('mobile_phone', { length: 14 }),
  /** WhatsApp só com dígitos, de 6 a 14. */
  whatsapp: varchar('whatsapp', { length: 14 }),
  /** URL da logo. */
  logo: varchar('logo', { length: 500 }),
  crt: tenantCrtEnum('crt').default('1').notNull(),
  status: tenantStatusEnum('status').default('active').notNull(),
  /** CEP só com dígitos. A NF-e aceita 8. */
  postalCode: varchar('postal_code', { length: 8 }),
  street: varchar('street', { length: 60 }),
  number: varchar('number', { length: 60 }),
  complement: varchar('complement', { length: 60 }),
  neighborhood: varchar('neighborhood', { length: 60 }),
  /** Município do emitente. Nulo até o cadastro fiscal ser preenchido. */
  cityId: uuid('city_id'),
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
