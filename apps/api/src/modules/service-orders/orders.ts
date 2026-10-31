import '../../types/fastify.ts';

import { catalogItems } from '@erp-360/mod-catalog';
import { paymentMethods, paymentMethodTerms } from '@erp-360/mod-financial';
import { cities, personAddresses, personContacts, persons, states } from '@erp-360/mod-persons';
import {
  serviceOrderAttendances,
  serviceOrderCounters,
  serviceOrderFieldValues,
  serviceOrderLineKinds,
  serviceOrderLines,
  serviceOrderLocations,
  serviceOrderNotes,
  serviceOrders,
  serviceOrderStatuses,
} from '@erp-360/mod-service-orders';
import { escapeIlike, formatPostalCode } from '@erp-360/shared';
import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { db } from '../../db/index.ts';
import { buildServiceOrderPrint } from './print-model.ts';
import {
  assertLine,
  assertOrigin,
  assertRequiredFields,
  assertTotals,
  assertTransition,
  formatServiceOrderNumber,
  lineAmountCents,
  type ServiceOrderAttendance,
  type ServiceOrderLineKind,
  type ServiceOrderLocation,
  type ServiceOrderStatus,
} from './rules.ts';
import { getOrCreateServiceOrderSettings } from './settings.ts';

const fieldSlots = [
  'field01',
  'field02',
  'field03',
  'field04',
  'field05',
  'field06',
  'field07',
  'field08',
  'field09',
  'field10',
  'field11',
] as const;

const lineSlots = ['line01', 'line02', 'line03', 'line04', 'line05'] as const;

const fieldSlotSchema = z.string().regex(/^field(0[1-9]|1[01])$/);
const noteSlotSchema = z.string().regex(/^line0[1-5]$/);
const scaleSchema = z.string().regex(/^\d+(\.\d{1,4})?$/);

const timestampSchema = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Data inválida.');

const createBody = z.object({
  personId: z.string().uuid(),
  attendance: z.enum(serviceOrderAttendances).optional(),
  location: z.enum(serviceOrderLocations).optional(),
  originOrderId: z.string().uuid().nullable().optional(),
  promisedAt: timestampSchema.nullable().optional(),
  internalNotes: z.string().trim().optional(),
});

const orderBody = z
  .object({
    personId: z.string().uuid(),
    attendance: z.enum(serviceOrderAttendances),
    location: z.enum(serviceOrderLocations),
    originOrderId: z.string().uuid().nullable(),
    promisedAt: timestampSchema.nullable(),
    status: z.enum(serviceOrderStatuses),
    internalNotes: z.string().trim(),
    customerName: z.string().trim().min(1).max(120),
    customerTaxId: z.string().trim().max(19).nullable(),
    customerPhone: z.string().trim().max(20).nullable(),
    customerMobilePhone: z.string().trim().max(20).nullable(),
    customerWhatsapp: z.string().trim().max(20).nullable(),
    customerEmail: z.string().trim().max(80).nullable(),
    customerStreetLine: z.string().trim().max(200).nullable(),
    customerNeighborhood: z.string().trim().max(60).nullable(),
    customerCityLine: z.string().trim().max(80).nullable(),
    freightAmount: z.number().int().min(0),
    discountAmount: z.number().int().min(0),
    surchargeAmount: z.number().int().min(0),
    paymentMethodId: z.string().uuid().nullable(),
    paymentInstallments: z.number().int().min(1).max(48).nullable(),
    fields: z
      .array(
        z.object({
          slot: fieldSlotSchema,
          value: z.string().trim().max(2000).nullable(),
        }),
      )
      .length(fieldSlots.length),
    notes: z
      .array(
        z.object({
          slot: noteSlotSchema,
          body: z.string().trim().max(500),
        }),
      )
      .length(lineSlots.length),
    lines: z.array(
      z.object({
        kind: z.enum(serviceOrderLineKinds),
        itemId: z.string().uuid(),
        description: z.string().trim().max(120).optional(),
        quantity: scaleSchema,
        unitPrice: scaleSchema.optional(),
        technicianPersonId: z.string().uuid().nullable().optional(),
      }),
    ),
  })
  .superRefine((data, ctx) => {
    if (new Set(data.fields.map((field) => field.slot)).size !== fieldSlots.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['fields'],
        message: 'Informe os onze campos da ordem.',
      });
    }
    if (new Set(data.notes.map((note) => note.slot)).size !== lineSlots.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['notes'],
        message: 'Informe as cinco linhas de observação.',
      });
    }
  });

