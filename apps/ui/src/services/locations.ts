import { API_URL } from '@erp-360/shared';

import { authStorage } from '../utils/auth';

export interface StateOption {
  id: string;
  name: string;
  abbreviation: string;
}

export interface CityOption {
  id: string;
  name: string;
}

const authHeaders = () => ({
  Authorization: `Bearer ${authStorage.getToken()}`,
});

async function parseList<T>(res: Response, fallback: string): Promise<T[]> {
  if (!res.ok) {
    const erro = await res.json().catch(() => ({}));
    throw new Error(erro.message || erro.error || fallback);
  }
  return res.json();
}

export const locationsService = {
  listStates: async (): Promise<StateOption[]> => {
    const res = await fetch(`${API_URL}/locations/states`, {
      headers: authHeaders(),
    });
    return parseList(res, 'Falha ao carregar estados.');
  },
  listCities: async (stateId: string, search: string): Promise<CityOption[]> => {
    const params = new URLSearchParams({
      stateId,
      limit: '20',
      ...(search && { busca: search }),
    });
    const res = await fetch(`${API_URL}/locations/cities?${params.toString()}`, {
      headers: authHeaders(),
    });
    return parseList(res, 'Falha ao carregar cidades.');
  },
};
