import { apiFetch } from './apiClient';

export interface StateOption {
  id: string;
  name: string;
  abbreviation: string;
}

export interface CityOption {
  id: string;
  name: string;
}

async function parseList<T>(res: Response, fallback: string): Promise<T[]> {
  if (!res.ok) {
    const erro = await res.json().catch(() => ({}));
    throw new Error(erro.message || erro.error || fallback);
  }
  return res.json();
}

export const locationsService = {
  listStates: async (): Promise<StateOption[]> => {
    const res = await apiFetch(`/locations/states`);
    return parseList(res, 'Falha ao carregar estados.');
  },
  listCities: async (stateId: string, search: string): Promise<CityOption[]> => {
    const params = new URLSearchParams({
      stateId,
      limit: '20',
      ...(search && { busca: search }),
    });
    const res = await apiFetch(`/locations/cities?${params.toString()}`);
    return parseList(res, 'Falha ao carregar cidades.');
  },
};
