import '../../types/fastify.ts';

import { tenants, users } from '@erp-360/mod-core';
import {
  contractBillingCompetences,
  contractBillingKinds,
  contractCounters,
  contractEvents,
  contracts,
  contractStatuses,
} from '@erp-360/mod-contracts';
import { paymentMethods } from '@erp-360/mod-financial';
import { cities, persons } from '@erp-360/mod-persons';
import { serviceOrders } from '@erp-360/mod-service-orders';
import { civilDate, contractBillingSchedule, escapeIlike } from '@erp-360/shared';
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { db } from '../../db/index.ts';
import { formatServiceOrderNumber } from '../service-orders/rules.ts';
import {
  assertBilling,
  assertMutable,
  assertTermKeepsBilledPeriods,
  assertTransition,
  formatContractNumber,
  termExpired,
  type ContractBilling,
  type ContractFields,
  type ContractStatus,
} from './rules.ts';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const contractBody = z.object({
  personId: z.string().uuid(),
  title: z.string().trim().min(1).max(120),
  startedOn: dateSchema,
  endedOn: dateSchema.nullable(),
  billingKind: z.enum(contractBillingKinds),
  billingCompetence: z.enum(contractBillingCompetences).nullable(),
  periodAmount: z.number().int().min(0),
  dueDay: z.number().int().nullable(),
  paymentMethodId: z.string().uuid().nullable(),
  notes: z.string().trim().optional(),
});

const updateBody = contractBody.extend({
  status: z.enum(contractStatuses),
  suspensionReason: z.string().trim().max(200).nullable(),
});

const listQuery = z.object({
  q: z.string().optional(),
  status: z.enum(contractStatuses).optional(),
  personId: z.string().uuid().optional(),
});

type ContractBody = z.infer<typeof contractBody>;
type UpdateBody = z.infer<typeof updateBody>;

function reject(message: string): never {
  const error = new Error(message) as Error & { status: number };
  error.status = 400;
  throw error;
}

function timeZoneOf(value: string | null | undefined) {
  if (!value) return 'America/Sao_Paulo';
  try {
    Intl.DateTimeFormat('pt-BR', { timeZone: value }).format(new Date());
    return value;
  } catch {
    return 'America/Sao_Paulo';
  }
}

function assertCivilDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) reject('Data inválida.');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    reject('Data inválida.');
  }
}

function billingOf(body: ContractBody): ContractBilling {
  return {
    startedOn: body.startedOn,
    endedOn: body.endedOn,
    billingKind: body.billingKind,
    billingCompetence: body.billingCompetence,
    periodAmount: body.periodAmount,
    dueDay: body.dueDay,
  };
}

function fieldsOf(
  body: ContractBody,
  status: ContractStatus,
): ContractFields {
  return {
    ...billingOf(body),
    personId: body.personId,
    title: body.title,
    notes: body.notes?.trim() ?? '',
    paymentMethodId: body.paymentMethodId,
    status,
  };
}

let eventTick = 0;

function nextEventInstant() {
  eventTick = Math.max(Date.now(), eventTick + 1);
  return new Date(eventTick);
}

async function todayForTenant(tenantId: string) {
  const [tenant] = await db
    .select({ cityId: tenants.cityId })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  let timeZone = 'America/Sao_Paulo';
  if (tenant?.cityId) {
    const [city] = await db
      .select({ timezone: cities.timezone })
      .from(cities)
      .where(eq(cities.id, tenant.cityId))
      .limit(1);
    timeZone = timeZoneOf(city?.timezone);
  }
  return civilDate(new Date(), timeZone);
}

async function assertClient(tenantId: string, personId: string) {
  const [person] = await db
    .select({ isActive: persons.isActive, isClient: persons.isClient })
    .from(persons)
    .where(and(eq(persons.id, personId), eq(persons.tenantId, tenantId)))
    .limit(1);
  if (!person?.isActive || !person.isClient) reject('Informe um cliente ativo.');
}

async function assertPaymentMethod(tenantId: string, paymentMethodId: string) {
  const [method] = await db
    .select({
      isActive: paymentMethods.isActive,
      useInServiceOrder: paymentMethods.useInServiceOrder,
      receiptKind: paymentMethods.receiptKind,
    })
    .from(paymentMethods)
    .where(and(eq(paymentMethods.id, paymentMethodId), eq(paymentMethods.tenantId, tenantId)))
    .limit(1);
  if (!method?.isActive || !method.useInServiceOrder) {
    reject('A forma de pagamento não está disponível para o contrato.');
  }
  if (method.receiptKind === 'store_credit') reject('Crédito em loja não entra no contrato.');
}

