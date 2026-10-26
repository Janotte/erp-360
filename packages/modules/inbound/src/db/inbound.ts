import { catalogItems } from '@erp-360/mod-catalog';
import { tenantColumns } from '@erp-360/mod-core';
import { payables, planAccounts } from '@erp-360/mod-financial';
import { persons } from '@erp-360/mod-persons';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  customType,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Buffer; default: false }>({
  dataType() {
    return 'bytea';
  },
});

export const operationDirectionEnum = pgEnum('operation_direction', ['in', 'out']);

export const fiscalPurposeEnum = pgEnum('fiscal_purpose', [
  'resale',
  'industrialization',
  'consumption',
  'fixed_asset',
  'service',
]);

export const cfopScopeEnum = pgEnum('cfop_scope', ['internal', 'interstate', 'import']);

export const inboundStatusEnum = pgEnum('inbound_status', [
  'pending',
  'pre_note',
  'divergent',
  'posted',
  'reversed',
  'ignored',
  'discovered',
]);

export const recipientManifestationEnum = pgEnum('recipient_manifestation', [
  'none',
  'aware',
  'confirmed',
  'unaware',
  'not_performed',
]);

export const nfeAuthorizationStatusEnum = pgEnum('nfe_authorization_status', [
  'authorized',
  'denied',
  'cancelled',
]);

export const stockDirectionEnum = pgEnum('stock_direction', ['in', 'out']);

export const operationNatures = pgTable(
  'operation_natures',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...tenantColumns,
    code: varchar('code', { length: 20 }).notNull(),
    name: varchar('name', { length: 60 }).notNull(),
    direction: operationDirectionEnum('direction').notNull(),
    fiscalPurpose: fiscalPurposeEnum('fiscal_purpose').notNull(),
    movesStock: boolean('moves_stock').notNull(),
    createsPayable: boolean('creates_payable').notNull(),
    updatesAverageCost: boolean('updates_average_cost').notNull(),
    recordsEntryPrice: boolean('records_entry_price').notNull(),
    suggestsListPrice: boolean('suggests_list_price').notNull(),
    freightInCost: boolean('freight_in_cost').default(true).notNull(),
    insuranceInCost: boolean('insurance_in_cost').default(true).notNull(),
    otherInCost: boolean('other_in_cost').default(true).notNull(),
    discountInCost: boolean('discount_in_cost').default(true).notNull(),
    ipiInCost: boolean('ipi_in_cost').default(false).notNull(),
    stInCost: boolean('st_in_cost').default(true).notNull(),
    icmsInCost: boolean('icms_in_cost').default(false).notNull(),
    planAccountId: uuid('plan_account_id'),
    isActive: boolean('is_active').default(true).notNull(),
  },
  (table) => [
    unique('operation_natures_id_tenant_id_unique').on(table.id, table.tenantId),
    unique('operation_natures_tenant_code_unique').on(table.tenantId, table.code),
    foreignKey({
      name: 'operation_natures_plan_account_tenant_fk',
      columns: [table.planAccountId, table.tenantId],
      foreignColumns: [planAccounts.id, planAccounts.tenantId],
    }).onDelete('restrict'),
  ],
);

export const cfopEntryRules = pgTable(
  'cfop_entry_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...tenantColumns,
    sourceCfop: varchar('source_cfop', { length: 4 }).notNull(),
    scope: cfopScopeEnum('scope').notNull(),
    fiscalPurpose: fiscalPurposeEnum('fiscal_purpose').notNull(),
    entryCfop: varchar('entry_cfop', { length: 4 }).notNull(),
  },
  (table) => [
    unique('cfop_entry_rules_identity_unique').on(
      table.tenantId,
      table.sourceCfop,
      table.scope,
      table.fiscalPurpose,
    ),
    check('cfop_entry_rules_digits', sql`${table.sourceCfop} ~ '^[0-9]{4}$' and ${table.entryCfop} ~ '^[0-9]{4}$'`),
  ],
);

export const supplierItemLinks = pgTable(
  'supplier_item_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...tenantColumns,
    supplierId: uuid('supplier_id').notNull(),
    supplierCode: varchar('supplier_code', { length: 60 }).notNull(),
    itemId: uuid('item_id').notNull(),
    supplierUnit: varchar('supplier_unit', { length: 6 }).notNull(),
    factor: numeric('factor', { precision: 15, scale: 6 }).default('1').notNull(),
  },
  (table) => [
    unique('supplier_item_links_code_unique').on(
      table.tenantId,
      table.supplierId,
      table.supplierCode,
    ),
    foreignKey({
      name: 'supplier_item_links_supplier_tenant_fk',
      columns: [table.supplierId, table.tenantId],
      foreignColumns: [persons.id, persons.tenantId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'supplier_item_links_item_tenant_fk',
      columns: [table.itemId, table.tenantId],
      foreignColumns: [catalogItems.id, catalogItems.tenantId],
    }).onDelete('restrict'),
    check('supplier_item_links_factor_positive', sql`${table.factor} > 0`),
    check(
      'supplier_item_links_code_not_blank',
      sql`length(trim(${table.supplierCode})) > 0`,
    ),
  ],
);

