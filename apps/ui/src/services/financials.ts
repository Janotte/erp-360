import { API_URL } from '@erp-360/shared';

import { authStorage } from '../utils/auth';

export interface FinancialAccount {
  id: string;
  personId: string;
  documentNumber?: string;
  description: string;
  issueOn: string;
  installmentAmount: number;
  dueOn: string;
  settledOn?: string;
  settledAmount?: number;
  status: 'pendente' | 'pago' | 'recebido' | 'cancelado';
  planAccountId?: string;
  invoiceNumber?: string;
  bearerName?: string;
  barcode?: string;
  bankSlipOurNumber?: string;
  financialInstitutionId?: string;
  paymentMethodId?: string;
  cardBrandId?: string;
  transactionAuthorization?: string;
}

type FinancialTipo = 'payable' | 'receivable';

const authHeaders = () => ({
  Authorization: `Bearer ${authStorage.getToken()}`,
});

const jsonHeaders = () => ({
  'Content-Type': 'application/json',
  ...authHeaders(),
});

const collection = (tipo: FinancialTipo) =>
  tipo === 'payable' ? 'payables' : 'receivables';

function optionalString(value: unknown) {
  return value ? String(value) : undefined;
}

function normalizeAccount(
  item: Record<string, unknown>,
  tipo: FinancialTipo,
): FinancialAccount {
  const personId =
    tipo === 'payable'
      ? String(item.creditorId ?? '')
      : String(item.debtorId ?? '');

  return {
    id: String(item.id),
    personId,
    documentNumber: optionalString(item.documentNumber),
    description: String(item.description ?? ''),
    issueOn: String(item.issueOn ?? ''),
    installmentAmount: Number(item.installmentAmount ?? 0),
    dueOn: String(item.dueOn ?? ''),
    settledOn:
      optionalString(item.paidOn) || optionalString(item.receivedOn),
    settledAmount:
      (item.paidAmount as number | undefined) ??
      (item.receivedAmount as number | undefined),
    status: (item.status as FinancialAccount['status']) ?? 'pendente',
    planAccountId: optionalString(item.planAccountId),
    invoiceNumber: optionalString(item.invoiceNumber),
    bearerName: optionalString(item.bearerName),
    barcode: optionalString(item.barcode),
    bankSlipOurNumber: optionalString(item.bankSlipOurNumber),
    financialInstitutionId: optionalString(item.financialInstitutionId),
    paymentMethodId: optionalString(item.paymentMethodId),
    cardBrandId: optionalString(item.cardBrandId),
    transactionAuthorization: optionalString(item.transactionAuthorization),
  };
}

async function parseJson(res: Response) {
  return res.json().catch(() => ({}));
}

function toCreatePayload(
  tipo: FinancialTipo,
  dados: CreatePayableInput | CreateReceivableInput,
) {
  if (tipo === 'payable') {
    return {
      creditorId: dados.personId,
      documentNumber: dados.documentNumber,
      description: dados.description,
      issueOn: dados.issueOn,
      installmentAmount: dados.installmentAmount,
      dueOn: dados.dueOn,
      planAccountId: dados.planAccountId,
    };
  }

  return {
    debtorId: dados.personId,
    documentNumber: dados.documentNumber,
    description: dados.description,
    issueOn: dados.issueOn,
    installmentAmount: dados.installmentAmount,
    dueOn: dados.dueOn,
    planAccountId: dados.planAccountId,
    bearerName: 'bearerName' in dados ? dados.bearerName : undefined,
    barcode: 'barcode' in dados ? dados.barcode : undefined,
    bankSlipOurNumber:
      'bankSlipOurNumber' in dados ? dados.bankSlipOurNumber : undefined,
    invoiceNumber: 'invoiceNumber' in dados ? dados.invoiceNumber : undefined,
    financialInstitutionId:
      'financialInstitutionId' in dados ? dados.financialInstitutionId : undefined,
    paymentMethodId: 'paymentMethodId' in dados ? dados.paymentMethodId : undefined,
    cardBrandId: 'cardBrandId' in dados ? dados.cardBrandId : undefined,
    transactionAuthorization:
      'transactionAuthorization' in dados
        ? dados.transactionAuthorization
        : undefined,
  };
}

export interface CreatePayableInput {
  personId: string;
  documentNumber?: string;
  description: string;
  issueOn?: string;
  installmentAmount: number;
  dueOn: string;
  planAccountId?: string;
}

export interface CreateReceivableInput {
  personId: string;
  documentNumber?: string;
  description: string;
  issueOn?: string;
  installmentAmount: number;
  dueOn: string;
  planAccountId?: string;
  bearerName?: string;
  barcode?: string;
  bankSlipOurNumber?: string;
  invoiceNumber?: string;
  financialInstitutionId?: string;
  paymentMethodId?: string;
  cardBrandId?: string;
  transactionAuthorization?: string;
}

export interface CatalogOption {
  id: string;
  label: string;
}

export type FinancialSortField = 'description' | 'dueOn' | 'installmentAmount';

export interface FinancialListFilters {
  page: number;
  limit: number;
  sortField: FinancialSortField;
  sortOrder: 'asc' | 'desc';
  status?: string;
  search?: string;
  dueFrom?: string;
  dueTo?: string;
}

