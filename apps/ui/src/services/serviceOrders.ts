import type { ServiceOrderPrint } from '@/components/ServiceOrders/serviceOrderDocument';

import { apiFetch } from './apiClient';

export type ServiceOrderWidth = 4 | 6 | 12;

export interface ServiceOrderFieldSetting {
  slot: string;
  label: string;
  isActive: boolean;
  isRequired: boolean;
  width: ServiceOrderWidth;
}

export interface ServiceOrderNoteSetting {
  slot: string;
  body: string;
  isActive: boolean;
}

export interface ServiceOrderSettings {
  sectionTitle: string;
  productsTitle: string;
  servicesTitle: string;
  technicianSignatureLabel: string;
  customerSignatureLabel: string;
  summarySlot: string;
  fields: ServiceOrderFieldSetting[];
  noteLines: ServiceOrderNoteSetting[];
}

export interface ServiceOrderSettingsInput extends ServiceOrderSettings {
  confirmLabelChange?: boolean;
}

export interface LabelChange {
  code: 'label_change';
  slots: string[];
}

export type SaveServiceOrderSettingsResult =
  { ok: true; settings: ServiceOrderSettings } | { ok: false; change: LabelChange };

export type ServiceOrderStatus =
  | 'open'
  | 'analyzing'
  | 'waiting_approval'
  | 'waiting_parts'
  | 'in_progress'
  | 'ready'
  | 'delivered'
  | 'cancelled';

export type ServiceOrderAttendance = 'walk_in' | 'warranty' | 'rework' | 'contract';

export type ServiceOrderLocation = 'remote' | 'internal' | 'external';

export interface ServiceOrderListMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ServiceOrderListItem {
  id: string;
  number: number;
  numberLabel: string;
  customerName: string;
  summarySlot: string;
  summaryLabel: string;
  summaryValue: string | null;
  openedAt: string;
  promisedAt: string | null;
  status: ServiceOrderStatus;
}

export interface ServiceOrderFieldValue {
  slot: string;
  value: string | null;
  label: string;
  width: number;
  isActive: boolean;
  isRequired: boolean;
}

export interface ServiceOrderNoteValue {
  slot: string;
  body: string;
}

export interface ServiceOrderLine {
  lineNumber: number;
  kind: 'product' | 'service';
  itemId: string;
  code: string;
  description: string;
  quantity: string;
  unitPrice: string;
  lineAmount: number;
  technicianPersonId: string | null;
  technicianName: string | null;
}

export interface ServiceOrderBillingResult {
  message: string;
  billings: ServiceOrderBilling[];
}

export interface ServiceOrderBilling {
  lineNumber: number;
  dueOn: string;
  amount: number;
  documentNumber: string | null;
  description: string;
  status: 'pendente' | 'recebido' | 'cancelado';
  receivableId: string;
}

export interface ServiceOrderBillingDocument {
  number: number;
  numberLabel: string;
  commercialStatus: 'issued' | 'canceled';
  fiscalStatus: 'not_requested' | 'pending' | 'authorized' | 'rejected' | 'canceled';
  servicesAmount: number;
  totalAmount: number;
}

export interface ServiceOrderNfseLine {
  lineNumber: number;
  description: string;
  nationalServiceCode: string | null;
  municipalServiceCode: string | null;
  issRate: string | null;
  amount: number;
}

export interface ServiceOrderNfseRequest {
  id: string;
  status: 'pending' | 'authorized' | 'rejected' | 'canceled';
  serviceAmount: number;
  lines: ServiceOrderNfseLine[];
}

export interface ServiceOrderPayment {
  paymentMethodId: string;
  methodName: string;
  installmentCount: number;
  dueOn: string;
  amount: number;
}

export interface ServiceOrderPaymentInput {
  paymentMethodId: string;
  installmentCount: number;
  dueOn: string;
  amount: number;
}