function scheduleFor(billing: ContractBilling) {
  if (
    billing.billingKind === 'none' ||
    !billing.endedOn ||
    !billing.billingCompetence ||
    billing.dueDay === null
  ) {
    return [];
  }
  return contractBillingSchedule({
    startedOn: billing.startedOn,
    endedOn: billing.endedOn,
    billingKind: billing.billingKind,
    billingCompetence: billing.billingCompetence,
    dueDay: billing.dueDay,
  });
}

async function loadContract(tenantId: string, id: string) {
  const [row] = await db
    .select({
      id: contracts.id,
      number: contracts.number,
      personId: contracts.personId,
      customerName: persons.name,
      title: contracts.title,
      status: contracts.status,
      startedOn: contracts.startedOn,
      endedOn: contracts.endedOn,
      billingKind: contracts.billingKind,
      billingCompetence: contracts.billingCompetence,
      periodAmount: contracts.periodAmount,
      dueDay: contracts.dueDay,
      paymentMethodId: contracts.paymentMethodId,
      notes: contracts.notes,
      suspensionReason: contracts.suspensionReason,
      closedOn: contracts.closedOn,
    })
    .from(contracts)
    .innerJoin(persons, and(eq(persons.id, contracts.personId), eq(persons.tenantId, contracts.tenantId)))
    .where(and(eq(contracts.id, id), eq(contracts.tenantId, tenantId)))
    .limit(1);
  return row ?? null;
}

function storedFields(row: NonNullable<Awaited<ReturnType<typeof loadContract>>>): ContractFields {
  return {
    personId: row.personId,
    title: row.title,
    notes: row.notes,
    startedOn: row.startedOn,
    endedOn: row.endedOn,
    billingKind: row.billingKind,
    billingCompetence: row.billingCompetence,
    periodAmount: row.periodAmount,
    dueDay: row.dueDay,
    paymentMethodId: row.paymentMethodId,
    status: row.status,
  };
}

async function present(tenantId: string, id: string, today: string) {
  const row = await loadContract(tenantId, id);
  if (!row) return null;
  const billing = storedFields(row);
  const events = await db
    .select({
      id: contractEvents.id,
      kind: contractEvents.kind,
      fromStatus: contractEvents.fromStatus,
      toStatus: contractEvents.toStatus,
      billingKind: contractEvents.billingKind,
      billingCompetence: contractEvents.billingCompetence,
      periodAmount: contractEvents.periodAmount,
      dueDay: contractEvents.dueDay,
      reason: contractEvents.reason,
      createdAt: contractEvents.createdAt,
      actorUserId: contractEvents.actorUserId,
      actorName: users.name,
    })
    .from(contractEvents)
    .innerJoin(
      users,
      and(eq(users.id, contractEvents.actorUserId), eq(users.tenantId, contractEvents.tenantId)),
    )
    .where(and(eq(contractEvents.contractId, id), eq(contractEvents.tenantId, tenantId)))
    .orderBy(desc(contractEvents.createdAt), desc(contractEvents.id));
  const orders = await db
    .select({
      id: serviceOrders.id,
      number: serviceOrders.number,
      status: serviceOrders.status,
      totalAmount: serviceOrders.totalAmount,
    })
    .from(serviceOrders)
    .where(and(eq(serviceOrders.contractId, id), eq(serviceOrders.tenantId, tenantId)))
    .orderBy(desc(serviceOrders.number));

  return {
    id: row.id,
    number: row.number,
    numberLabel: formatContractNumber(row.number),
    personId: row.personId,
    customerName: row.customerName,
    title: row.title,
    status: row.status,
    startedOn: row.startedOn,
    endedOn: row.endedOn,
    billingKind: row.billingKind,
    billingCompetence: row.billingCompetence,
    periodAmount: row.periodAmount,
    dueDay: row.dueDay,
    paymentMethodId: row.paymentMethodId,
    notes: row.notes,
    suspensionReason: row.suspensionReason,
    closedOn: row.closedOn,
    termExpired: termExpired(row.status, row.endedOn, today),
    schedule: scheduleFor(billing),
    events,
    orders: orders.map((order) => ({
      ...order,
      numberLabel: formatServiceOrderNumber(order.number),
    })),
  };
}

