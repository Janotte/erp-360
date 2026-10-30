import { tenants, users } from '@erp-360/mod-core';
import { meansOfPayment, paymentMethods } from '@erp-360/mod-financial';
import { cities, states } from '@erp-360/mod-persons';
import {
  serviceOrderFieldValues,
  serviceOrderLines,
  serviceOrderNotes,
  serviceOrders,
} from '@erp-360/mod-service-orders';
import {
  formatCnpj,
  formatCpf,
  formatPhone,
  formatPostalCode,
  onlyDigits,
} from '@erp-360/shared';
import { and, asc, eq } from 'drizzle-orm';

import { db } from '../../db/index.ts';
import { formatServiceOrderNumber, installmentsLabel } from './rules.ts';
import { getOrCreateServiceOrderSettings } from './settings.ts';

const attendanceLabels = {
  walk_in: 'Avulso',
  warranty: 'Garantia',
  rework: 'Retrabalho',
  contract: 'Contrato',
} as const;

const statusLabels = {
  open: 'Aberta',
  analyzing: 'Em análise',
  waiting_approval: 'Aguardando aprovação',
  waiting_parts: 'Aguardando peça',
  in_progress: 'Em execução',
  ready: 'Pronta',
  delivered: 'Entregue',
  cancelled: 'Cancelada',
} as const;

function blank(value: string | null | undefined) {
  const trimmed = value?.trim() ?? '';
  return trimmed ? trimmed : null;
}

function printPhone(value: string | null | undefined) {
  const digits = onlyDigits(value ?? '');
  if (!digits) return null;
  if (digits.length === 10 || digits.length === 11) return formatPhone(digits);
  return digits;
}

function printTaxId(value: string | null | undefined) {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return null;
  const digits = onlyDigits(trimmed);
  if (digits.length === 11) return formatCpf(digits);
  if (digits.length === 14) return formatCnpj(digits);
  return trimmed;
}

function priceToCents(value: string) {
  const match = /^(\d+)(?:\.(\d{1,4}))?$/.exec(value);
  if (!match) return 0;
  const fraction = (match[2] ?? '').padEnd(4, '0');
  const scale4 = BigInt(match[1]) * 10_000n + BigInt(fraction);
  return Number((scale4 + 50n) / 100n);
}

