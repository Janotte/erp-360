import { tenantColumns } from '@erp-360/mod-core';
import {
  boolean,
  decimal,
  integer,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

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

export const countries = pgTable('countries', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 60 }).notNull(),
  code: varchar('code', { length: 4 }).notNull(),
});

export const states = pgTable('states', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 60 }).notNull(),
  abbreviation: varchar('abbreviation', { length: 2 }).notNull(),
  code: varchar('code', { length: 2 }).notNull(),
  region: varchar('region', { length: 20 }).notNull(),
  countryId: uuid('country_id')
    .references(() => countries.id, {
      onDelete: 'restrict',
    })
    .notNull(),
});

export const cities = pgTable('cities', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 60 }).notNull(),
  code: varchar('code', { length: 7 }).notNull(),
  stateId: uuid('state_id')
    .references(() => states.id, {
      onDelete: 'restrict',
    })
    .notNull(),
  is_capital: boolean('is_capital').default(false).notNull(),
  latitude: decimal('latitude', { precision: 10, scale: 8 }),
  longitude: decimal('longitude', { precision: 10, scale: 8 }),
  population: integer('population'),
  timezone: varchar('timezone', { length: 20 }),
});
