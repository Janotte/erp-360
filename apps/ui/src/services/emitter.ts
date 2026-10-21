import { apiFetch } from './apiClient';

export type TenantCrt = '1' | '2' | '3' | '4';

export interface Emitter {
  name: string;
  tradeName: string;
  cnpj: string;
  stateRegistration: string | null;
  municipalRegistration: string | null;
  cnae: string | null;
  email: string | null;
  phone: string | null;
  crt: TenantCrt;
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

export interface EmitterInput {
  name: string;
  tradeName: string;
  cnpj: string;
  stateRegistration: string | null;
  municipalRegistration: string | null;
  cnae: string | null;
  email: string | null;
  phone: string | null;
  crt: TenantCrt;
  postalCode: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  cityId: string;
}

async function parseEmitter(res: Response, fallback: string): Promise<Emitter> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.message || body.error || fallback);
  }
  return body as Emitter;
}

export const emitterService = {
  get: async (): Promise<Emitter> => {
    const res = await apiFetch('/settings/emitter');
    return parseEmitter(res, 'Falha ao carregar o emitente.');
  },
  save: async (input: EmitterInput): Promise<Emitter> => {
    const res = await apiFetch('/settings/emitter', {
      method: 'PUT',
      body: JSON.stringify(input),
    });
    return parseEmitter(res, 'Falha ao salvar o emitente.');
  },
};
