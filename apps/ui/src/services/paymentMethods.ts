import {
  apiErrorMessage,
  type PaymentIntegrationType,
  type PaymentInterestType,
  type PaymentMethod,
  paymentMethodSchema,
  type PaymentReceiptKind,
  titlePageSchema,
} from '@erp-360/shared';

import { apiFetch } from './apiClient';

export type {
  PaymentIntegrationType,
  PaymentInterestType,
  PaymentMethod,
  PaymentReceiptKind,
};

export interface PaymentMethodTermInput {
  installmentCount: number;
  firstDueDays: number;
  intervalDays: number;
  interestType: PaymentInterestType;
  interestRateBps: number;
  administrativeFeeBps: number;
  fixedFeeAmount: number;
}

export interface PaymentMethodInput {
  code: string;
  name: string;
  meansOfPaymentId: string;
  isActive: boolean;
  receiptKind: PaymentReceiptKind;
  settlementDays?: number | null;
  integrationType?: PaymentIntegrationType | null;
  acquirerId?: string | null;
  cardBrandId?: string | null;
  bankAccountId?: string | null;
  useInQuote: boolean;
  useInSale: boolean;
  useInPos: boolean;
  useInServiceOrder: boolean;
  sortOrder: number;
  terms: PaymentMethodTermInput[];
}

export type PaymentMethodSortField = 'sortOrder' | 'code' | 'name';
export type PaymentMethodChannel = 'quote' | 'sale' | 'pos' | 'serviceOrder';

export interface PaymentMethodFilters {
  page: number;
  limit: number;
  sortField: PaymentMethodSortField;
  sortOrder: 'asc' | 'desc';
  search?: string;
  isActive?: boolean;
  channel?: PaymentMethodChannel;
}

export interface PaymentMethodPage {
  data: PaymentMethod[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

const pageSchema = titlePageSchema(paymentMethodSchema);

async function readBody(res: Response): Promise<unknown> {
  return res.json().catch(() => ({}));
}

function parseMethod(body: unknown, fallback: string): PaymentMethod {
  const parsed = paymentMethodSchema.safeParse(body);
  if (!parsed.success) throw new Error(fallback);
  return parsed.data;
}

export const paymentMethodsService = {
  list: async (filters: PaymentMethodFilters): Promise<PaymentMethodPage> => {
    const params = new URLSearchParams({
      page: filters.page.toString(),
      limit: filters.limit.toString(),
      sortField: filters.sortField,
      sortOrder: filters.sortOrder,
    });
    if (filters.search) params.set('busca', filters.search);
    if (filters.isActive != null) params.set('isActive', String(filters.isActive));
    if (filters.channel) params.set('channel', filters.channel);

    const res = await apiFetch(`/payment-methods?${params.toString()}`);
    const body = await readBody(res);
    if (!res.ok) {
      throw new Error(apiErrorMessage(body, 'Falha ao listar formas de pagamento.'));
    }
    const parsed = pageSchema.safeParse(body);
    if (!parsed.success) throw new Error('Resposta de formas de pagamento inválida.');
    return parsed.data;
  },

  get: async (id: string): Promise<PaymentMethod> => {
    const res = await apiFetch(`/payment-methods/${id}`);
    const body = await readBody(res);
    if (!res.ok) {
      throw new Error(apiErrorMessage(body, 'Falha ao carregar a forma de pagamento.'));
    }
    return parseMethod(body, 'Resposta de forma de pagamento inválida.');
  },

  create: async (dados: PaymentMethodInput): Promise<PaymentMethod> => {
    const res = await apiFetch(`/payment-methods`, {
      method: 'POST',
      body: JSON.stringify(dados),
    });
    const body = await readBody(res);
    if (!res.ok) {
      throw new Error(apiErrorMessage(body, 'Falha ao cadastrar a forma de pagamento.'));
    }
    return parseMethod(body, 'Resposta de forma de pagamento inválida.');
  },

  update: async (id: string, dados: PaymentMethodInput): Promise<PaymentMethod> => {
    const res = await apiFetch(`/payment-methods/${id}`, {
      method: 'PUT',
      body: JSON.stringify(dados),
    });
    const body = await readBody(res);
    if (!res.ok) {
      throw new Error(apiErrorMessage(body, 'Falha ao atualizar a forma de pagamento.'));
    }
    return parseMethod(body, 'Resposta de forma de pagamento inválida.');
  },

  setActive: async (id: string, isActive: boolean): Promise<PaymentMethod> => {
    const res = await apiFetch(`/payment-methods/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive }),
    });
    const body = await readBody(res);
    if (!res.ok) {
      throw new Error(
        apiErrorMessage(
          body,
          isActive
            ? 'Falha ao ativar a forma de pagamento.'
            : 'Falha ao desativar a forma de pagamento.',
        ),
      );
    }
    return parseMethod(body, 'Resposta de forma de pagamento inválida.');
  },
};
