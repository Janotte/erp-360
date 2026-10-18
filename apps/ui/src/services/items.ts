import { type CatalogItemType, type FiscalItemType } from '@erp-360/shared';

import { apiFetch } from './apiClient';

export interface CatalogItem {
  id: string;
  code: string;
  sku: string | null;
  name: string;
  type: CatalogItemType;
  fiscalItemType: FiscalItemType;
  tracksStock: boolean;
  categoryId: string | null;
  categoryName: string | null;
  measureId: string;
  measureAbbreviation: string;
  measureName: string;
  description: string | null;
  barcode: string | null;
  listPrice: string | null;
  ncmCode: string | null;
  ncmDescription: string | null;
  cestCode: string | null;
  netWeightKg: string | null;
  grossWeightKg: string | null;
  lengthCm: string | null;
  widthCm: string | null;
  heightCm: string | null;
  isActive: boolean;
}

export interface CatalogItemInput {
  sku?: string | null;
  name: string;
  type: CatalogItemType;
  fiscalItemType: FiscalItemType;
  tracksStock: boolean;
  categoryId?: string | null;
  measureId: string;
  description?: string | null;
  barcode?: string | null;
  listPrice?: string | null;
  ncmCode?: string | null;
  cestCode?: string | null;
  netWeightKg?: string | null;
  grossWeightKg?: string | null;
  lengthCm?: string | null;
  widthCm?: string | null;
  heightCm?: string | null;
  isActive?: boolean;
}

export interface NcmOption {
  code: string;
  description: string;
}

export interface ItemFilters {
  page: number;
  limit: number;
  sortField: 'code' | 'name';
  sortOrder: 'asc' | 'desc';
  search?: string;
}

export interface ItemListResponse {
  data: CatalogItem[];
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

async function parseItem(res: Response, fallback: string): Promise<CatalogItem> {
  const body = await readBody(res);
  if (!res.ok) throw new Error(body.message || body.error || fallback);
  return body as CatalogItem;
}

export const itemsService = {
  list: async (filters: ItemFilters): Promise<ItemListResponse> => {
    const params = new URLSearchParams({
      page: filters.page.toString(),
      limit: filters.limit.toString(),
      sortField: filters.sortField,
      sortOrder: filters.sortOrder,
      ...(filters.search && { busca: filters.search }),
    });
    const res = await apiFetch(`/catalog/items?${params.toString()}`);
    const body = await readBody(res);
    if (!res.ok)
      throw new Error(body.message || body.error || 'Falha ao carregar itens.');
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

  searchNcms: async (search: string): Promise<NcmOption[]> => {
    const params = new URLSearchParams({ busca: search });
    const res = await apiFetch(`/catalog/ncms?${params.toString()}`);
    const body = await readBody(res);
    if (!res.ok) throw new Error(body.message || body.error || 'Falha ao buscar NCM.');
    return Array.isArray(body) ? body : [];
  },

  get: async (id: string): Promise<CatalogItem> => {
    const res = await apiFetch(`/catalog/items/${id}`);
    return parseItem(res, 'Falha ao carregar item.');
  },

  create: async (dados: CatalogItemInput): Promise<CatalogItem> => {
    const res = await apiFetch('/catalog/items', {
      method: 'POST',
      body: JSON.stringify(dados),
    });
    return parseItem(res, 'Falha ao cadastrar item.');
  },

  update: async (id: string, dados: CatalogItemInput): Promise<CatalogItem> => {
    const res = await apiFetch(`/catalog/items/${id}`, {
      method: 'PUT',
      body: JSON.stringify(dados),
    });
    return parseItem(res, 'Falha ao atualizar item.');
  },

  delete: async (id: string): Promise<void> => {
    const res = await apiFetch(`/catalog/items/${id}`, { method: 'DELETE' });
    const body = await readBody(res);
    if (!res.ok) throw new Error(body.message || body.error || 'Falha ao excluir item.');
  },
};
