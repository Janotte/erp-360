import { type MeasureType, measureTypeLabels, measureTypes } from '@erp-360/shared';

import { apiFetch } from './apiClient';

export type { MeasureType };
export { measureTypeLabels, measureTypes };

export interface Measure {
  id: string;
  name: string;
  abbreviation: string;
  measureType: MeasureType;
  showOnProduct: boolean;
  showOnService: boolean;
  isActive: boolean;
}

export interface MeasureInput {
  name: string;
  abbreviation: string;
  measureType: MeasureType;
  showOnProduct: boolean;
  showOnService: boolean;
  isActive?: boolean;
}

export interface MeasureFilters {
  page: number;
  limit: number;
  sortField: 'abbreviation' | 'name';
  sortOrder: 'asc' | 'desc';
  search?: string;
}

export interface MeasureListResponse {
  data: Measure[];
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

async function parseMeasure(res: Response, fallback: string): Promise<Measure> {
  const body = await readBody(res);
  if (!res.ok) throw new Error(body.message || body.error || fallback);
  return body as Measure;
}

export const measuresService = {
  list: async (filters: MeasureFilters): Promise<MeasureListResponse> => {
    const params = new URLSearchParams({
      page: filters.page.toString(),
      limit: filters.limit.toString(),
      sortField: filters.sortField,
      sortOrder: filters.sortOrder,
      ...(filters.search && { busca: filters.search }),
    });
    const res = await apiFetch(`/catalog/measures?${params.toString()}`);
    const body = await readBody(res);
    if (!res.ok) {
      throw new Error(body.message || body.error || 'Falha ao carregar medidas.');
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

  get: async (id: string): Promise<Measure> => {
    const res = await apiFetch(`/catalog/measures/${id}`);
    return parseMeasure(res, 'Falha ao carregar medida.');
  },

  create: async (dados: MeasureInput): Promise<Measure> => {
    const res = await apiFetch('/catalog/measures', {
      method: 'POST',
      body: JSON.stringify(dados),
    });
    return parseMeasure(res, 'Falha ao cadastrar medida.');
  },

  update: async (id: string, dados: MeasureInput): Promise<Measure> => {
    const res = await apiFetch(`/catalog/measures/${id}`, {
      method: 'PUT',
      body: JSON.stringify(dados),
    });
    return parseMeasure(res, 'Falha ao atualizar medida.');
  },

  delete: async (id: string): Promise<void> => {
    const res = await apiFetch(`/catalog/measures/${id}`, { method: 'DELETE' });
    const body = await readBody(res);
    if (!res.ok)
      throw new Error(body.message || body.error || 'Falha ao excluir medida.');
  },
};