export interface FinancialPaginationResponse {
  data: FinancialAccount[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export const financialService = {
  listPlanAccounts: async (): Promise<CatalogOption[]> => {
    const res = await fetch(`${API_URL}/financial/plan-accounts`, {
      headers: authHeaders(),
    });
    const body = await parseJson(res);
    if (!res.ok) {
      throw new Error(body.message || body.error || 'Falha ao listar planos de contas.');
    }
    if (!Array.isArray(body)) return [];
    return body.map((item: { id: string; accountCode: string; name: string }) => ({
      id: item.id,
      label: `${item.accountCode} - ${item.name}`,
    }));
  },
  listPaymentMethods: async (): Promise<CatalogOption[]> => {
    const res = await fetch(`${API_URL}/financial/payment-methods`, {
      headers: authHeaders(),
    });
    const body = await parseJson(res);
    if (!res.ok) {
      throw new Error(body.message || body.error || 'Falha ao listar formas de pagamento.');
    }
    if (!Array.isArray(body)) return [];
    return body.map(
      (item: { id: string; paymentTypeCode: string; description: string }) => ({
        id: item.id,
        label: `${item.paymentTypeCode} - ${item.description}`,
      }),
    );
  },
  listCardBrands: async (): Promise<CatalogOption[]> => {
    const res = await fetch(`${API_URL}/financial/card-brands`, {
      headers: authHeaders(),
    });
    const body = await parseJson(res);
    if (!res.ok) {
      throw new Error(body.message || body.error || 'Falha ao listar bandeiras.');
    }
    if (!Array.isArray(body)) return [];
    return body.map((item: { id: string; name: string }) => ({
      id: item.id,
      label: item.name,
    }));
  },
  list: async (
    tipo: FinancialTipo,
    filters: FinancialListFilters,
  ): Promise<FinancialPaginationResponse> => {
    const params = new URLSearchParams({
      page: filters.page.toString(),
      limit: filters.limit.toString(),
      sortField: filters.sortField,
      sortOrder: filters.sortOrder,
      ...(filters.status && { status: filters.status }),
      ...(filters.search && { busca: filters.search }),
      ...(filters.dueFrom && { dueFrom: filters.dueFrom }),
      ...(filters.dueTo && { dueTo: filters.dueTo }),
    });

    const res = await fetch(`${API_URL}/${collection(tipo)}?${params.toString()}`, {
      headers: authHeaders(),
    });
    const body = await parseJson(res);
    if (!res.ok) {
      throw new Error(body.message || body.error || 'Falha ao listar lançamentos.');
    }

    const rows = Array.isArray(body.data) ? body.data : [];
    return {
      data: rows.map((item: Record<string, unknown>) => normalizeAccount(item, tipo)),
      meta: {
        total: Number(body.meta?.total || 0),
        page: Number(body.meta?.page || filters.page),
        limit: Number(body.meta?.limit || filters.limit),
        totalPages: Number(body.meta?.totalPages || 0),
      },
    };
  },
  create: async (
    tipo: FinancialTipo,
    dados: CreatePayableInput | CreateReceivableInput,
  ): Promise<FinancialAccount> => {
    const res = await fetch(`${API_URL}/${collection(tipo)}`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify(toCreatePayload(tipo, dados)),
    });
    const body = await parseJson(res);
    if (!res.ok) {
      throw new Error(body.message || body.error || 'Falha ao lançar conta.');
    }
    return normalizeAccount(body as Record<string, unknown>, tipo);
  },
  update: async (
    tipo: FinancialTipo,
    id: string,
    dados: CreatePayableInput | CreateReceivableInput,
  ): Promise<FinancialAccount> => {
    const res = await fetch(`${API_URL}/${collection(tipo)}/${id}`, {
      method: 'PUT',
      headers: jsonHeaders(),
      body: JSON.stringify(toCreatePayload(tipo, dados)),
    });
    const body = await parseJson(res);
    if (!res.ok) {
      throw new Error(body.message || body.error || 'Falha ao atualizar conta.');
    }
    return normalizeAccount(body as Record<string, unknown>, tipo);
  },
  delete: async (tipo: FinancialTipo, id: string): Promise<void> => {
    const res = await fetch(`${API_URL}/${collection(tipo)}/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    const body = await parseJson(res);
    if (!res.ok) {
      throw new Error(body.message || body.error || 'Falha ao excluir conta.');
    }
  },
  reverse: async (tipo: FinancialTipo, id: string): Promise<FinancialAccount> => {
    const res = await fetch(`${API_URL}/${collection(tipo)}/${id}/reverse`, {
      method: 'POST',
      headers: authHeaders(),
    });
    const body = await parseJson(res);
    if (!res.ok) {
      throw new Error(body.message || body.error || 'Falha ao estornar liquidação.');
    }
    return normalizeAccount(body as Record<string, unknown>, tipo);
  },
  pay: async (
    tipo: FinancialTipo,
    id: string,
    dados: { settledOn: string; settledAmount: number },
  ): Promise<FinancialAccount> => {
    const endpoint = tipo === 'payable' ? 'pay' : 'receive';
    const payload =
      tipo === 'payable'
        ? { paidOn: dados.settledOn, paidAmount: dados.settledAmount }
        : { receivedOn: dados.settledOn, receivedAmount: dados.settledAmount };

    const res = await fetch(`${API_URL}/${collection(tipo)}/${id}/${endpoint}`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify(payload),
    });
    const body = await parseJson(res);
    if (!res.ok) {
      throw new Error(body.message || body.error || 'Falha ao liquidar título.');
    }
    return normalizeAccount(body as Record<string, unknown>, tipo);
  },
};
