import { tenantColumns } from '@erp-360/mod-core';
import { sql } from 'drizzle-orm';
import {
  foreignKey,
  pgEnum,
  pgTable,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { cities } from './cities.ts';
import { persons } from './persons.ts';

// Enum de controle do tipo de endereço da pessoa
export const typePersonAddressEnum = pgEnum('type_person_address', [
  'Principal',
  'Faturamento',
  'Entrega',
  'Outro',
]);

export const personAddresses = pgTable(
  'person_addresses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...tenantColumns,
    personId: uuid('person_id').notNull(),
    type: typePersonAddressEnum('type').default('Principal').notNull(),
    postalCode: varchar('postal_code', { length: 9 }),
    street: varchar('street', { length: 60 }),
    number: varchar('number', { length: 60 }),
    complement: varchar('complement', { length: 60 }),
    neighborhood: varchar('neighborhood', { length: 60 }),
    cityId: uuid('city_id')
      .references(() => cities.id, {
        onDelete: 'restrict',
      })
      .notNull(),
  },
  (table) => [
    foreignKey({
      name: 'person_addresses_person_tenant_fk',
      columns: [table.personId, table.tenantId],
      foreignColumns: [persons.id, persons.tenantId],
    }).onDelete('cascade'),
    uniqueIndex('person_addresses_role_per_person')
      .on(table.tenantId, table.personId, table.type)
      .where(sql`${table.type} <> 'Outro'`),
  ],
);