function quantityLabel(value: string) {
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  return number.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
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

function formatDateTime(value: Date | null, timeZone: string) {
  if (!value) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${pick('day')}/${pick('month')}/${pick('year')} ${pick('hour')}:${pick('minute')}`;
}

export async function buildServiceOrderPrint(tenantId: string, orderId: string) {
  const [order] = await db
    .select()
    .from(serviceOrders)
    .where(and(eq(serviceOrders.id, orderId), eq(serviceOrders.tenantId, tenantId)))
    .limit(1);
  if (!order) return null;

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  if (!tenant) return null;

  const [user] = await db
    .select({ name: users.name })
    .from(users)
    .where(and(eq(users.id, order.openedByUserId), eq(users.tenantId, tenantId)))
    .limit(1);

  let cityName = '';
  let stateAbbreviation = '';
  let timeZone = 'America/Sao_Paulo';
  if (tenant.cityId) {
    const [city] = await db
      .select({
        name: cities.name,
        timezone: cities.timezone,
        abbreviation: states.abbreviation,
      })
      .from(cities)
      .innerJoin(states, eq(cities.stateId, states.id))
      .where(eq(cities.id, tenant.cityId))
      .limit(1);
    if (city) {
      cityName = city.name;
      stateAbbreviation = city.abbreviation;
      timeZone = timeZoneOf(city.timezone);
    }
  }

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
        eq(serviceOrderFieldValues.orderId, orderId),
      ),
    );
  const storedBySlot = new Map(storedFields.map((field) => [field.slot, field]));
  const frozen = order.labelFrozenAt != null;
  const fields = settings.fields.flatMap((setting) => {
    const stored = storedBySlot.get(setting.slot);
    const active = frozen ? stored?.isActive === true : setting.isActive;
    if (!active) return [];
    return [
      {
        slot: setting.slot,
        label: frozen && stored?.label ? stored.label : setting.label,
        value: stored?.value?.trim() ? stored.value.trim() : '',
        width: frozen && stored?.width != null ? stored.width : setting.width,
      },
    ];
  });

  const storedNotes = await db
    .select({ slot: serviceOrderNotes.slot, body: serviceOrderNotes.body })
    .from(serviceOrderNotes)
    .where(and(eq(serviceOrderNotes.tenantId, tenantId), eq(serviceOrderNotes.orderId, orderId)))
    .orderBy(asc(serviceOrderNotes.slot));
  const notes = storedNotes.flatMap((note) => {
    const body = note.body.trim();
    return body ? [{ slot: note.slot, body }] : [];
  });

  const lines = await db
    .select({
      kind: serviceOrderLines.kind,
      code: serviceOrderLines.code,
      description: serviceOrderLines.description,
      quantity: serviceOrderLines.quantity,
      unitPrice: serviceOrderLines.unitPrice,
      lineAmount: serviceOrderLines.lineAmount,
      technicianName: serviceOrderLines.technicianName,
    })
    .from(serviceOrderLines)
    .where(and(eq(serviceOrderLines.tenantId, tenantId), eq(serviceOrderLines.orderId, orderId)))
    .orderBy(asc(serviceOrderLines.lineNumber));

  let methodDescription: string | null = null;
  let meansDescription: string | null = null;
  let condition: string | null = null;
  if (order.paymentMethodId && order.paymentInstallments) {
    const [method] = await db
      .select({
        name: paymentMethods.name,
        meansOfPaymentId: paymentMethods.meansOfPaymentId,
      })
      .from(paymentMethods)
      .where(
        and(
          eq(paymentMethods.id, order.paymentMethodId),
          eq(paymentMethods.tenantId, tenantId),
        ),
      )
      .limit(1);
    if (method) {
      methodDescription = method.name;
      const [means] = await db
        .select({ description: meansOfPayment.description })
        .from(meansOfPayment)
        .where(eq(meansOfPayment.id, method.meansOfPaymentId))
        .limit(1);
      meansDescription = means?.description ?? null;
      condition = installmentsLabel(order.paymentInstallments, order.firstDueDays ?? 0);
    }
  }

  let originNumber: string | null = null;
  if (order.originOrderId) {
    const [origin] = await db
      .select({ number: serviceOrders.number })
      .from(serviceOrders)
      .where(
        and(eq(serviceOrders.id, order.originOrderId), eq(serviceOrders.tenantId, tenantId)),
      )
      .limit(1);
    if (origin) originNumber = formatServiceOrderNumber(origin.number);
  }

  const postalCode = tenant.postalCode ? formatPostalCode(tenant.postalCode) : '';
  const addressLine = [tenant.street, tenant.number, tenant.complement, tenant.neighborhood, postalCode]
    .map((part) => part?.trim() ?? '')
    .filter(Boolean)
    .join(', ');

  return {
    number: formatServiceOrderNumber(order.number),
    logoUrl: blank(tenant.logo),
    logoText: tenant.tradeName,
    tenant: {
      tradeName: tenant.tradeName,
      name: tenant.name,
      cnpj: formatCnpj(tenant.cnpj),
      stateRegistration: blank(tenant.stateRegistration),
      addressLine,
      cityLine: cityName && stateAbbreviation ? `${cityName} / ${stateAbbreviation}` : '',
      phone: printPhone(tenant.phone),
      mobilePhone: printPhone(tenant.mobilePhone),
      whatsapp: printPhone(tenant.whatsapp),
      email: blank(tenant.email),
    },
    openedByName: user?.name ?? '',
    openedAt: formatDateTime(order.openedAt, timeZone),
    promisedAt: formatDateTime(order.promisedAt, timeZone),
    attendanceLabel: attendanceLabels[order.attendance],
    statusLabel: statusLabels[order.status],
    originNumber,
    customer: {
      taxId: printTaxId(order.customerTaxId),
      name: order.customerName,
      phone: printPhone(order.customerPhone),
      mobilePhone: printPhone(order.customerMobilePhone),
      whatsapp: printPhone(order.customerWhatsapp),
      email: blank(order.customerEmail),
      streetLine: blank(order.customerStreetLine),
      neighborhood: blank(order.customerNeighborhood),
      cityLine: blank(order.customerCityLine),
    },
    sectionTitle: settings.sectionTitle,
    fields,
    productsTitle: settings.productsTitle,
    servicesTitle: settings.servicesTitle,
    products: lines
      .filter((line) => line.kind === 'product')
      .map((line) => ({
        code: line.code,
        description: line.description,
        quantity: quantityLabel(line.quantity),
        unitPrice: priceToCents(line.unitPrice),
        lineAmount: line.lineAmount,
      })),
    services: lines
      .filter((line) => line.kind === 'service')
      .map((line) => ({
        description: line.description,
        technicianName: line.technicianName,
        quantity: quantityLabel(line.quantity),
        unitPrice: priceToCents(line.unitPrice),
        lineAmount: line.lineAmount,
      })),
    totals: {
      productsAmount: order.productsAmount,
      servicesAmount: order.servicesAmount,
      freightAmount: order.freightAmount,
      adjustmentAmount: order.surchargeAmount - order.discountAmount,
      totalAmount: order.totalAmount,
    },
    payment: {
      methodDescription,
      meansDescription,
      installmentsLabel: condition,
    },
    notes,
    technicianSignatureLabel: settings.technicianSignatureLabel,
    customerSignatureLabel: settings.customerSignatureLabel,
  };
}