export const inboundDocuments = pgTable(
  'inbound_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...tenantColumns,
    status: inboundStatusEnum('status').default('pre_note').notNull(),
    model: varchar('model', { length: 2 }).default('55').notNull(),
    accessKey: varchar('access_key', { length: 44 }),
    number: varchar('number', { length: 9 }).notNull(),
    series: varchar('series', { length: 3 }).notNull(),
    issueOn: date('issue_on').notNull(),
    /** Preenchida na efetivação, no fuso da empresa. */
    inboundOn: date('inbound_on'),
    supplierId: uuid('supplier_id'),
    supplierTaxId: varchar('supplier_tax_id', { length: 14 }),
    supplierName: varchar('supplier_name', { length: 120 }),
    natureId: uuid('nature_id'),
    hasProtocol: boolean('has_protocol').default(false).notNull(),
    recipientManifestation: recipientManifestationEnum('recipient_manifestation')
      .default('none')
      .notNull(),
    authorizationStatus: nfeAuthorizationStatusEnum('authorization_status')
      .default('authorized')
      .notNull(),
    totalAmount: integer('total_amount').notNull(),
    movesStock: boolean('moves_stock'),
    createsPayable: boolean('creates_payable'),
    updatesAverageCost: boolean('updates_average_cost'),
    postedAt: timestamp('posted_at', { withTimezone: true }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    unique('inbound_documents_id_tenant_id_unique').on(table.id, table.tenantId),
    uniqueIndex('inbound_documents_tenant_access_key_unique')
      .on(table.tenantId, table.accessKey)
      .where(sql`${table.accessKey} is not null`),
    foreignKey({
      name: 'inbound_documents_supplier_tenant_fk',
      columns: [table.supplierId, table.tenantId],
      foreignColumns: [persons.id, persons.tenantId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'inbound_documents_nature_tenant_fk',
      columns: [table.natureId, table.tenantId],
      foreignColumns: [operationNatures.id, operationNatures.tenantId],
    }).onDelete('restrict'),
    index('inbound_documents_tenant_status_idx').on(table.tenantId, table.status, table.issueOn),
    check(
      'inbound_documents_access_key_digits',
      sql`${table.accessKey} is null or ${table.accessKey} ~ '^[0-9]{44}$'`,
    ),
    check('inbound_documents_total_non_negative', sql`${table.totalAmount} >= 0`),
  ],
);

export const inboundDocumentFiles = pgTable(
  'inbound_document_files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...tenantColumns,
    documentId: uuid('document_id').notNull(),
    content: bytea('content').notNull(),
    sha256: varchar('sha256', { length: 64 }).notNull(),
    fileName: varchar('file_name', { length: 255 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: 'inbound_document_files_document_tenant_fk',
      columns: [table.documentId, table.tenantId],
      foreignColumns: [inboundDocuments.id, inboundDocuments.tenantId],
    }).onDelete('cascade'),
    check('inbound_document_files_sha256_hex', sql`${table.sha256} ~ '^[0-9a-f]{64}$'`),
  ],
);

