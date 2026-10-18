import { apiFetch } from './apiClient';

export interface Category {
  id: string;
  name: string;
  description: string | null;
  parentId: string | null;
  parentName: string | null;
  isActive: boolean;
}

export interface CategoryInput {
  name: string;
  description?: string | null;
  parentId?: string | null;
  isActive?: boolean;
}

export interface CategoryOption {
  id: string;
  name: string;
  parentId: string | null;
  path: string;
}

export interface CategoryFilters {
  page: number;
  limit: number;
  sortField: 'name';
  sortOrder: 'asc' | 'desc';
  search?: string;
}

export interface CategoryListResponse {
  data: Category[];
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

async function parseCategory(res: Response, fallback: string): Promise<Category> {
  const body = await readBody(res);
  if (!res.ok) throw new Error(body.message || body.error || fallback);
  return body as Category;
}

export const categoriesService = {
  list: async (filters: CategoryFilters): Promise<CategoryListResponse> => {
    const params = new URLSearchParams({
      page: filters.page.toString(),
      limit: filters.limit.toString(),
      sortField: filters.sortField,
      sortOrder: filters.sortOrder,
      ...(filters.search && { busca: filters.search }),
    });
    const res = await apiFetch(`/catalog/categories?${params.toString()}`);
    const body = await readBody(res);
    if (!res.ok) {
      throw new Error(body.message || body.error || 'Falha ao carregar categorias.');
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

  options: async (exclude?: string): Promise<CategoryOption[]> => {
    const params = new URLSearchParams();
    if (exclude) params.set('exclude', exclude);
    const query = params.toString();
    const res = await apiFetch(`/catalog/categories/options${query ? `?${query}` : ''}`);
    const body = await readBody(res);
    if (!res.ok) {
      throw new Error(body.message || body.error || 'Falha ao carregar categorias.');
    }
    return Array.isArray(body) ? body : [];
  },

  get: async (id: string): Promise<Category> => {
    const res = await apiFetch(`/catalog/categories/${id}`);
    return parseCategory(res, 'Falha ao carregar categoria.');
  },

  create: async (dados: CategoryInput): Promise<Category> => {
    const res = await apiFetch('/catalog/categories', {
      method: 'POST',
      body: JSON.stringify(dados),
    });
    return parseCategory(res, 'Falha ao cadastrar categoria.');
  },

  update: async (id: string, dados: CategoryInput): Promise<Category> => {
    const res = await apiFetch(`/catalog/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(dados),
    });
    return parseCategory(res, 'Falha ao atualizar categoria.');
  },

  delete: async (id: string): Promise<void> => {
    const res = await apiFetch(`/catalog/categories/${id}`, { method: 'DELETE' });
    const body = await readBody(res);
    if (!res.ok) {
      throw new Error(body.message || body.error || 'Falha ao excluir categoria.');
    }
  },
};
