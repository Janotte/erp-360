import { API_URL } from '@erp-360/shared';

import { authStorage } from '../utils/auth';
export interface Person {
  id: string;
  name: string;
  document?: string;
  email?: string;
  phone?: string;
  isClient: boolean;
  isSupplier: boolean;
  isEmployee: boolean;
  createdAt?: string;
}

export interface FiltersPersons {
  page: number;
  limit: number;
  sortField: 'name' | 'createdAt';
  sortOrder: 'asc' | 'desc';
  type?: string;
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

const authHeaders = () => ({
  Authorization: `Bearer ${authStorage.getToken()}`,
});

const jsonHeaders = () => ({
  'Content-Type': 'application/json',
  ...authHeaders(),
});

async function parsePersonResponse(res: Response, fallback: string): Promise<Person> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.message || body.error || fallback);
  }
  return body as Person;
}
export const personsService = {
  list: async (filters: FiltersPersons): Promise<PaginationResponse<Person>> => {
    const params = new URLSearchParams({
      page: filters.page.toString(),
      limit: filters.limit.toString(),
      sortField: filters.sortField === 'name' ? 'nome' : filters.sortField,
      sortOrder: filters.sortOrder,
      ...(filters.type && { tipo: filters.type }),
      ...(filters.search && { busca: filters.search }),
    });

    const res = await fetch(`${API_URL}/persons?${params.toString()}`, {
      headers: authHeaders(),
    });
    if (!res.ok) {
      const erro = await res.json().catch(() => ({}));
      throw new Error(erro.message || erro.error || 'Falha ao carregar pessoas.');
    }
    return res.json();
  },
  create: async (dados: Omit<Person, 'id'>): Promise<Person> => {
    const res = await fetch(`${API_URL}/persons`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify(dados),
    });
    return parsePersonResponse(res, 'Falha ao cadastrar.');
  },
  update: async (id: string, dados: Partial<Person>): Promise<Person> => {
    const res = await fetch(`${API_URL}/persons/${id}`, {
      method: 'PUT',
      headers: jsonHeaders(),
      body: JSON.stringify(dados),
    });
    return parsePersonResponse(res, 'Falha ao atualizar.');
  },
  delete: async (id: string): Promise<{ success: boolean; message?: string }> => {
    const res = await fetch(`${API_URL}/persons/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!res.ok) {
      const erro = await res.json();
      throw new Error(erro.message || 'Erro ao excluir.');
    }
    return res.json();
  },
};
