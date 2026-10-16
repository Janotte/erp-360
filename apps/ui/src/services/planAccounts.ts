import type { PlanAccountDreLine, PlanAccountNature } from '@erp-360/shared';

import { apiFetch } from './apiClient';

export type { PlanAccountDreLine, PlanAccountNature };

export interface PlanAccount {
  id: string;
  accountCode: string;
  name: string;
  nature: PlanAccountNature;
  dreLine?: PlanAccountDreLine | null;
  acceptsEntries: boolean;
  isTreasury: boolean;
  parentAccountCode?: string | null;
  isActive: boolean;
  dayBalance?: number | null;
  monthBalance?: number | null;
  yearBalance?: number | null;
  balance?: number | null;
  accountingDescription?: string | null;
  accountIdentifier?: string | null;
  accountingAccountCode?: string | null;
}

export interface PlanAccountInput {
  accountCode: string;
  name: string;
  nature: PlanAccountNature;
  dreLine?: PlanAccountDreLine | null;
  acceptsEntries?: boolean;
  isTreasury?: boolean;
  parentAccountCode?: string | null;
  isActive?: boolean;
  accountingDescription?: string | null;
  accountIdentifier?: string | null;
  accountingAccountCode?: string | null;
}

export interface PlanAccountFilters {
  page: number;
  limit: number;
  sortField: 'accountCode' | 'name';
  sortOrder: 'asc' | 'desc';
  search?: string;
}

export interface PaginationResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

async function readBody(res: Response) {
  return res.json().catch(() => ({}));
}

async function parsePlanAccount(res: Response, fallback: string): Promise<PlanAccount> {
  const body = await readBody(res);
  if (!res.ok) {
    throw new Error(body.message || body.error || fallback);
  }
  return body as PlanAccount;
}

export const planAccountsService = {
  list: async (filters: PlanAccountFilters): Promise<PaginationResponse<PlanAccount>> => {
    const params = new URLSearchParams({
      page: filters.page.toString(),
      limit: filters.limit.toString(),
      sortField: filters.sortField,
      sortOrder: filters.sortOrder,
      ...(filters.search && { busca: filters.search }),
    });

    const res = await apiFetch(`/plan-accounts?${params.toString()}`);
    const body = await readBody(res);
    if (!res.ok) {
      throw new Error(
        body.message || body.error || 'Falha ao carregar planos de contas.',
      );
    }
    return {
      data: Array.isArray(body.data) ? body.data : [],
      meta: {
        total: Number(body.meta?.total || 0),
        page: Number(body.meta?.page || filters.page),
        limit: Number(body.meta?.limit || filters.limit),
        totalPages: Number(body.meta?.totalPages || 0),
      },
    };
  },

  get: async (id: string): Promise<PlanAccount> => {
    const res = await apiFetch(`/plan-accounts/${id}`);
    return parsePlanAccount(res, 'Falha ao carregar plano de contas.');
  },

  create: async (dados: PlanAccountInput): Promise<PlanAccount> => {
    const res = await apiFetch(`/plan-accounts`, {
      method: 'POST',
      body: JSON.stringify(dados),
    });
    return parsePlanAccount(res, 'Falha ao cadastrar plano de contas.');
  },

  update: async (id: string, dados: PlanAccountInput): Promise<PlanAccount> => {
    const res = await apiFetch(`/plan-accounts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(dados),
    });
    return parsePlanAccount(res, 'Falha ao atualizar plano de contas.');
  },

  delete: async (id: string): Promise<void> => {
    const res = await apiFetch(`/plan-accounts/${id}`, {
      method: 'DELETE',
    });
    const body = await readBody(res);
    if (!res.ok) {
      throw new Error(body.message || body.error || 'Falha ao excluir plano de contas.');
    }
  },
};
