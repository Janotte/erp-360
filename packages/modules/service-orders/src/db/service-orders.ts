import { catalogItems } from '@erp-360/mod-catalog';
import { tenantColumns, tenants, users } from '@erp-360/mod-core';
import {
  cardBrands,
  meansOfPayment,
  paymentIntegrationTypeEnum,
  paymentInterestTypeEnum,
  paymentMethods,
  paymentReceiptKindEnum,
} from '@erp-360/mod-financial';
import { persons } from '@erp-360/mod-persons';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  integer,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/** Situação do atendimento. */
export const serviceOrderStatusEnum = pgEnum('service_order_status', [
  'open',
  'analyzing',
  'waiting_approval',
  'waiting_parts',
  'in_progress',
  'ready',
  'delivered',
  'cancelled',
]);

/** Tipo de atendimento. */
export const serviceOrderAttendanceEnum = pgEnum('service_order_attendance', [
  'walk_in',
  'warranty',
  'rework',
  'contract',
]);

/** Onde o serviço é feito. */
export const serviceOrderLocationEnum = pgEnum('service_order_location', [
  'remote',
  'internal',
  'external',
]);

/** Produto ou serviço da linha. Igual ao tipo do item do catálogo. */
export const serviceOrderLineKindEnum = pgEnum('service_order_line_kind', [
  'product',
  'service',
]);

export const serviceOrderStatuses = serviceOrderStatusEnum.enumValues;
export const serviceOrderAttendances = serviceOrderAttendanceEnum.enumValues;
export const serviceOrderLocations = serviceOrderLocationEnum.enumValues;
export const serviceOrderLineKinds = serviceOrderLineKindEnum.enumValues;

/** Próximo número da empresa. A chave é a própria empresa. */
export const serviceOrderCounters = pgTable(
  'service_order_counters',
  {
    tenantId: uuid('tenant_id')
      .primaryKey()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    lastNumber: integer('last_number').default(0).notNull(),
  },
  (table) => [
    check('service_order_counters_last_number_check', sql`${table.lastNumber} >= 0`),
  ],
);

/** Uma configuração por empresa: títulos, assinaturas e o campo da lista. */
export const serviceOrderSettings = pgTable(
  'service_order_settings',
  {
    tenantId: uuid('tenant_id')
      .primaryKey()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    sectionTitle: varchar('section_title', { length: 60 }).notNull(),
    productsTitle: varchar('products_title', { length: 60 }).notNull(),
    servicesTitle: varchar('services_title', { length: 60 }).notNull(),
    technicianSignatureLabel: varchar('technician_signature_label', { length: 60 }).notNull(),
    customerSignatureLabel: varchar('customer_signature_label', { length: 60 }).notNull(),
    /** Campo ativo cujo valor aparece na lista. */
    summarySlot: varchar('summary_slot', { length: 7 }).notNull(),
  },
  (table) => [
    check(
      'service_order_settings_section_title_check',
      sql`length(trim(${table.sectionTitle})) > 0`,
    ),
    check(
      'service_order_settings_products_title_check',
      sql`length(trim(${table.productsTitle})) > 0`,
    ),
    check(
      'service_order_settings_services_title_check',
      sql`length(trim(${table.servicesTitle})) > 0`,
    ),
    check(
      'service_order_settings_technician_signature_check',
      sql`length(trim(${table.technicianSignatureLabel})) > 0`,
    ),
    check(
      'service_order_settings_customer_signature_check',
      sql`length(trim(${table.customerSignatureLabel})) > 0`,
    ),
    check(
      'service_order_settings_summary_slot_check',
      sql`${table.summarySlot} ~ '^field(0[1-9]|1[01])$'`,
    ),
  ],
);

/** Onze endereços fixos. O código não muda; a aba muda rótulo, ativo, obrigatório e largura. */
export const serviceOrderFields = pgTable(
  'service_order_fields',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...tenantColumns,
    slot: varchar('slot', { length: 7 }).notNull(),
    label: varchar('label', { length: 60 }).notNull(),
    isActive: boolean('is_active').notNull(),
    isRequired: boolean('is_required').notNull(),
    width: smallint('width').notNull(),
  },
  (table) => [
    unique('service_order_fields_id_tenant_id_unique').on(table.id, table.tenantId),
    unique('service_order_fields_tenant_slot_unique').on(table.tenantId, table.slot),
    check('service_order_fields_slot_check', sql`${table.slot} ~ '^field(0[1-9]|1[01])$'`),
    check('service_order_fields_width_check', sql`${table.width} in (4, 6, 12)`),
    check(
      'service_order_fields_active_label_check',
      sql`${table.isActive} = false or length(trim(${table.label})) > 0`,
    ),
  ],
);