const listQuery = z.object({
  q: z.string().optional(),
  status: z.enum(serviceOrderStatuses).optional(),
});

type OrderBody = z.infer<typeof orderBody>;
type OrderLineBody = OrderBody['lines'][number];

type CustomerCopy = {
  customerName: string;
  customerTaxId: string | null;
  customerPhone: string | null;
  customerMobilePhone: string | null;
  customerWhatsapp: string | null;
  customerEmail: string | null;
  customerStreetLine: string | null;
  customerNeighborhood: string | null;
  customerCityLine: string | null;
};

type LoadedField = {
  slot: string;
  value: string | null;
  label: string;
  width: number;
  isActive: boolean;
  isRequired: boolean;
};

type LoadedLine = {
  lineNumber: number;
  kind: ServiceOrderLineKind;
  itemId: string;
  code: string;
  description: string;
  quantity: string;
  unitPrice: string;
  lineAmount: number;
  technicianPersonId: string | null;
  technicianName: string | null;
};

type LoadedOrder = {
  id: string;
  number: number;
  status: ServiceOrderStatus;
  attendance: ServiceOrderAttendance;
  location: ServiceOrderLocation;
  openedAt: Date;
  promisedAt: Date | null;
  deliveredAt: Date | null;
  labelFrozenAt: Date | null;
  openedByUserId: string;
  originOrderId: string | null;
  personId: string;
  internalNotes: string;
  freightAmount: number;
  discountAmount: number;
  surchargeAmount: number;
  productsAmount: number;
  servicesAmount: number;
  totalAmount: number;
  paymentMethodId: string | null;
  paymentInstallments: number | null;
  customer: CustomerCopy;
  fields: LoadedField[];
  notes: { slot: string; body: string }[];
  lines: LoadedLine[];
};

function reject(message: string): never {
  const error = new Error(message) as Error & { status: number };
  error.status = 400;
  throw error;
}