function eventRow(input: {
  tenantId: string;
  contractId: string;
  kind: 'status' | 'billing';
  fromStatus: ContractStatus | null;
  toStatus: ContractStatus;
  billing: ContractBilling;
  reason: string | null;
  actorUserId: string;
}) {
  return {
    tenantId: input.tenantId,
    contractId: input.contractId,
    kind: input.kind,
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    billingKind: input.billing.billingKind,
    billingCompetence: input.billing.billingCompetence,
    periodAmount: input.billing.periodAmount,
    dueDay: input.billing.dueDay,
    reason: input.reason,
    actorUserId: input.actorUserId,
    createdAt: nextEventInstant(),
  };
}

function billingChanged(stored: ContractFields, next: ContractFields) {
  return (
    stored.billingKind !== next.billingKind ||
    stored.billingCompetence !== next.billingCompetence ||
    stored.periodAmount !== next.periodAmount ||
    stored.dueDay !== next.dueDay
  );
}

async function createContract(tenantId: string, userId: string, body: ContractBody) {
  assertCivilDate(body.startedOn);
  if (body.endedOn) assertCivilDate(body.endedOn);
  const billing = billingOf(body);
  assertBilling(billing);
  await assertClient(tenantId, body.personId);
  if (body.paymentMethodId) await assertPaymentMethod(tenantId, body.paymentMethodId);
  const notes = body.notes?.trim() ?? '';

  const contractId = await db.transaction(async (tx) => {
    await tx.insert(contractCounters).values({ tenantId, lastNumber: 0 }).onConflictDoNothing();
    const [counter] = await tx
      .update(contractCounters)
      .set({ lastNumber: sql`${contractCounters.lastNumber} + 1` })
      .where(eq(contractCounters.tenantId, tenantId))
      .returning({ lastNumber: contractCounters.lastNumber });
    if (!counter) throw new Error('Não foi possível numerar o contrato.');

    const [created] = await tx
      .insert(contracts)
      .values({
        tenantId,
        number: counter.lastNumber,
        personId: body.personId,
        title: body.title,
        status: 'draft',
        startedOn: body.startedOn,
        endedOn: body.endedOn,
        billingKind: body.billingKind,
        billingCompetence: body.billingCompetence,
        periodAmount: body.periodAmount,
        dueDay: body.dueDay,
        paymentMethodId: body.paymentMethodId,
        notes,
      })
      .returning({ id: contracts.id });

    await tx.insert(contractEvents).values(
      eventRow({
        tenantId,
        contractId: created.id,
        kind: 'status',
        fromStatus: null,
        toStatus: 'draft',
        billing,
        reason: null,
        actorUserId: userId,
      }),
    );
    return created.id;
  });

  const today = await todayForTenant(tenantId);
  const detail = await present(tenantId, contractId, today);
  if (!detail) throw new Error('Não foi possível abrir o contrato.');
  return detail;
}

