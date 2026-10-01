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
import { persons } from './persons.ts';

// Enum de controle do tipo de contato da pessoa
export const typePersonContactEnum = pgEnum('type_person_contact', [
  'Principal',
  'Outro',
]);

export const personContacts = pgTable(
  'person_contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...tenantColumns,
    personId: uuid('person_id').notNull(),
    /** Tipo de contato da pessoa */
    type: typePersonContactEnum('type').default('Principal').notNull(),
    /** Departamento para CNPJ ou relacionamento para CPF (ex: Financeiro, Vendas, Esposa, etc.) */
    relationship: varchar('relationship', { length: 40 }),
    /** Nome do contato */
    name: varchar('name', { length: 60 }).notNull(),
    /** Endereço de e-mail */
    email: varchar('email', { length: 80 }),
    /** Número do telefone fixo */
    phone: varchar('phone', { length: 20 }),
    /** Número do telefone celular */
    mobilePhone: varchar('mobile_phone', { length: 20 }),
    /** Número do WhatsApp */
    whatsapp: varchar('whatsapp', { length: 20 }),
  },
  (table) => [
    foreignKey({
      name: 'person_contacts_person_tenant_fk',
      columns: [table.personId, table.tenantId],
      foreignColumns: [persons.id, persons.tenantId],
    }).onDelete('cascade'),
    uniqueIndex('person_contacts_one_principal')
      .on(table.tenantId, table.personId)
      .where(sql`${table.type} = 'Principal'`),
  ],
);