/** Cinco linhas de observação da empresa. A ordem copia o texto na abertura. */
export const serviceOrderNoteLines = pgTable(
  'service_order_note_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...tenantColumns,
    slot: varchar('slot', { length: 6 }).notNull(),
    body: varchar('body', { length: 500 }).notNull(),
    isActive: boolean('is_active').notNull(),
  },
  (table) => [
    unique('service_order_note_lines_id_tenant_id_unique').on(table.id, table.tenantId),
    unique('service_order_note_lines_tenant_slot_unique').on(table.tenantId, table.slot),
    check('service_order_note_lines_slot_check', sql`${table.slot} ~ '^line0[1-5]$'`),
  ],
);

/** Núcleo da ordem, cópia do cliente, totais e cópia do pagamento. */
export const serviceOrders = pgTable(
  'service_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...tenantColumns,
    number: integer('number').notNull(),
    status: serviceOrderStatusEnum('status').default('open').notNull(),
    attendance: serviceOrderAttendanceEnum('attendance').default('walk_in').notNull(),
    location: serviceOrderLocationEnum('location').default('remote').notNull(),
    openedAt: timestamp('opened_at', { withTimezone: true }).defaultNow().notNull(),
    promisedAt: timestamp('promised_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    openedByUserId: uuid('opened_by_user_id').notNull(),
    originOrderId: uuid('origin_order_id'),
    personId: uuid('person_id').notNull(),
    customerName: varchar('customer_name', { length: 120 }).notNull(),
    customerTaxId: varchar('customer_tax_id', { length: 19 }),
    customerPhone: varchar('customer_phone', { length: 20 }),
    customerMobilePhone: varchar('customer_mobile_phone', { length: 20 }),
    customerWhatsapp: varchar('customer_whatsapp', { length: 20 }),
    customerEmail: varchar('customer_email', { length: 80 }),
    /** Logradouro, número, complemento e CEP no momento da escolha. */
    customerStreetLine: varchar('customer_street_line', { length: 200 }),
    customerNeighborhood: varchar('customer_neighborhood', { length: 60 }),
    /** Cidade / UF. */
    customerCityLine: varchar('customer_city_line', { length: 80 }),
    internalNotes: text('internal_notes').default('').notNull(),
    freightAmount: integer('freight_amount').default(0).notNull(),
    discountAmount: integer('discount_amount').default(0).notNull(),
    surchargeAmount: integer('surcharge_amount').default(0).notNull(),
    productsAmount: integer('products_amount').default(0).notNull(),
    servicesAmount: integer('services_amount').default(0).notNull(),
    totalAmount: integer('total_amount').default(0).notNull(),
    paymentMethodId: uuid('payment_method_id'),
    paymentInstallments: integer('payment_installments'),
    meansOfPaymentId: uuid('means_of_payment_id').references(() => meansOfPayment.id, {
      onDelete: 'restrict',
    }),
    interestType: paymentInterestTypeEnum('interest_type'),
    interestRateBps: integer('interest_rate_bps'),
    administrativeFeeBps: integer('administrative_fee_bps'),
    fixedFeeAmount: integer('fixed_fee_amount'),
    firstDueDays: integer('first_due_days'),
    intervalDays: integer('interval_days'),
    receiptKind: paymentReceiptKindEnum('receipt_kind'),
    integrationType: paymentIntegrationTypeEnum('integration_type'),
    acquirerId: uuid('acquirer_id'),
    cardBrandId: uuid('card_brand_id').references(() => cardBrands.id, {
      onDelete: 'restrict',
    }),
    /** Preenchido ao entregar ou cancelar. A partir daí o comprovante usa o rótulo gravado. */
    labelFrozenAt: timestamp('label_frozen_at', { withTimezone: true }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    unique('service_orders_id_tenant_id_unique').on(table.id, table.tenantId),
    unique('service_orders_tenant_number_unique').on(table.tenantId, table.number),
    foreignKey({
      name: 'service_orders_opened_by_tenant_fk',
      columns: [table.openedByUserId, table.tenantId],
      foreignColumns: [users.id, users.tenantId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'service_orders_person_tenant_fk',
      columns: [table.personId, table.tenantId],
      foreignColumns: [persons.id, persons.tenantId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'service_orders_origin_tenant_fk',
      columns: [table.originOrderId, table.tenantId],
      foreignColumns: [table.id, table.tenantId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'service_orders_payment_method_tenant_fk',
      columns: [table.paymentMethodId, table.tenantId],
      foreignColumns: [paymentMethods.id, paymentMethods.tenantId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'service_orders_acquirer_tenant_fk',
      columns: [table.acquirerId, table.tenantId],
      foreignColumns: [persons.id, persons.tenantId],
    }).onDelete('restrict'),
    check('service_orders_number_check', sql`${table.number} > 0`),
    check('service_orders_freight_check', sql`${table.freightAmount} >= 0`),
    check('service_orders_discount_check', sql`${table.discountAmount} >= 0`),
    check('service_orders_surcharge_check', sql`${table.surchargeAmount} >= 0`),
    check('service_orders_products_check', sql`${table.productsAmount} >= 0`),
    check('service_orders_services_check', sql`${table.servicesAmount} >= 0`),
    check('service_orders_total_check', sql`${table.totalAmount} >= 0`),
    check(
      'service_orders_total_formula_check',
      sql`${table.totalAmount} = ${table.productsAmount} + ${table.servicesAmount} + ${table.freightAmount} - ${table.discountAmount} + ${table.surchargeAmount}`,
    ),
    check(
      'service_orders_installments_check',
      sql`${table.paymentInstallments} is null or ${table.paymentInstallments} between 1 and 48`,
    ),
    check(
      'service_orders_origin_attendance_check',
      sql`${table.originOrderId} is null or ${table.attendance} in ('warranty', 'rework')`,
    ),
    check(
      'service_orders_origin_not_self_check',
      sql`${table.originOrderId} is null or ${table.originOrderId} <> ${table.id}`,
    ),
    check(
      'service_orders_delivered_at_check',
      sql`(${table.status} = 'delivered') = (${table.deliveredAt} is not null)`,
    ),
    check(
      'service_orders_label_frozen_check',
      sql`(${table.status} in ('delivered', 'cancelled')) = (${table.labelFrozenAt} is not null)`,
    ),
    check(
      'service_orders_payment_copy_check',
      sql`(
        ${table.paymentMethodId} is null
        and ${table.paymentInstallments} is null
        and ${table.meansOfPaymentId} is null
        and ${table.interestType} is null
        and ${table.interestRateBps} is null
        and ${table.administrativeFeeBps} is null
        and ${table.fixedFeeAmount} is null
        and ${table.firstDueDays} is null
        and ${table.intervalDays} is null
        and ${table.receiptKind} is null
        and ${table.integrationType} is null
        and ${table.acquirerId} is null
        and ${table.cardBrandId} is null
      ) or (
        ${table.paymentMethodId} is not null
        and ${table.paymentInstallments} is not null
        and ${table.meansOfPaymentId} is not null
        and ${table.interestType} is not null
        and ${table.interestRateBps} is not null
        and ${table.administrativeFeeBps} is not null
        and ${table.fixedFeeAmount} is not null
        and ${table.firstDueDays} is not null
        and ${table.intervalDays} is not null
        and ${table.receiptKind} is not null
      )`,
    ),
    check(
      'service_orders_payment_amounts_check',
      sql`(
        ${table.interestRateBps} is null or ${table.interestRateBps} >= 0
      ) and (
        ${table.administrativeFeeBps} is null or ${table.administrativeFeeBps} >= 0
      ) and (
        ${table.fixedFeeAmount} is null or ${table.fixedFeeAmount} >= 0
      ) and (
        ${table.firstDueDays} is null or ${table.firstDueDays} >= 0
      ) and (
        ${table.intervalDays} is null or ${table.intervalDays} >= 0
      )`,
    ),
  ],
);

/** Valor do endereço nesta ordem. Rótulo, largura e ativo entram no congelamento. */
export const serviceOrderFieldValues = pgTable(
  'service_order_field_values',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...tenantColumns,
    orderId: uuid('order_id').notNull(),
    slot: varchar('slot', { length: 7 }).notNull(),
    value: varchar('value', { length: 2000 }),
    label: varchar('label', { length: 60 }),
    width: smallint('width'),
    isActive: boolean('is_active'),
  },
  (table) => [
    unique('service_order_field_values_id_tenant_id_unique').on(table.id, table.tenantId),
    unique('service_order_field_values_order_slot_unique').on(
      table.tenantId,
      table.orderId,
      table.slot,
    ),
    foreignKey({
      name: 'service_order_field_values_order_tenant_fk',
      columns: [table.orderId, table.tenantId],
      foreignColumns: [serviceOrders.id, serviceOrders.tenantId],
    }).onDelete('cascade'),
    check(
      'service_order_field_values_slot_check',
      sql`${table.slot} ~ '^field(0[1-9]|1[01])$'`,
    ),
    check(
      'service_order_field_values_short_value_check',
      sql`${table.value} is null or ${table.slot} ~ '^field(08|09|10|11)$' or length(${table.value}) <= 120`,
    ),
    check(
      'service_order_field_values_width_check',
      sql`${table.width} is null or ${table.width} in (4, 6, 12)`,
    ),
    check(
      'service_order_field_values_freeze_check',
      sql`(
        ${table.label} is null and ${table.width} is null and ${table.isActive} is null
      ) or (
        ${table.label} is not null
        and length(trim(${table.label})) > 0
        and ${table.width} is not null
        and ${table.isActive} is not null
      )`,
    ),
  ],
);

/** Texto de observação copiado para a ordem. A aba não reescreve esta cópia. */
export const serviceOrderNotes = pgTable(
  'service_order_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...tenantColumns,
    orderId: uuid('order_id').notNull(),
    slot: varchar('slot', { length: 6 }).notNull(),
    body: varchar('body', { length: 500 }).notNull(),
  },
  (table) => [
    unique('service_order_notes_id_tenant_id_unique').on(table.id, table.tenantId),
    unique('service_order_notes_order_slot_unique').on(
      table.tenantId,
      table.orderId,
      table.slot,
    ),
    foreignKey({
      name: 'service_order_notes_order_tenant_fk',
      columns: [table.orderId, table.tenantId],
      foreignColumns: [serviceOrders.id, serviceOrders.tenantId],
    }).onDelete('cascade'),
    check('service_order_notes_slot_check', sql`${table.slot} ~ '^line0[1-5]$'`),
  ],
);

/** Item de produto ou de serviço. O código copiado não se edita. */
export const serviceOrderLines = pgTable(
  'service_order_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...tenantColumns,
    orderId: uuid('order_id').notNull(),
    lineNumber: integer('line_number').notNull(),
    kind: serviceOrderLineKindEnum('kind').notNull(),
    itemId: uuid('item_id').notNull(),
    code: varchar('code', { length: 6 }).notNull(),
    description: varchar('description', { length: 120 }).notNull(),
    quantity: numeric('quantity', { precision: 15, scale: 4 }).notNull(),
    unitPrice: numeric('unit_price', { precision: 15, scale: 4 }).notNull(),
    lineAmount: integer('line_amount').notNull(),
    technicianPersonId: uuid('technician_person_id'),
    technicianName: varchar('technician_name', { length: 120 }),
  },
  (table) => [
    unique('service_order_lines_id_tenant_id_unique').on(table.id, table.tenantId),
    unique('service_order_lines_order_number_unique').on(
      table.tenantId,
      table.orderId,
      table.lineNumber,
    ),
    foreignKey({
      name: 'service_order_lines_order_tenant_fk',
      columns: [table.orderId, table.tenantId],
      foreignColumns: [serviceOrders.id, serviceOrders.tenantId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'service_order_lines_item_tenant_fk',
      columns: [table.itemId, table.tenantId],
      foreignColumns: [catalogItems.id, catalogItems.tenantId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'service_order_lines_technician_tenant_fk',
      columns: [table.technicianPersonId, table.tenantId],
      foreignColumns: [persons.id, persons.tenantId],
    }).onDelete('restrict'),
    check('service_order_lines_number_check', sql`${table.lineNumber} >= 1`),
    check('service_order_lines_code_check', sql`${table.code} ~ '^[0-9]{6}$'`),
    check(
      'service_order_lines_description_check',
      sql`length(trim(${table.description})) > 0`,
    ),
    check('service_order_lines_quantity_check', sql`${table.quantity} > 0`),
    check('service_order_lines_unit_price_check', sql`${table.unitPrice} >= 0`),
    check('service_order_lines_amount_check', sql`${table.lineAmount} >= 0`),
    check(
      'service_order_lines_technician_check',
      sql`(
        ${table.kind} = 'service'
        or (${table.technicianPersonId} is null and ${table.technicianName} is null)
      ) and (
        (${table.technicianPersonId} is null) = (${table.technicianName} is null)
      )`,
    ),
  ],
);
