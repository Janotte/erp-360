import {
  apiErrorMessage,
  cardBrandCatalogListSchema,
  type PayableTitle,
  payableTitleSchema,
  paymentMethodCatalogListSchema,
  planAccountCatalogListSchema,
  type ReceivableTitle,
  receivableTitleSchema,
  type SettlementPreview,
  settlementPreviewSchema,
  titlePageSchema,
} from '@erp-360/shared';

import { apiFetch } from './apiClient';

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
  personName?: string;
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

const collection = (tipo: FinancialTipo) =>
  tipo === 'payable' ? 'payables' : 'receivables';

function definedText(value: string | null | undefined) {
  return value ?? undefined;
}

function definedAmount(value: number | null | undefined) {
  return value ?? undefined;
}

function fromPayable(row: PayableTitle): FinancialAccount {
  return {
    id: row.id,
    personId: row.creditorId,
    documentNumber: definedText(row.documentNumber),
    description: row.description,
    issueOn: row.issueOn,
    installmentAmount: row.installmentAmount,
    dueOn: row.dueOn,
    settledOn: definedText(row.paidOn),
    settledAmount: definedAmount(row.paidAmount),
    status: row.status,
    personName: definedText(row.personName),
    planAccountId: definedText(row.planAccountId),
  };
}

function fromReceivable(row: ReceivableTitle): FinancialAccount {
  return {
    id: row.id,
    personId: row.debtorId,
    documentNumber: definedText(row.documentNumber),
    description: row.description,
    issueOn: row.issueOn,
    installmentAmount: row.installmentAmount,
    dueOn: row.dueOn,
    settledOn: definedText(row.receivedOn),
    settledAmount: definedAmount(row.receivedAmount),
    status: row.status,
    personName: definedText(row.personName),
    planAccountId: definedText(row.planAccountId),
    invoiceNumber: definedText(row.invoiceNumber),
    bearerName: definedText(row.bearerName),
    barcode: definedText(row.barcode),
    bankSlipOurNumber: definedText(row.bankSlipOurNumber),
    financialInstitutionId: definedText(row.financialInstitutionId),
    paymentMethodId: definedText(row.paymentMethodId),
    cardBrandId: definedText(row.cardBrandId),
    transactionAuthorization: definedText(row.transactionAuthorization),
  };
}

function parseTitle(tipo: FinancialTipo, body: unknown): FinancialAccount {
  if (tipo === 'payable') {
    const parsed = payableTitleSchema.safeParse(body);
    if (!parsed.success) throw new Error('Resposta de título inválida.');
    return fromPayable(parsed.data);
  }

  const parsed = receivableTitleSchema.safeParse(body);
  if (!parsed.success) throw new Error('Resposta de título inválida.');
  return fromReceivable(parsed.data);
}