function blankToNull(value: string | null | undefined, max: number) {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function scale4(value: string) {
  const match = /^(\d+)(?:\.(\d{1,4}))?$/.exec(value);
  if (!match) reject('Informe quantidade e preço com até quatro casas.');
  return `${match[1]}.${(match[2] ?? '').padEnd(4, '0')}`;
}

function fieldText(slot: string, value: string | null | undefined) {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return null;
  const max = /^field0[1-7]$/.test(slot) ? 120 : 2000;
  if (trimmed.length > max) reject('O texto do campo passou do limite.');
  return trimmed;
}

function sameInstant(stored: Date | null, incoming: string | null) {
  if (!stored && !incoming) return true;
  if (!stored || !incoming) return false;
  return stored.getTime() === new Date(incoming).getTime();
}

function sameText(stored: string | null, incoming: string | null | undefined) {
  return (stored ?? '') === (incoming?.trim() ?? '');
}

async function customerCopy(tenantId: string, personId: string): Promise<CustomerCopy> {
  const [person] = await db
    .select({
      name: persons.name,
      taxId: persons.taxId,
      isActive: persons.isActive,
      isClient: persons.isClient,
    })
    .from(persons)
    .where(and(eq(persons.id, personId), eq(persons.tenantId, tenantId)))
    .limit(1);
  if (!person?.isActive || !person.isClient) reject('Informe um cliente ativo.');

  const [contact] = await db
    .select({
      phone: personContacts.phone,
      mobilePhone: personContacts.mobilePhone,
      whatsapp: personContacts.whatsapp,
      email: personContacts.email,
    })
    .from(personContacts)
    .where(
      and(
        eq(personContacts.tenantId, tenantId),
        eq(personContacts.personId, personId),
        eq(personContacts.type, 'Principal'),
      ),
    )
    .limit(1);

  const [address] = await db
    .select({
      street: personAddresses.street,
      number: personAddresses.number,
      complement: personAddresses.complement,
      neighborhood: personAddresses.neighborhood,
      postalCode: personAddresses.postalCode,
      cityName: cities.name,
      stateAbbreviation: states.abbreviation,
    })
    .from(personAddresses)
    .innerJoin(cities, eq(personAddresses.cityId, cities.id))
    .innerJoin(states, eq(cities.stateId, states.id))
    .where(
      and(
        eq(personAddresses.tenantId, tenantId),
        eq(personAddresses.personId, personId),
        eq(personAddresses.type, 'Principal'),
      ),
    )
    .limit(1);

  const postalCode = address?.postalCode ? formatPostalCode(address.postalCode) : '';
  const street = address
    ? [address.street, address.number, address.complement, postalCode]
        .map((part) => part?.trim() ?? '')
        .filter(Boolean)
        .join(', ')
    : '';

  return {
    customerName: person.name,
    customerTaxId: blankToNull(person.taxId, 19),
    customerPhone: blankToNull(contact?.phone, 20),
    customerMobilePhone: blankToNull(contact?.mobilePhone, 20),
    customerWhatsapp: blankToNull(contact?.whatsapp, 20),
    customerEmail: blankToNull(contact?.email, 80),
    customerStreetLine: street ? street.slice(0, 200) : null,
    customerNeighborhood: blankToNull(address?.neighborhood, 60),
    customerCityLine: address
      ? `${address.cityName} / ${address.stateAbbreviation}`.slice(0, 80)
      : null,
  };
}

function copyFromBody(body: OrderBody): CustomerCopy {
  return {
    customerName: body.customerName,
    customerTaxId: blankToNull(body.customerTaxId, 19),
    customerPhone: blankToNull(body.customerPhone, 20),
    customerMobilePhone: blankToNull(body.customerMobilePhone, 20),
    customerWhatsapp: blankToNull(body.customerWhatsapp, 20),
    customerEmail: blankToNull(body.customerEmail, 80),
    customerStreetLine: blankToNull(body.customerStreetLine, 200),
    customerNeighborhood: blankToNull(body.customerNeighborhood, 60),
    customerCityLine: blankToNull(body.customerCityLine, 80),
  };
}

async function assertOriginExists(tenantId: string, originOrderId: string) {
  const [origin] = await db
    .select({ id: serviceOrders.id })
    .from(serviceOrders)
    .where(and(eq(serviceOrders.id, originOrderId), eq(serviceOrders.tenantId, tenantId)))
    .limit(1);
  if (!origin) reject('A ordem de origem não existe.');
}

async function paymentSnapshot(
  tenantId: string,
  methodId: string | null,
  installments: number | null,
) {
  const empty = {
    paymentMethodId: null,
    paymentInstallments: null,
    meansOfPaymentId: null,
    interestType: null,
    interestRateBps: null,
    administrativeFeeBps: null,
    fixedFeeAmount: null,
    firstDueDays: null,
    intervalDays: null,
    receiptKind: null,
    integrationType: null,
    acquirerId: null,
    cardBrandId: null,
  };
  if (!methodId && installments == null) return empty;
  if (!methodId || installments == null) {
    reject('Informe a forma e a quantidade de parcelas.');
  }

  const [method] = await db
    .select()
    .from(paymentMethods)
    .where(and(eq(paymentMethods.id, methodId), eq(paymentMethods.tenantId, tenantId)))
    .limit(1);
  if (!method?.isActive || !method.useInServiceOrder) {
    reject('A forma de pagamento não está disponível para a ordem.');
  }
  if (method.receiptKind === 'store_credit') reject('Crédito em loja não entra na ordem.');

  const [term] = await db
    .select()
    .from(paymentMethodTerms)
    .where(
      and(
        eq(paymentMethodTerms.tenantId, tenantId),
        eq(paymentMethodTerms.paymentMethodId, methodId),
        eq(paymentMethodTerms.installmentCount, installments),
      ),
    )
    .limit(1);
  if (!term) reject('Esta forma não tem a quantidade de parcelas escolhida.');

  return {
    paymentMethodId: method.id,
    paymentInstallments: installments,
    meansOfPaymentId: method.meansOfPaymentId,
    interestType: term.interestType,
    interestRateBps: term.interestRateBps,
    administrativeFeeBps: term.administrativeFeeBps,
    fixedFeeAmount: term.fixedFeeAmount,
    firstDueDays: term.firstDueDays,
    intervalDays: term.intervalDays,
    receiptKind: method.receiptKind,
    integrationType: method.integrationType,
    acquirerId: method.acquirerId,
    cardBrandId: method.cardBrandId,
  };
}

async function prepareLines(tenantId: string, lines: OrderLineBody[]) {
  const prepared: LoadedLine[] = [];
  for (const [index, line] of lines.entries()) {
    const [item] = await db
      .select({
        id: catalogItems.id,
        type: catalogItems.type,
        code: catalogItems.code,
        name: catalogItems.name,
        listPrice: catalogItems.listPrice,
        isActive: catalogItems.isActive,
      })
      .from(catalogItems)
      .where(and(eq(catalogItems.id, line.itemId), eq(catalogItems.tenantId, tenantId)))
      .limit(1);
    if (!item?.isActive) reject('Item inativo ou inexistente.');

    const technicianPersonId = line.technicianPersonId ?? null;
    assertLine({
      kind: line.kind,
      itemKind: item.type,
      technicianPersonId,
    });

    let technicianName: string | null = null;
    if (technicianPersonId) {
      const [technician] = await db
        .select({
          name: persons.name,
          isActive: persons.isActive,
          isEmployee: persons.isEmployee,
        })
        .from(persons)
        .where(and(eq(persons.id, technicianPersonId), eq(persons.tenantId, tenantId)))
        .limit(1);
      if (!technician?.isActive || !technician.isEmployee) {
        reject('O técnico precisa ser um funcionário ativo.');
      }
      technicianName = technician.name;
    }

    const quantity = scale4(line.quantity);
    if (quantity === '0.0000') reject('Informe a quantidade.');
    const unitPrice = scale4(line.unitPrice ?? item.listPrice ?? '0');
    const description = (line.description?.trim() || item.name).trim();
    if (!description) reject('Informe a descrição do item.');

    prepared.push({
      lineNumber: index + 1,
      kind: line.kind,
      itemId: item.id,
      code: item.code,
      description: description.slice(0, 120),
      quantity,
      unitPrice,
      lineAmount: lineAmountCents(quantity, unitPrice),
      technicianPersonId,
      technicianName,
    });
  }
  return prepared;
}

async function loadOrder(tenantId: string, id: string): Promise<LoadedOrder | null> {
  const [order] = await db
    .select()
    .from(serviceOrders)
    .where(and(eq(serviceOrders.id, id), eq(serviceOrders.tenantId, tenantId)))
    .limit(1);
  if (!order) return null;

  const settings = await getOrCreateServiceOrderSettings(tenantId);
  const storedFields = await db
    .select({
      slot: serviceOrderFieldValues.slot,
      value: serviceOrderFieldValues.value,
      label: serviceOrderFieldValues.label,
      width: serviceOrderFieldValues.width,
      isActive: serviceOrderFieldValues.isActive,
    })
    .from(serviceOrderFieldValues)
    .where(
      and(
        eq(serviceOrderFieldValues.tenantId, tenantId),
        eq(serviceOrderFieldValues.orderId, id),
      ),
    );
  const frozen = order.labelFrozenAt != null;
  const storedBySlot = new Map(storedFields.map((field) => [field.slot, field]));
  const fields = settings.fields.map((setting) => {
    const stored = storedBySlot.get(setting.slot);
    return {
      slot: setting.slot,
      value: stored?.value ?? null,
      label: frozen && stored?.label ? stored.label : setting.label,
      width: frozen && stored?.width ? stored.width : setting.width,
      isActive: frozen && stored?.isActive != null ? stored.isActive : setting.isActive,
      isRequired: setting.isRequired,
    };
  });

  const notes = await db
    .select({ slot: serviceOrderNotes.slot, body: serviceOrderNotes.body })
    .from(serviceOrderNotes)
    .where(and(eq(serviceOrderNotes.tenantId, tenantId), eq(serviceOrderNotes.orderId, id)))
    .orderBy(asc(serviceOrderNotes.slot));

  const lines = await db
    .select({
      lineNumber: serviceOrderLines.lineNumber,
      kind: serviceOrderLines.kind,
      itemId: serviceOrderLines.itemId,
      code: serviceOrderLines.code,
      description: serviceOrderLines.description,
      quantity: serviceOrderLines.quantity,
      unitPrice: serviceOrderLines.unitPrice,
      lineAmount: serviceOrderLines.lineAmount,
      technicianPersonId: serviceOrderLines.technicianPersonId,
      technicianName: serviceOrderLines.technicianName,
    })
    .from(serviceOrderLines)
    .where(and(eq(serviceOrderLines.tenantId, tenantId), eq(serviceOrderLines.orderId, id)))
    .orderBy(asc(serviceOrderLines.lineNumber));

  return {
    id: order.id,
    number: order.number,
    status: order.status,
    attendance: order.attendance,
    location: order.location,
    openedAt: order.openedAt,
    promisedAt: order.promisedAt,
    deliveredAt: order.deliveredAt,
    labelFrozenAt: order.labelFrozenAt,
    openedByUserId: order.openedByUserId,
    originOrderId: order.originOrderId,
    personId: order.personId,
    internalNotes: order.internalNotes,
    freightAmount: order.freightAmount,
    discountAmount: order.discountAmount,
    surchargeAmount: order.surchargeAmount,
    productsAmount: order.productsAmount,
    servicesAmount: order.servicesAmount,
    totalAmount: order.totalAmount,
    paymentMethodId: order.paymentMethodId,
    paymentInstallments: order.paymentInstallments,
    customer: {
      customerName: order.customerName,
      customerTaxId: order.customerTaxId,
      customerPhone: order.customerPhone,
      customerMobilePhone: order.customerMobilePhone,
      customerWhatsapp: order.customerWhatsapp,
      customerEmail: order.customerEmail,
      customerStreetLine: order.customerStreetLine,
      customerNeighborhood: order.customerNeighborhood,
      customerCityLine: order.customerCityLine,
    },
    fields,
    notes,
    lines,
  };
}

function present(order: LoadedOrder) {
  return {
    id: order.id,
    number: order.number,
    numberLabel: formatServiceOrderNumber(order.number),
    status: order.status,
    attendance: order.attendance,
    location: order.location,
    openedAt: order.openedAt,
    promisedAt: order.promisedAt,
    deliveredAt: order.deliveredAt,
    labelFrozenAt: order.labelFrozenAt,
    openedByUserId: order.openedByUserId,
    originOrderId: order.originOrderId,
    personId: order.personId,
    ...order.customer,
    internalNotes: order.internalNotes,
    freightAmount: order.freightAmount,
    discountAmount: order.discountAmount,
    surchargeAmount: order.surchargeAmount,
    productsAmount: order.productsAmount,
    servicesAmount: order.servicesAmount,
    totalAmount: order.totalAmount,
    paymentMethodId: order.paymentMethodId,
    paymentInstallments: order.paymentInstallments,
    fields: order.fields,
    notes: order.notes,
    lines: order.lines,
  };
}

function sameExceptInternalNotes(current: LoadedOrder, body: OrderBody) {
  if (current.personId !== body.personId) return false;
  if (current.attendance !== body.attendance) return false;
  if (current.location !== body.location) return false;
  if ((current.originOrderId ?? null) !== (body.originOrderId ?? null)) return false;
  if (!sameInstant(current.promisedAt, body.promisedAt)) return false;
  if (current.status !== body.status) return false;
  if (current.freightAmount !== body.freightAmount) return false;
  if (current.discountAmount !== body.discountAmount) return false;
  if (current.surchargeAmount !== body.surchargeAmount) return false;
  if ((current.paymentMethodId ?? null) !== (body.paymentMethodId ?? null)) return false;
  if ((current.paymentInstallments ?? null) !== (body.paymentInstallments ?? null)) return false;

  const copy = copyFromBody(body);
  const stored = current.customer;
  if (stored.customerName !== copy.customerName) return false;
  if (!sameText(stored.customerTaxId, copy.customerTaxId)) return false;
  if (!sameText(stored.customerPhone, copy.customerPhone)) return false;
  if (!sameText(stored.customerMobilePhone, copy.customerMobilePhone)) return false;
  if (!sameText(stored.customerWhatsapp, copy.customerWhatsapp)) return false;
  if (!sameText(stored.customerEmail, copy.customerEmail)) return false;
  if (!sameText(stored.customerStreetLine, copy.customerStreetLine)) return false;
  if (!sameText(stored.customerNeighborhood, copy.customerNeighborhood)) return false;
  if (!sameText(stored.customerCityLine, copy.customerCityLine)) return false;

  const fields = new Map(body.fields.map((field) => [field.slot, field.value]));
  for (const field of current.fields) {
    if (!sameText(field.value, fields.get(field.slot))) return false;
  }

  const notes = new Map(body.notes.map((note) => [note.slot, note.body]));
  for (const note of current.notes) {
    if ((note.body ?? '') !== (notes.get(note.slot) ?? '')) return false;
  }

  if (current.lines.length !== body.lines.length) return false;
  for (const [index, line] of current.lines.entries()) {
    const incoming = body.lines[index];
    if (!incoming) return false;
    if (line.kind !== incoming.kind || line.itemId !== incoming.itemId) return false;
    const description = (incoming.description ?? line.description).trim();
    if (description !== line.description) return false;
    if (scale4(line.quantity) !== scale4(incoming.quantity)) return false;
    if (scale4(line.unitPrice) !== scale4(incoming.unitPrice ?? line.unitPrice)) return false;
    if ((incoming.technicianPersonId ?? null) !== line.technicianPersonId) return false;
  }
  return true;
}

export async function createServiceOrder(
  tenantId: string,
  userId: string,
  input: z.infer<typeof createBody>,
) {
  const settings = await getOrCreateServiceOrderSettings(tenantId);
  const attendance = input.attendance ?? 'walk_in';
  const location = input.location ?? 'remote';
  const originOrderId = input.originOrderId ?? null;
  assertOrigin({ attendance, originOrderId, orderId: '' });
  if (originOrderId) await assertOriginExists(tenantId, originOrderId);
  const copy = await customerCopy(tenantId, input.personId);

  const orderId = await db.transaction(async (tx) => {
    await tx
      .insert(serviceOrderCounters)
      .values({ tenantId, lastNumber: 0 })
      .onConflictDoNothing();
    const [counter] = await tx
      .update(serviceOrderCounters)
      .set({ lastNumber: sql`${serviceOrderCounters.lastNumber} + 1` })
      .where(eq(serviceOrderCounters.tenantId, tenantId))
      .returning({ lastNumber: serviceOrderCounters.lastNumber });
    if (!counter) throw new Error('Não foi possível numerar a ordem.');

    const [created] = await tx
      .insert(serviceOrders)
      .values({
        tenantId,
        number: counter.lastNumber,
        status: 'open',
        attendance,
        location,
        promisedAt: input.promisedAt ? new Date(input.promisedAt) : null,
        openedByUserId: userId,
        originOrderId,
        personId: input.personId,
        ...copy,
        internalNotes: input.internalNotes?.trim() ?? '',
      })
      .returning({ id: serviceOrders.id });

    await tx.insert(serviceOrderFieldValues).values(
      settings.fields.map((field) => ({
        tenantId,
        orderId: created.id,
        slot: field.slot,
        value: null,
      })),
    );
    await tx.insert(serviceOrderNotes).values(
      settings.noteLines.map((line) => ({
        tenantId,
        orderId: created.id,
        slot: line.slot,
        body: line.isActive ? line.body : '',
      })),
    );
    return created.id;
  });

  const loaded = await loadOrder(tenantId, orderId);
  if (!loaded) throw new Error('Não foi possível abrir a ordem.');
  return present(loaded);
}

async function updateServiceOrder(tenantId: string, id: string, body: OrderBody) {
  const current = await loadOrder(tenantId, id);
  if (!current) return null;

  if (current.status === 'delivered' || current.status === 'cancelled') {
    if (!sameExceptInternalNotes(current, body)) {
      reject('Ordem entregue ou cancelada só aceita a nota interna.');
    }
    await db
      .update(serviceOrders)
      .set({ internalNotes: body.internalNotes })
      .where(and(eq(serviceOrders.id, id), eq(serviceOrders.tenantId, tenantId)));
    return present((await loadOrder(tenantId, id)) ?? current);
  }

  assertTransition(current.status, body.status);
  assertOrigin({
    attendance: body.attendance,
    originOrderId: body.originOrderId,
    orderId: id,
  });
  if (body.originOrderId) await assertOriginExists(tenantId, body.originOrderId);

  const copy =
    body.personId === current.personId
      ? copyFromBody(body)
      : await customerCopy(tenantId, body.personId);
  const settings = await getOrCreateServiceOrderSettings(tenantId);
  const values: Record<string, string | null> = {};
  for (const field of body.fields) values[field.slot] = fieldText(field.slot, field.value);
  if (body.status !== 'cancelled') {
    assertRequiredFields(
      settings.fields,
      Object.fromEntries(Object.entries(values).map(([slot, value]) => [slot, value ?? ''])),
    );
  }

  const lines = await prepareLines(tenantId, body.lines);
  const productsAmount = lines
    .filter((line) => line.kind === 'product')
    .reduce((sum, line) => sum + line.lineAmount, 0);
  const servicesAmount = lines
    .filter((line) => line.kind === 'service')
    .reduce((sum, line) => sum + line.lineAmount, 0);
  assertTotals({
    productsAmount,
    servicesAmount,
    freightAmount: body.freightAmount,
    discountAmount: body.discountAmount,
    surchargeAmount: body.surchargeAmount,
  });
  const totalAmount =
    productsAmount + servicesAmount + body.freightAmount - body.discountAmount + body.surchargeAmount;
  const payment = await paymentSnapshot(tenantId, body.paymentMethodId, body.paymentInstallments);
  if (body.status === 'delivered' && !payment.paymentMethodId) {
    reject('Informe a forma de pagamento para entregar.');
  }

  const freezing = body.status === 'delivered' || body.status === 'cancelled';
  const settingBySlot = new Map(settings.fields.map((field) => [field.slot, field]));

  await db.transaction(async (tx) => {
    await tx
      .update(serviceOrders)
      .set({
        status: body.status,
        attendance: body.attendance,
        location: body.location,
        originOrderId: body.originOrderId,
        promisedAt: body.promisedAt ? new Date(body.promisedAt) : null,
        personId: body.personId,
        ...copy,
        internalNotes: body.internalNotes,
        freightAmount: body.freightAmount,
        discountAmount: body.discountAmount,
        surchargeAmount: body.surchargeAmount,
        productsAmount,
        servicesAmount,
        totalAmount,
        deliveredAt: body.status === 'delivered' ? (current.deliveredAt ?? new Date()) : null,
        labelFrozenAt: freezing ? (current.labelFrozenAt ?? new Date()) : null,
        ...payment,
      })
      .where(and(eq(serviceOrders.id, id), eq(serviceOrders.tenantId, tenantId)));

    for (const note of body.notes) {
      await tx
        .update(serviceOrderNotes)
        .set({ body: note.body })
        .where(
          and(
            eq(serviceOrderNotes.tenantId, tenantId),
            eq(serviceOrderNotes.orderId, id),
            eq(serviceOrderNotes.slot, note.slot),
          ),
        );
    }

    for (const field of body.fields) {
      const setting = settingBySlot.get(field.slot);
      await tx
        .update(serviceOrderFieldValues)
        .set({
          value: values[field.slot] ?? null,
          ...(freezing && setting
            ? { label: setting.label, width: setting.width, isActive: setting.isActive }
            : {}),
        })
        .where(
          and(
            eq(serviceOrderFieldValues.tenantId, tenantId),
            eq(serviceOrderFieldValues.orderId, id),
            eq(serviceOrderFieldValues.slot, field.slot),
          ),
        );
    }

    await tx
      .delete(serviceOrderLines)
      .where(and(eq(serviceOrderLines.tenantId, tenantId), eq(serviceOrderLines.orderId, id)));
    if (lines.length > 0) {
      await tx.insert(serviceOrderLines).values(
        lines.map((line) => ({
          tenantId,
          orderId: id,
          ...line,
        })),
      );
    }
  });

  const loaded = await loadOrder(tenantId, id);
  if (!loaded) throw new Error('Não foi possível gravar a ordem.');
  return present(loaded);
}

async function listServiceOrders(
  tenantId: string,
  query: z.infer<typeof listQuery>,
) {
  const settings = await getOrCreateServiceOrderSettings(tenantId);
  const filters = [eq(serviceOrders.tenantId, tenantId)];
  if (query.status) filters.push(eq(serviceOrders.status, query.status));

  const term = query.q?.trim() ?? '';
  if (term) {
    const pattern = `%${escapeIlike(term)}%`;
    const compact = term.replace(/[.\s]/g, '');
    const asNumber = /^\d+$/.test(compact) ? Number(compact) : null;
    const textMatch = or(
      ilike(serviceOrders.customerName, pattern),
      sql`exists (
        select 1 from ${serviceOrderFieldValues}
        where ${serviceOrderFieldValues.orderId} = ${serviceOrders.id}
          and ${serviceOrderFieldValues.tenantId} = ${serviceOrders.tenantId}
          and ${serviceOrderFieldValues.value} ilike ${pattern}
      )`,
    );
    if (textMatch && asNumber !== null && Number.isSafeInteger(asNumber) && asNumber > 0) {
      const numbered = or(textMatch, eq(serviceOrders.number, asNumber));
      if (numbered) filters.push(numbered);
    } else if (textMatch) {
      filters.push(textMatch);
    }
  }

  const rows = await db
    .select({
      id: serviceOrders.id,
      number: serviceOrders.number,
      customerName: serviceOrders.customerName,
      openedAt: serviceOrders.openedAt,
      promisedAt: serviceOrders.promisedAt,
      status: serviceOrders.status,
    })
    .from(serviceOrders)
    .where(and(...filters))
    .orderBy(desc(serviceOrders.number));

  const ids = rows.map((row) => row.id);
  const summaries =
    ids.length === 0
      ? []
      : await db
          .select({
            orderId: serviceOrderFieldValues.orderId,
            value: serviceOrderFieldValues.value,
          })
          .from(serviceOrderFieldValues)
          .where(
            and(
              eq(serviceOrderFieldValues.tenantId, tenantId),
              eq(serviceOrderFieldValues.slot, settings.summarySlot),
              inArray(serviceOrderFieldValues.orderId, ids),
            ),
          );
  const summaryByOrder = new Map(summaries.map((row) => [row.orderId, row.value]));
  const summaryLabel =
    settings.fields.find((field) => field.slot === settings.summarySlot)?.label ?? '';

  return {
    data: rows.map((row) => ({
      id: row.id,
      number: row.number,
      numberLabel: formatServiceOrderNumber(row.number),
      customerName: row.customerName,
      summarySlot: settings.summarySlot,
      summaryLabel,
      summaryValue: summaryByOrder.get(row.id) ?? null,
      openedAt: row.openedAt,
      promisedAt: row.promisedAt,
      status: row.status,
    })),
  };
}

export const serviceOrderRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('preHandler', fastify.autenticarETenant);

  fastify.get('/', { schema: { querystring: listQuery } }, async (request) => {
    return listServiceOrders(request.user.tenantId, request.query);
  });

  fastify.post('/', { schema: { body: createBody } }, async (request, reply) => {
    const created = await createServiceOrder(
      request.user.tenantId,
      request.user.userId,
      request.body,
    );
    return reply.status(201).send(created);
  });

  fastify.get('/:id', { schema: { params: z.object({ id: z.string().uuid() }) } }, async (request, reply) => {
    const loaded = await loadOrder(request.user.tenantId, request.params.id);
    if (!loaded) return reply.status(404).send({ message: 'Ordem não encontrada.' });
    return present(loaded);
  });

  fastify.get(
    '/:id/print',
    { schema: { params: z.object({ id: z.string().uuid() }) } },
    async (request, reply) => {
      const printed = await buildServiceOrderPrint(request.user.tenantId, request.params.id);
      if (!printed) return reply.status(404).send({ message: 'Ordem não encontrada.' });
      return printed;
    },
  );

  fastify.put(
    '/:id',
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: orderBody,
      },
    },
    async (request, reply) => {
      const saved = await updateServiceOrder(
        request.user.tenantId,
        request.params.id,
        request.body,
      );
      if (!saved) return reply.status(404).send({ message: 'Ordem não encontrada.' });
      return saved;
    },
  );
};
