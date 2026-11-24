import { type NfseSettings, nfseSettingsSchema } from '@erp-360/shared';

import { apiFetch } from './apiClient';

async function parseSettings(res: Response, fallback: string): Promise<NfseSettings> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.message || body.error || fallback);
  }
  return nfseSettingsSchema.parse(body);
}

export const nfseSettingsService = {
  get: async (): Promise<NfseSettings> => {
    const res = await apiFetch('/settings/nfse');
    return parseSettings(res, 'Falha ao carregar a NFS-e.');
  },
  save: async (input: NfseSettings): Promise<NfseSettings> => {
    const res = await apiFetch('/settings/nfse', {
      method: 'PUT',
      body: JSON.stringify(input),
    });
    return parseSettings(res, 'Falha ao salvar a NFS-e.');
  },
};