async function updateContract(tenantId: string, userId: string, id: string, body: UpdateBody) {
  const current = await loadContract(tenantId, id);
  if (!current) return null;
  assertCivilDate(body.startedOn);
  if (body.endedOn) assertCivilDate(body.endedOn);

  const today = await todayForTenant(tenantId);
  const stored = storedFields(current);
  const next = fieldsOf(body, body.status);
  if (stored.status === 'closed' || stored.status === 'cancelled') {
    assertMutable(stored, next);
    return present(tenantId, id, today);
  }

  if (stored.status !== next.status) assertTransition(stored.status, next.status);
  const reason = body.suspensionReason?.trim() ?? '';
  if (next.status === 'suspended' && !reason) reject('Informe o motivo da suspensão.');
  if (next.status === 'closed' && !next.endedOn) next.endedOn = today;
  assertMutable(stored, next);
  assertBilling(next);
  assertTermKeepsBilledPeriods(next.endedOn, []);

  if (stored.status === 'draft') {
    await assertClient(tenantId, next.personId);
    if (next.paymentMethodId) await assertPaymentMethod(tenantId, next.paymentMethodId);
  }

  const statusChanged = stored.status !== next.status;
  const chargeChanged = billingChanged(stored, next);
  const closedOn = next.status === 'closed' ? today : null;

  await db.transaction(async (tx) => {
    await tx
      .update(contracts)
      .set({
        personId: next.personId,
        title: next.title,
        status: next.status,
        startedOn: next.startedOn,
        endedOn: next.endedOn,
        billingKind: next.billingKind,
        billingCompetence: next.billingCompetence,
        periodAmount: next.periodAmount,
        dueDay: next.dueDay,
        paymentMethodId: next.paymentMethodId,
        notes: next.notes,
        suspensionReason: next.status === 'suspended' ? reason : null,
        closedOn,
      })
      .where(and(eq(contracts.id, id), eq(contracts.tenantId, tenantId)));

    if (statusChanged) {
      await tx.insert(contractEvents).values(
        eventRow({
          tenantId,
          contractId: id,
          kind: 'status',
          fromStatus: stored.status,
          toStatus: next.status,
          billing: next,
          reason: next.status === 'suspended' ? reason : null,
          actorUserId: userId,
        }),
      );
    }
    if (chargeChanged) {
      await tx.insert(contractEvents).values(
        eventRow({
          tenantId,
          contractId: id,
          kind: 'billing',
          fromStatus: stored.status,
          toStatus: next.status,
          billing: next,
          reason: null,
          actorUserId: userId,
        }),
      );
    }
  });

  return present(tenantId, id, today);
}

async function listContracts(
  tenantId: string,
  query: z.infer<typeof listQuery>,
) {
  const filters = [eq(contracts.tenantId, tenantId)];
  if (query.status) filters.push(eq(contracts.status, query.status));
  if (query.personId) filters.push(eq(contracts.personId, query.personId));

  const term = query.q?.trim() ?? '';
  if (term) {
    const pattern = `%${escapeIlike(term)}%`;
    const compact = term.replace(/[.\s]/g, '');
    const asNumber = /^\d+$/.test(compact) ? Number(compact) : null;
    const textMatch = or(ilike(contracts.title, pattern), ilike(persons.name, pattern));
    if (textMatch && asNumber !== null && Number.isSafeInteger(asNumber) && asNumber > 0) {
      const numbered = or(textMatch, eq(contracts.number, asNumber));
      if (numbered) filters.push(numbered);
    } else if (textMatch) {
      filters.push(textMatch);
    }
  }

  const today = await todayForTenant(tenantId);
  const rows = await db
    .select({
      id: contracts.id,
      number: contracts.number,
      personId: contracts.personId,
      customerName: persons.name,
      title: contracts.title,
      status: contracts.status,
      startedOn: contracts.startedOn,
      endedOn: contracts.endedOn,
      billingKind: contracts.billingKind,
      billingCompetence: contracts.billingCompetence,
      periodAmount: contracts.periodAmount,
    })
    .from(contracts)
    .innerJoin(persons, and(eq(persons.id, contracts.personId), eq(persons.tenantId, contracts.tenantId)))
    .where(and(...filters))
    .orderBy(desc(contracts.number));

  return {
    data: rows.map((row) => ({
      ...row,
      numberLabel: formatContractNumber(row.number),
      termExpired: termExpired(row.status, row.endedOn, today),
    })),
  };
}

export const contractRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('preHandler', fastify.autenticarETenant);

  fastify.get('/', { schema: { querystring: listQuery } }, async (request) => {
    return listContracts(request.user.tenantId, request.query);
  });

  fastify.post('/', { schema: { body: contractBody } }, async (request, reply) => {
    const created = await createContract(
      request.user.tenantId,
      request.user.userId,
      request.body,
    );
    return reply.status(201).send(created);
  });

  fastify.get(
    '/:id',
    { schema: { params: z.object({ id: z.string().uuid() }) } },
    async (request, reply) => {
      const today = await todayForTenant(request.user.tenantId);
      const detail = await present(request.user.tenantId, request.params.id, today);
      if (!detail) return reply.status(404).send({ message: 'Contrato não encontrado.' });
      return detail;
    },
  );

  fastify.put(
    '/:id',
    { schema: { params: z.object({ id: z.string().uuid() }), body: updateBody } },
    async (request, reply) => {
      const saved = await updateContract(
        request.user.tenantId,
        request.user.userId,
        request.params.id,
        request.body,
      );
      if (!saved) return reply.status(404).send({ message: 'Contrato não encontrado.' });
      return saved;
    },
  );
};
