import { tenantColumns, tenants, users } from '@erp-360/mod-core';
import { paymentMethods, planAccounts, receivables } from '@erp-360/mod-financial';
import { persons } from '@erp-360/mod-persons';
import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/** Situação do contrato. A empresa não cria situação. */
export const contractStatusEnum = pgEnum('contract_status', [
  'draft',
  'active',
  'suspended',
  'closed',
  'cancelled',
]);

/** Periodicidade da cobrança. `none` é contrato sem cobrança. */
export const contractBillingKindEnum = pgEnum('contract_billing_kind', [
  'none',
  'monthly',
  'quarterly',
  'semiannual',
  'annual',
]);

/** Atual vence no primeiro mês do período. Anterior vence no mês seguinte ao fim. */
export const contractBillingCompetenceEnum = pgEnum('contract_billing_competence', [
  'current',
  'previous',
]);

/** Abertura e transição, ou troca da cobrança. */
export const contractEventKindEnum = pgEnum('contract_event_kind', ['status', 'billing']);

export const contractStatuses = contractStatusEnum.enumValues;
export const contractBillingKinds = contractBillingKindEnum.enumValues;
export const contractBillingCompetences = contractBillingCompetenceEnum.enumValues;
export const contractEventKinds = contractEventKindEnum.enumValues;

/** Próximo número da empresa. A chave é a própria empresa. */
export const contractCounters = pgTable(
  'contract_counters',
  {
    tenantId: uuid('tenant_id')
      .primaryKey()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    lastNumber: integer('last_number').default(0).notNull(),
  },
  (table) => [
    check('contract_counters_last_number_check', sql`${table.lastNumber} >= 0`),
  ],
);

/** Vínculo comercial com vigência, cliente e cobrança do período. */
export const contracts = pgTable(
  'contracts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...tenantColumns,
    number: integer('number').notNull(),
    personId: uuid('person_id').notNull(),
    title: varchar('title', { length: 120 }).notNull(),
    status: contractStatusEnum('status').default('draft').notNull(),
    startedOn: date('started_on').notNull(),
    endedOn: date('ended_on'),
    billingKind: contractBillingKindEnum('billing_kind').default('none').notNull(),
    billingCompetence: contractBillingCompetenceEnum('billing_competence'),
    periodAmount: integer('period_amount').default(0).notNull(),
    dueDay: smallint('due_day'),
    paymentMethodId: uuid('payment_method_id'),
    planAccountId: uuid('plan_account_id'),
    notes: text('notes').default('').notNull(),
    suspensionReason: varchar('suspension_reason', { length: 200 }),
    closedOn: date('closed_on'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    unique('contracts_id_tenant_id_unique').on(table.id, table.tenantId),
    unique('contracts_tenant_number_unique').on(table.tenantId, table.number),
    foreignKey({
      name: 'contracts_person_tenant_fk',
      columns: [table.personId, table.tenantId],
      foreignColumns: [persons.id, persons.tenantId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'contracts_payment_method_tenant_fk',
      columns: [table.paymentMethodId, table.tenantId],
      foreignColumns: [paymentMethods.id, paymentMethods.tenantId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'contracts_plan_account_tenant_fk',
      columns: [table.planAccountId, table.tenantId],
      foreignColumns: [planAccounts.id, planAccounts.tenantId],
    }).onDelete('restrict'),
    check('contracts_number_check', sql`${table.number} > 0`),
    check('contracts_title_check', sql`length(trim(${table.title})) > 0`),
    check(
      'contracts_ended_on_check',
      sql`${table.endedOn} is null or ${table.endedOn} >= ${table.startedOn}`,
    ),
    check(
      'contracts_billing_check',
      sql`(
        ${table.billingKind} = 'none'
        and ${table.periodAmount} = 0
        and ${table.dueDay} is null
        and ${table.billingCompetence} is null
      ) or (
        ${table.billingKind} <> 'none'
        and ${table.periodAmount} > 0
        and ${table.dueDay} between 1 and 28
        and ${table.billingCompetence} is not null
      )`,
    ),
    check(
      'contracts_suspension_reason_check',
      sql`(
        ${table.status} = 'suspended'
        and ${table.suspensionReason} is not null
        and length(trim(${table.suspensionReason})) > 0
      ) or (
        ${table.status} <> 'suspended'
        and ${table.suspensionReason} is null
      )`,
    ),
    check(
      'contracts_closed_on_check',
      sql`(${table.status} = 'closed') = (${table.closedOn} is not null)`,
    ),
  ],
);

/** Transição e troca de cobrança. A linha não se edita e não se apaga pela rota. */
export const contractEvents = pgTable(
  'contract_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...tenantColumns,
    contractId: uuid('contract_id').notNull(),
    kind: contractEventKindEnum('kind').notNull(),
    fromStatus: contractStatusEnum('from_status'),
    toStatus: contractStatusEnum('to_status').notNull(),
    billingKind: contractBillingKindEnum('billing_kind').notNull(),
    billingCompetence: contractBillingCompetenceEnum('billing_competence'),
    periodAmount: integer('period_amount').notNull(),
    dueDay: smallint('due_day'),
    reason: varchar('reason', { length: 200 }),
    actorUserId: uuid('actor_user_id').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    unique('contract_events_id_tenant_id_unique').on(table.id, table.tenantId),
    foreignKey({
      name: 'contract_events_contract_tenant_fk',
      columns: [table.contractId, table.tenantId],
      foreignColumns: [contracts.id, contracts.tenantId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'contract_events_actor_tenant_fk',
      columns: [table.actorUserId, table.tenantId],
      foreignColumns: [users.id, users.tenantId],
    }).onDelete('restrict'),
    check('contract_events_period_amount_check', sql`${table.periodAmount} >= 0`),
    check(
      'contract_events_due_day_check',
      sql`${table.dueDay} is null or ${table.dueDay} between 1 and 28`,
    ),
    check(
      'contract_events_from_status_check',
      sql`(${table.fromStatus} is null) = (${table.kind} = 'status' and ${table.toStatus} = 'draft')`,
    ),
  ],
);

/** Período de contrato que já gerou recebível. Cancelar o título não apaga a linha. */
export const contractBillings = pgTable(
  'contract_billings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...tenantColumns,
    contractId: uuid('contract_id').notNull(),
    competence: date('competence').notNull(),
    dueOn: date('due_on').notNull(),
    amount: integer('amount').notNull(),
    receivableId: uuid('receivable_id').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    unique('contract_billings_id_tenant_id_unique').on(table.id, table.tenantId),
    unique('contract_billings_tenant_contract_competence_unique').on(
      table.tenantId,
      table.contractId,
      table.competence,
    ),
    unique('contract_billings_tenant_receivable_unique').on(
      table.tenantId,
      table.receivableId,
    ),
    foreignKey({
      name: 'contract_billings_contract_tenant_fk',
      columns: [table.contractId, table.tenantId],
      foreignColumns: [contracts.id, contracts.tenantId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'contract_billings_receivable_tenant_fk',
      columns: [table.receivableId, table.tenantId],
      foreignColumns: [receivables.id, receivables.tenantId],
    }).onDelete('restrict'),
    check('contract_billings_amount_check', sql`${table.amount} > 0`),
    check(
      'contract_billings_competence_day_check',
      sql`extract(day from ${table.competence}) = 1`,
    ),
  ],
);