export interface ServiceOrderDetail {
  id: string;
  number: number;
  numberLabel: string;
  status: ServiceOrderStatus;
  attendance: ServiceOrderAttendance;
  location: ServiceOrderLocation;
  openedAt: string;
  promisedAt: string | null;
  deliveredAt: string | null;
  labelFrozenAt: string | null;
  openedByUserId: string;
  originOrderId: string | null;
  contractId: string | null;
  contractNumberLabel: string | null;
  personId: string;
  customerName: string;
  customerTaxId: string | null;
  customerPhone: string | null;
  customerMobilePhone: string | null;
  customerWhatsapp: string | null;
  customerEmail: string | null;
  customerStreetLine: string | null;
  customerNeighborhood: string | null;
  customerCityLine: string | null;
  internalNotes: string;
  freightAmount: number;
  discountAmount: number;
  surchargeAmount: number;
  productsAmount: number;
  servicesAmount: number;
  totalAmount: number;
  paymentMethodId: string | null;
  paymentInstallments: number | null;
  payments?: ServiceOrderPayment[];
  today: string;
  billingDocument: ServiceOrderBillingDocument | null;
  nfseRequest: ServiceOrderNfseRequest | null;
  billings: ServiceOrderBilling[];
  fields: ServiceOrderFieldValue[];
  notes: ServiceOrderNoteValue[];
  lines: ServiceOrderLine[];
}

export interface ServiceOrderWrite {
  personId: string;
  attendance: ServiceOrderAttendance;
  location: ServiceOrderLocation;
  originOrderId: string | null;
  contractId: string | null;
  promisedAt: string | null;
  status: ServiceOrderStatus;
  internalNotes: string;
  customerName: string;
  customerTaxId: string | null;
  customerPhone: string | null;
  customerMobilePhone: string | null;
  customerWhatsapp: string | null;
  customerEmail: string | null;
  customerStreetLine: string | null;
  customerNeighborhood: string | null;
  customerCityLine: string | null;
  freightAmount: number;
  discountAmount: number;
  surchargeAmount: number;
  paymentMethodId: string | null;
  paymentInstallments: number | null;
  payments?: ServiceOrderPaymentInput[];
  fields: { slot: string; value: string | null }[];
  notes: { slot: string; body: string }[];
  lines: {
    kind: 'product' | 'service';
    itemId: string;
    description?: string;
    quantity: string;
    unitPrice?: string;
    technicianPersonId?: string | null;
  }[];
}

export interface OpenServiceOrderInput {
  personId: string;
  attendance?: ServiceOrderAttendance;
  location?: ServiceOrderLocation;
  originOrderId?: string | null;
  contractId?: string | null;
  promisedAt?: string | null;
  internalNotes?: string;
}

async function readBody(res: Response): Promise<Record<string, unknown>> {
  return res.json().catch(() => ({}));
}

function messageOf(body: Record<string, unknown>, fallback: string): string {
  return typeof body.message === 'string'
    ? body.message
    : typeof body.error === 'string'
      ? body.error
      : fallback;
}

function isLabelChange(
  body: Record<string, unknown>,
): body is { code: 'label_change'; slots: string[] } {
  return (
    body.code === 'label_change' &&
    Array.isArray(body.slots) &&
    body.slots.every((slot) => typeof slot === 'string')
  );
}