export const inboundDocumentLines = pgTable(
  'inbound_document_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...tenantColumns,
    documentId: uuid('document_id').notNull(),
    lineNumber: integer('line_number').notNull(),
    supplierCode: varchar('supplier_code', { length: 60 }).notNull(),
    description: varchar('description', { length: 120 }).notNull(),
    ncmCode: varchar('ncm_code', { length: 8 }),
    /** CEST da NF-e, 7 dígitos, quando o item tiver. */
    cestCode: varchar('cest_code', { length: 7 }),
    barcode: varchar('barcode', { length: 14 }),
    xmlCfop: varchar('xml_cfop', { length: 4 }).notNull(),
    entryCfop: varchar('entry_cfop', { length: 4 }),
    commercialQty: numeric('commercial_qty', { precision: 15, scale: 4 }).notNull(),
    commercialUnit: varchar('commercial_unit', { length: 6 }).notNull(),
    factor: numeric('factor', { precision: 15, scale: 6 }).default('1').notNull(),
    unitPrice: numeric('unit_price', { precision: 15, scale: 4 }).notNull(),
    lineAmount: integer('line_amount').notNull(),
    freightAmount: integer('freight_amount').default(0).notNull(),
    insuranceAmount: integer('insurance_amount').default(0).notNull(),
    otherAmount: integer('other_amount').default(0).notNull(),
    discountAmount: integer('discount_amount').default(0).notNull(),
    ipiAmount: integer('ipi_amount').default(0).notNull(),
    stAmount: integer('st_amount').default(0).notNull(),
    icmsAmount: integer('icms_amount').default(0).notNull(),
    itemId: uuid('item_id'),
    unitCost: numeric('unit_cost', { precision: 15, scale: 4 }),
  },
  (table) => [
    unique('inbound_document_lines_id_tenant_id_unique').on(table.id, table.tenantId),
    unique('inbound_document_lines_number_unique').on(
      table.tenantId,
      table.documentId,
      table.lineNumber,
    ),
    foreignKey({
      name: 'inbound_document_lines_document_tenant_fk',
      columns: [table.documentId, table.tenantId],
      foreignColumns: [inboundDocuments.id, inboundDocuments.tenantId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'inbound_document_lines_item_tenant_fk',
      columns: [table.itemId, table.tenantId],
      foreignColumns: [catalogItems.id, catalogItems.tenantId],
    }).onDelete('restrict'),
    check('inbound_document_lines_qty_positive', sql`${table.commercialQty} > 0`),
    check('inbound_document_lines_factor_positive', sql`${table.factor} > 0`),
    check(
      'inbound_document_lines_cfop_digits',
      sql`${table.xmlCfop} ~ '^[0-9]{4}$' and (${table.entryCfop} is null or ${table.entryCfop} ~ '^[0-9]{4}$')`,
    ),
    check(
      'inbound_document_lines_cest_check',
      sql`${table.cestCode} is null or ${table.cestCode} ~ '^[0-9]{7}$'`,
    ),
  ],
);

export const inboundDocumentInstallments = pgTable(
  'inbound_document_installments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...tenantColumns,
    documentId: uuid('document_id').notNull(),
    number: varchar('number', { length: 3 }).notNull(),
    dueOn: date('due_on').notNull(),
    amount: integer('amount').notNull(),
    payableId: uuid('payable_id'),
  },
  (table) => [
    unique('inbound_document_installments_number_unique').on(
      table.tenantId,
      table.documentId,
      table.number,
    ),
    foreignKey({
      name: 'inbound_document_installments_document_tenant_fk',
      columns: [table.documentId, table.tenantId],
      foreignColumns: [inboundDocuments.id, inboundDocuments.tenantId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'inbound_document_installments_payable_tenant_fk',
      columns: [table.payableId, table.tenantId],
      foreignColumns: [payables.id, payables.tenantId],
    }).onDelete('restrict'),
    check('inbound_document_installments_amount_positive', sql`${table.amount} > 0`),
  ],
);

export const stockBalances = pgTable(
  'stock_balances',
  {
    ...tenantColumns,
    itemId: uuid('item_id').notNull(),
    quantity: numeric('quantity', { precision: 18, scale: 4 }).default('0').notNull(),
    averageCost: numeric('average_cost', { precision: 15, scale: 4 }).default('0').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.itemId] }),
    foreignKey({
      name: 'stock_balances_item_tenant_fk',
      columns: [table.itemId, table.tenantId],
      foreignColumns: [catalogItems.id, catalogItems.tenantId],
    }).onDelete('restrict'),
    check('stock_balances_quantity_non_negative', sql`${table.quantity} >= 0`),
  ],
);

export const stockMovements = pgTable(
  'stock_movements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...tenantColumns,
    itemId: uuid('item_id').notNull(),
    documentId: uuid('document_id').notNull(),
    lineId: uuid('line_id').notNull(),
    direction: stockDirectionEnum('direction').notNull(),
    quantity: numeric('quantity', { precision: 18, scale: 4 }).notNull(),
    unitCost: numeric('unit_cost', { precision: 15, scale: 4 }).notNull(),
    occurredOn: date('occurred_on').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: 'stock_movements_item_tenant_fk',
      columns: [table.itemId, table.tenantId],
      foreignColumns: [catalogItems.id, catalogItems.tenantId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'stock_movements_document_tenant_fk',
      columns: [table.documentId, table.tenantId],
      foreignColumns: [inboundDocuments.id, inboundDocuments.tenantId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'stock_movements_line_tenant_fk',
      columns: [table.lineId, table.tenantId],
      foreignColumns: [inboundDocumentLines.id, inboundDocumentLines.tenantId],
    }).onDelete('restrict'),
    index('stock_movements_document_idx').on(table.tenantId, table.documentId),
    check('stock_movements_quantity_positive', sql`${table.quantity} > 0`),
  ],
);