async function readBody(res: Response): Promise<unknown> {
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
    bankSlipOurNumber: 'bankSlipOurNumber' in dados ? dados.bankSlipOurNumber : undefined,
    invoiceNumber: 'invoiceNumber' in dados ? dados.invoiceNumber : undefined,
    financialInstitutionId:
      'financialInstitutionId' in dados ? dados.financialInstitutionId : undefined,
    paymentMethodId: 'paymentMethodId' in dados ? dados.paymentMethodId : undefined,
    cardBrandId: 'cardBrandId' in dados ? dados.cardBrandId : undefined,
    transactionAuthorization:
      'transactionAuthorization' in dados ? dados.transactionAuthorization : undefined,
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

export type TitleSortField =
  | 'documentNumber'
  | 'personName'
  | 'description'
  | 'issueOn'
  | 'dueOn'
  | 'installmentAmount';

export interface FinancialListFilters {
  page: number;
  limit: number;
  sortField: TitleSortField;
  sortOrder: 'asc' | 'desc';
  status?: string;
  search?: string;
  dueFrom?: string;
  dueTo?: string;
  issueFrom?: string;
  issueTo?: string;
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
  listPlanAccounts: async (filters?: {
    nature?: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
    acceptsEntries?: boolean;
    isTreasury?: boolean;
  }): Promise<CatalogOption[]> => {
    const params = new URLSearchParams();
    if (filters?.nature) params.set('nature', filters.nature);
    if (filters?.acceptsEntries != null) {
      params.set('acceptsEntries', String(filters.acceptsEntries));
    }
    if (filters?.isTreasury != null) params.set('isTreasury', String(filters.isTreasury));
    const query = params.toString();
    const res = await apiFetch(`/financial/plan-accounts${query ? `?${query}` : ''}`);
    const body = await readBody(res);
    if (!res.ok) {
      throw new Error(apiErrorMessage(body, 'Falha ao listar planos de contas.'));
    }
    const parsed = planAccountCatalogListSchema.safeParse(body);
    if (!parsed.success) throw new Error('Resposta de planos de contas inválida.');
    return parsed.data.map((item) => ({
      id: item.id,
      label: `${item.accountCode} - ${item.name}`,
    }));
  },
  listPaymentMethods: async (): Promise<CatalogOption[]> => {
    const res = await apiFetch(`/financial/payment-methods`);
    const body = await readBody(res);
    if (!res.ok) {
      throw new Error(apiErrorMessage(body, 'Falha ao listar formas de pagamento.'));
    }
    const parsed = paymentMethodCatalogListSchema.safeParse(body);
    if (!parsed.success) throw new Error('Resposta de formas de pagamento inválida.');
    return parsed.data.map((item) => ({
      id: item.id,
      label: `${item.paymentTypeCode} - ${item.description}`,
    }));
  },
  listCardBrands: async (): Promise<CatalogOption[]> => {
    const res = await apiFetch(`/financial/card-brands`);
    const body = await readBody(res);
    if (!res.ok) {
      throw new Error(apiErrorMessage(body, 'Falha ao listar bandeiras.'));
    }
    const parsed = cardBrandCatalogListSchema.safeParse(body);
    if (!parsed.success) throw new Error('Resposta de bandeiras inválida.');
    return parsed.data.map((item) => ({
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
      ...(filters.issueFrom && { issueFrom: filters.issueFrom }),
      ...(filters.issueTo && { issueTo: filters.issueTo }),
    });

    const res = await apiFetch(`/${collection(tipo)}?${params.toString()}`);
    const body = await readBody(res);
    if (!res.ok) {
      throw new Error(apiErrorMessage(body, 'Falha ao listar lançamentos.'));
    }

    if (tipo === 'payable') {
      const parsed = titlePageSchema(payableTitleSchema).safeParse(body);
      if (!parsed.success) throw new Error('Resposta de listagem inválida.');
      return {
        data: parsed.data.data.map(fromPayable),
        meta: parsed.data.meta,
      };
    }

    const parsed = titlePageSchema(receivableTitleSchema).safeParse(body);
    if (!parsed.success) throw new Error('Resposta de listagem inválida.');
    return {
      data: parsed.data.data.map(fromReceivable),
      meta: parsed.data.meta,
    };
  },
  create: async (
    tipo: FinancialTipo,
    dados: CreatePayableInput | CreateReceivableInput,
  ): Promise<FinancialAccount> => {
    const res = await apiFetch(`/${collection(tipo)}`, {
      method: 'POST',
      body: JSON.stringify(toCreatePayload(tipo, dados)),
    });
    const body = await readBody(res);
    if (!res.ok) {
      throw new Error(apiErrorMessage(body, 'Falha ao lançar conta.'));
    }
    return parseTitle(tipo, body);
  },
  update: async (
    tipo: FinancialTipo,
    id: string,
    dados: CreatePayableInput | CreateReceivableInput,
  ): Promise<FinancialAccount> => {
    const res = await apiFetch(`/${collection(tipo)}/${id}`, {
      method: 'PUT',
      body: JSON.stringify(toCreatePayload(tipo, dados)),
    });
    const body = await readBody(res);
    if (!res.ok) {
      throw new Error(apiErrorMessage(body, 'Falha ao atualizar conta.'));
    }
    return parseTitle(tipo, body);
  },
  delete: async (tipo: FinancialTipo, id: string): Promise<void> => {
    const res = await apiFetch(`/${collection(tipo)}/${id}`, {
      method: 'DELETE',
    });
    const body = await readBody(res);
    if (!res.ok) {
      throw new Error(apiErrorMessage(body, 'Falha ao excluir conta.'));
    }
  },
  reverse: async (tipo: FinancialTipo, id: string): Promise<FinancialAccount> => {
    const res = await apiFetch(`/${collection(tipo)}/${id}/reverse`, {
      method: 'POST',
    });
    const body = await readBody(res);
    if (!res.ok) {
      throw new Error(apiErrorMessage(body, 'Falha ao estornar liquidação.'));
    }
    return parseTitle(tipo, body);
  },
  pay: async (
    tipo: FinancialTipo,
    id: string,
    dados: {
      settledOn: string;
      settledAmount: number;
      treasury: 'cash' | 'bank';
      bankAccountId?: string | null;
      waiveCharges?: boolean;
      remainderMode?: 'none' | 'new_title' | 'plan_account';
      differencePlanAccountId?: string | null;
      remainderDueOn?: string | null;
      includeChargesOnNewTitle?: boolean;
    },
  ): Promise<FinancialAccount> => {
    const endpoint = tipo === 'payable' ? 'pay' : 'receive';
    const res = await apiFetch(`/${collection(tipo)}/${id}/${endpoint}`, {
      method: 'POST',
      body: JSON.stringify(dados),
    });
    const body = await readBody(res);
    if (!res.ok) {
      throw new Error(apiErrorMessage(body, 'Falha ao liquidar título.'));
    }
    return parseTitle(tipo, body);
  },
  settlementPreview: async (
    tipo: FinancialTipo,
    id: string,
    settledOn: string,
    waiveCharges = false,
  ): Promise<SettlementPreview> => {
    const params = new URLSearchParams({ settledOn });
    if (tipo === 'receivable' && waiveCharges) params.set('waiveCharges', 'true');
    const res = await apiFetch(
      `/${collection(tipo)}/${id}/settlement-preview?${params.toString()}`,
    );
    const body = await readBody(res);
    if (!res.ok) {
      throw new Error(apiErrorMessage(body, 'Falha ao calcular a baixa.'));
    }
    const parsed = settlementPreviewSchema.safeParse(body);
    if (!parsed.success) throw new Error('Resposta de cálculo inválida.');
    return parsed.data;
  },
};
