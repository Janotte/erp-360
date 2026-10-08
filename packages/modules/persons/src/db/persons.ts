import { tenantColumns } from '@erp-360/mod-core';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// Enum de controle do tipo de pessoa
export const typePersonEnum = pgEnum('type_person', [
  'individual',
  'company',
  'foreigner',
]);

export const persons = pgTable(
  'persons',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...tenantColumns,
    type: typePersonEnum('type').default('individual').notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    /** Quando true, o nome é gravado como digitado (marcas, siglas). */
    preserveNameCasing: boolean('preserve_name_casing').default(false).notNull(),
    // CPF, CPNJ ou documento de estrangeiro
    taxId: varchar('tax_id', { length: 19 }),
    /* `taxpayerType` explícito na NF-e: 1 contribuinte, 2 isento, 9 não contribuinte.  */
    taxpayerType: smallint('taxpayer_type'),
    /** IE ou RG */
    stateRegistration: varchar('state_registration', { length: 20 }),
    /** Operações com produtor rural. */
    isRuralProducer: boolean('is_rural_producer').default(false).notNull(),
    /** Data de nascimento de (CPF) ou de fundação se (CNPJ), formato `YYYY-MM-DD`. */
    birthDate: date('birth_date'),
    /** E-mail gravado no XML da NF-e. Um único endereço, até 60 caracteres. */
    nfeEmail: varchar('nfe_email', { length: 60 }),
    /** Demais caixas que recebem DANFE, XML e boleto. */
    documentEmails: text('document_emails').array(),
    notes: text('notes'),
    isActive: boolean('is_active').default(true).notNull(),
    isVisible: boolean('is_visible').default(true).notNull(),
    /** URL da foto (armazenamento externo). */
    photo: varchar('photo', { length: 500 }),
    // Flags para identificar o papel da pessoa no ERP
    isClient: boolean('is_client').default(false).notNull(),
    isSupplier: boolean('is_supplier').default(false).notNull(),
    isEmployee: boolean('is_employee').default(false).notNull(),
    isFinancialInstitution: boolean('is_financial_institution').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    unique('persons_id_tenant_id_unique').on(table.id, table.tenantId),
    unique('persons_tenant_tax_id_unique').on(table.tenantId, table.taxId),
    check('persons_taxpayer_type_check', sql`${table.taxpayerType} in (1, 2, 9)`),
    check(
      'persons_tax_id_not_blank',
      sql`${table.taxId} is null or length(trim(${table.taxId})) > 0`,
    ),
  ],
);
