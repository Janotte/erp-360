import { API_URL, onlyDigits, parsePersonKind, parseTaxpayerType } from '@erp-360/shared';

import { authStorage } from '../utils/auth';

export type PersonKind = 'individual' | 'company' | 'foreigner';
export type TaxpayerType = 1 | 2 | 9;

export interface Person {
  id: string;
  type: PersonKind;
  name: string;
  preserveNameCasing?: boolean;
  taxId?: string | null;
  taxpayerType?: TaxpayerType | null;
  stateRegistration?: string | null;
  isRuralProducer: boolean;
  birthDate?: string | null;
  nfeEmail?: string | null;
  documentEmails?: string[] | null;
  notes?: string | null;
  isActive: boolean;
  isVisible: boolean;
  isClient: boolean;
  isSupplier: boolean;
  isEmployee: boolean;
  isFinancialInstitution: boolean;
  createdAt?: string;
}

export type PersonInput = Omit<Person, 'id' | 'createdAt'>;

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
  cityId: string;
}

export interface CnpjLookupAddress {
  postalCode: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  cityId: string | null;
  cityName: string | null;
  stateAbbreviation: string | null;
}

export interface CepLookupResult {
  postalCode: string;
  street: string | null;
  neighborhood: string | null;
  stateId: string | null;
  stateAbbreviation: string | null;
  cityId: string | null;
  cityName: string | null;
}

export interface CnpjLookupResult {
  taxId: string;
  name: string;
  birthDate: string | null;
  nfeEmail: string | null;
  address: CnpjLookupAddress | null;
  existingPersonId: string | null;
}

export type ContactType = 'Principal' | 'Outro';

export interface PersonContact {
  id: string;
  type: ContactType;
  relationship: string | null;
  name: string;
  phone: string | null;
  mobilePhone: string | null;
  whatsapp: string | null;
  email: string | null;
}

export interface PersonContactInput {
  type: ContactType;
  relationship?: string;
  name: string;
  phone?: string;
  mobilePhone?: string;
  whatsapp?: string;
  email?: string;
}

export interface FiltersPersons {
  page: number;
  limit: number;
  sortField: 'name' | 'createdAt';
  sortOrder: 'asc' | 'desc';
  type?: string | string[];
  kind?: 'individual' | 'company' | 'foreigner';
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
  return normalizePerson(body);
}

function normalizePerson(person: Person & { taxpayer_type?: unknown }): Person {
  return {
    ...person,
    type: parsePersonKind(person.type),
    taxpayerType: parseTaxpayerType(person.taxpayerType ?? person.taxpayer_type),
    isFinancialInstitution: Boolean(person.isFinancialInstitution),
  };
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
      ...(filters.type && {
        type: Array.isArray(filters.type) ? filters.type.join(',') : filters.type,
      }),
      ...(filters.kind && { kind: filters.kind }),
      ...(filters.search && { busca: filters.search }),
    });

    const res = await fetch(`${API_URL}/persons?${params.toString()}`, {
      headers: authHeaders(),
    });
    if (!res.ok) {
      const erro = await res.json().catch(() => ({}));
      throw new Error(erro.message || erro.error || 'Falha ao carregar pessoas.');
    }
    const body = await res.json();
    return {
      ...body,
      data: Array.isArray(body.data) ? body.data.map(normalizePerson) : [],
    };
  },
  lookupCnpj: async (cnpj: string): Promise<CnpjLookupResult> => {
    const digits = onlyDigits(cnpj);
    const res = await fetch(`${API_URL}/persons/lookup/cnpj/${digits}`, {
      headers: authHeaders(),
    });
    const body = await readBody(res);
    if (!res.ok) {
      throw new Error(body.message || body.error || 'Falha ao consultar o CNPJ.');
    }
    return body as CnpjLookupResult;
  },
  lookupCep: async (cep: string): Promise<CepLookupResult> => {
    const digits = onlyDigits(cep);
    const res = await fetch(`${API_URL}/persons/lookup/cep/${digits}`, {
      headers: authHeaders(),
    });
    const body = await readBody(res);
    if (!res.ok) {
      throw new Error(body.message || body.error || 'Falha ao consultar o CEP.');
    }
    return body as CepLookupResult;
  },
  get: async (id: string): Promise<Person> => {
    const res = await fetch(`${API_URL}/persons/${id}`, {
      headers: authHeaders(),
    });
    return parsePersonResponse(res, 'Falha ao carregar pessoa.');
  },
  create: async (dados: PersonInput): Promise<Person> => {
    const res = await fetch(`${API_URL}/persons`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify(dados),
    });
    return parsePersonResponse(res, 'Falha ao cadastrar.');
  },
  update: async (id: string, dados: PersonInput): Promise<Person> => {
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