export const serviceOrdersService = {
  getSettings: async (): Promise<ServiceOrderSettings> => {
    const res = await apiFetch('/settings/service-order');
    const body = await readBody(res);
    if (!res.ok) throw new Error(messageOf(body, 'Falha ao carregar a aba da ordem.'));
    return body as unknown as ServiceOrderSettings;
  },

  saveSettings: async (
    input: ServiceOrderSettingsInput,
  ): Promise<SaveServiceOrderSettingsResult> => {
    const res = await apiFetch('/settings/service-order', {
      method: 'PUT',
      body: JSON.stringify(input),
    });
    const body = await readBody(res);
    if (res.status === 409 && isLabelChange(body)) {
      return { ok: false, change: { code: 'label_change', slots: body.slots } };
    }
    if (!res.ok) throw new Error(messageOf(body, 'Falha ao salvar a aba da ordem.'));
    return { ok: true, settings: body as unknown as ServiceOrderSettings };
  },

  list: async (filters?: {
    q?: string;
    status?: ServiceOrderStatus;
    page?: number;
    limit?: number;
  }): Promise<{ data: ServiceOrderListItem[]; meta: ServiceOrderListMeta }> => {
    const params = new URLSearchParams();
    if (filters?.q) params.set('q', filters.q);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.page) params.set('page', String(filters.page));
    if (filters?.limit) params.set('limit', String(filters.limit));
    const query = params.toString();
    const res = await apiFetch(`/service-orders${query ? `?${query}` : ''}`);
    const body = await readBody(res);
    if (!res.ok) throw new Error(messageOf(body, 'Falha ao listar as ordens.'));
    const payload = body as unknown as {
      data: ServiceOrderListItem[];
      meta?: Partial<ServiceOrderListMeta>;
    };
    const total = Number(payload.meta?.total ?? payload.data.length);
    const limit = Number(payload.meta?.limit ?? total);
    return {
      data: payload.data,
      meta: {
        total,
        page: Number(payload.meta?.page ?? 1),
        limit,
        totalPages: Number(payload.meta?.totalPages ?? (limit > 0 ? Math.ceil(total / limit) : 1)),
      },
    };
  },

  get: async (id: string): Promise<ServiceOrderDetail> => {
    const res = await apiFetch(`/service-orders/${id}`);
    const body = await readBody(res);
    if (!res.ok) throw new Error(messageOf(body, 'Falha ao carregar a ordem.'));
    return body as unknown as ServiceOrderDetail;
  },

  create: async (input: OpenServiceOrderInput): Promise<ServiceOrderDetail> => {
    const res = await apiFetch('/service-orders', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    const body = await readBody(res);
    if (!res.ok) throw new Error(messageOf(body, 'Falha ao abrir a ordem.'));
    return body as unknown as ServiceOrderDetail;
  },

  reverse: async (id: string): Promise<ServiceOrderDetail> => {
    const res = await apiFetch(`/service-orders/${id}/reversal`, { method: 'POST' });
    const body = await readBody(res);
    if (!res.ok) throw new Error(messageOf(body, 'Não foi possível estornar a entrega.'));
    return body as unknown as ServiceOrderDetail;
  },

  save: async (id: string, input: ServiceOrderWrite): Promise<ServiceOrderDetail> => {
    const res = await apiFetch(`/service-orders/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
    const body = await readBody(res);
    if (!res.ok) throw new Error(messageOf(body, 'Falha ao salvar a ordem.'));
    return body as unknown as ServiceOrderDetail;
  },

  requestNfse: async (
    id: string,
  ): Promise<{ status: number; body: { message: string; request: ServiceOrderNfseRequest } }> => {
    const res = await apiFetch(`/service-orders/${id}/nfse`, { method: 'POST' });
    const body = await readBody(res);
    if (res.status !== 200 && res.status !== 409) {
      throw new Error(messageOf(body, 'Não foi possível pedir a NFS-e.'));
    }
    return {
      status: res.status,
      body: body as unknown as { message: string; request: ServiceOrderNfseRequest },
    };
  },

  generateBillings: async (
    id: string,
    payments: ServiceOrderPaymentInput[],
  ): Promise<{ status: number; body: ServiceOrderBillingResult }> => {
    const res = await apiFetch(`/service-orders/${id}/billings`, {
      method: 'POST',
      body: JSON.stringify({ payments }),
    });
    const body = await readBody(res);
    if (res.status !== 200 && res.status !== 409) {
      throw new Error(messageOf(body, 'Não foi possível gerar o financeiro.'));
    }
    return { status: res.status, body: body as unknown as ServiceOrderBillingResult };
  },

  print: async (id: string): Promise<ServiceOrderPrint> => {
    const res = await apiFetch(`/service-orders/${id}/print`);
    const body = await readBody(res);
    if (!res.ok) throw new Error(messageOf(body, 'Falha ao montar a folha da ordem.'));
    return body as unknown as ServiceOrderPrint;
  },
};
