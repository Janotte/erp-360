import type { CertificateEnvironment } from '@erp-360/shared';

import { apiFetch } from './apiClient';

export interface DfeSyncResult {
  environment: CertificateEnvironment;
  ultNsu: string;
  maxNsu: string;
  lastStatus: string | null;
  received: number;
  blockedUntil: string | null;
}

async function parse<T>(res: Response, fallback: string): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || body.error || fallback);
  return body as T;
}

export const dfeService = {
  sync: async (): Promise<DfeSyncResult> => {
    const res = await apiFetch('/inbound/dfe/sync', { method: 'POST' });
    return parse(res, 'Falha ao buscar o DF-e na SEFAZ.');
  },
};
