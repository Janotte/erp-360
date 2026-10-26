import type { CertificateEnvironment } from '@erp-360/shared';

import { apiFetch } from './apiClient';

export type DfeDocumentKind = 'summary' | 'nfe' | 'event_summary' | 'event' | 'unknown';

export interface DfeSyncResult {
  environment: CertificateEnvironment;
  ultNsu: string;
  maxNsu: string;
  lastStatus: string | null;
  received: number;
  blockedUntil: string | null;
}

export interface DfeList {
  environment: CertificateEnvironment;
  cursor: {
    ultNsu: string;
    maxNsu: string;
    lastStatus: string | null;
    queriedAt: string | null;
  };
  documents: {
    id: string;
    nsu: string;
    kind: DfeDocumentKind;
    accessKey: string | null;
    partyName: string | null;
    amount: number | null;
    eventType: string | null;
    receivedAt: string;
  }[];
}

async function parse<T>(res: Response, fallback: string): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || body.error || fallback);
  return body as T;
}

export const dfeService = {
  list: async (search: string): Promise<DfeList> => {
    const query = search ? `?search=${encodeURIComponent(search)}` : '';
    const res = await apiFetch(`/inbound/dfe${query}`);
    return parse(res, 'Falha ao carregar os documentos de DF-e.');
  },
  sync: async (): Promise<DfeSyncResult> => {
    const res = await apiFetch('/inbound/dfe/sync', { method: 'POST' });
    return parse(res, 'Falha ao buscar o DF-e na SEFAZ.');
  },
  lookup: async (input: { nsu?: string; accessKey?: string }): Promise<DfeSyncResult> => {
    const res = await apiFetch('/inbound/dfe/lookup', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return parse(res, 'Falha ao consultar o documento na SEFAZ.');
  },
};
