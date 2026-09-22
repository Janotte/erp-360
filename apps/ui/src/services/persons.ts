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
  list: async (tipo?: string): Promise<Person[]> => {
    const url = tipo ? `${API_URL}/persons?tipo=${tipo}` : `${API_URL}/persons`;
    const res = await fetch(url, { headers: authHeaders() });
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
