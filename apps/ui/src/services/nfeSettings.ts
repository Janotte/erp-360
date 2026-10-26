import type { CertificateEnvironment } from '@erp-360/shared';

import { apiFetch } from './apiClient';

export interface NfeSettings {
  environment: CertificateEnvironment;
}

async function parseSettings(res: Response, fallback: string): Promise<NfeSettings> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.message || body.error || fallback);
  }
  return body as NfeSettings;
}

export const nfeSettingsService = {
  get: async (): Promise<NfeSettings> => {
    const res = await apiFetch('/settings/nfe');
    return parseSettings(res, 'Falha ao carregar a NF-e.');
  },
  save: async (input: NfeSettings): Promise<NfeSettings> => {
    const res = await apiFetch('/settings/nfe', {
      method: 'PUT',
      body: JSON.stringify(input),
    });
    return parseSettings(res, 'Falha ao salvar a NF-e.');
  },
};
