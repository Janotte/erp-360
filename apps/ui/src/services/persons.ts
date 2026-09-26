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

export type AddressType = 'Principal' | 'Faturamento' | 'Entrega' | 'Outro';

export interface PersonAddress {
  id: string;
  type: AddressType;
  postalCode: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  cityId: string | null;
  cityName: string | null;
  stateId: string | null;
  stateAbbreviation: string | null;
}

export interface PersonAddressInput {
  type: AddressType;
  postalCode?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  cityId?: string | null;
}

export type ContactType = 'Principal' | 'Outro';

export interface PersonContact {
  id: string;
  type: ContactType;
  department: string;
  name: string;
  phone: string | null;
  mobilePhone: string | null;
  email: string | null;
}

export interface PersonContactInput {
  type: ContactType;
  department: string;
  name: string;
  phone?: string;
  mobilePhone?: string;
  email?: string;
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

async function readBody(res: Response) {
  return res.json().catch(() => ({}));
}

async function parsePersonResponse(res: Response, fallback: string): Promise<Person> {
  const body = await readBody(res);
  if (!res.ok) {
    throw new Error(body.message || body.error || fallback);
  }
  return body as Person;
}

async function parseAddressResponse(
  res: Response,
  fallback: string,
): Promise<PersonAddress> {
  const body = await readBody(res);
  if (!res.ok) {
    throw new Error(body.message || body.error || fallback);
  }
  return body as PersonAddress;
}

async function parseContactResponse(
  res: Response,
  fallback: string,
): Promise<PersonContact> {
  const body = await readBody(res);
  if (!res.ok) {
    throw new Error(body.message || body.error || fallback);
  }
  return body as PersonContact;
}
export const personsService = {
  list: async (filters: FiltersPersons): Promise<PaginationResponse<Person>> => {
    const params = new URLSearchParams({
      page: filters.page.toString(),
      limit: filters.limit.toString(),
      sortField: filters.sortField === 'name' ? 'nome' : filters.sortField,
      sortOrder: filters.sortOrder,
      ...(filters.type && { type: filters.type }),
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
  listAddresses: async (personId: string): Promise<PersonAddress[]> => {
    const res = await fetch(`${API_URL}/persons/${personId}/addresses`, {
      headers: authHeaders(),
    });
    if (!res.ok) {
      const erro = await readBody(res);
      throw new Error(erro.message || erro.error || 'Falha ao carregar endereços.');
    }
    return res.json();
  },
  createAddress: async (
    personId: string,
    dados: PersonAddressInput,
  ): Promise<PersonAddress> => {
    const res = await fetch(`${API_URL}/persons/${personId}/addresses`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify(dados),
    });
    return parseAddressResponse(res, 'Falha ao cadastrar endereço.');
  },
  updateAddress: async (
    personId: string,
    addressId: string,
    dados: PersonAddressInput,
  ): Promise<PersonAddress> => {
    const res = await fetch(`${API_URL}/persons/${personId}/addresses/${addressId}`, {
      method: 'PUT',
      headers: jsonHeaders(),
      body: JSON.stringify(dados),
    });
    return parseAddressResponse(res, 'Falha ao atualizar endereço.');
  },
  deleteAddress: async (personId: string, addressId: string): Promise<void> => {
    const res = await fetch(`${API_URL}/persons/${personId}/addresses/${addressId}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!res.ok) {
      const erro = await readBody(res);
      throw new Error(erro.message || 'Erro ao excluir endereço.');
    }
  },
  listContacts: async (personId: string): Promise<PersonContact[]> => {
    const res = await fetch(`${API_URL}/persons/${personId}/contacts`, {
      headers: authHeaders(),
    });
    if (!res.ok) {
      const erro = await readBody(res);
      throw new Error(erro.message || erro.error || 'Falha ao carregar contatos.');
    }
    return res.json();
  },
  createContact: async (
    personId: string,
    dados: PersonContactInput,
  ): Promise<PersonContact> => {
    const res = await fetch(`${API_URL}/persons/${personId}/contacts`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify(dados),
    });
    return parseContactResponse(res, 'Falha ao cadastrar contato.');
  },
  updateContact: async (
    personId: string,
    contactId: string,
    dados: PersonContactInput,
  ): Promise<PersonContact> => {
    const res = await fetch(`${API_URL}/persons/${personId}/contacts/${contactId}`, {
      method: 'PUT',
      headers: jsonHeaders(),
      body: JSON.stringify(dados),
    });
    return parseContactResponse(res, 'Falha ao atualizar contato.');
  },
  deleteContact: async (personId: string, contactId: string): Promise<void> => {
    const res = await fetch(`${API_URL}/persons/${personId}/contacts/${contactId}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!res.ok) {
      const erro = await readBody(res);
      throw new Error(erro.message || 'Erro ao excluir contato.');
    }
  },
};
