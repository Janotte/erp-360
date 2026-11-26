import { apiFetch } from './apiClient';

export type NfseListStatus = 'pending' | 'authorized' | 'rejected' | 'canceled';

export type NfseListSortField =
  | 'dpsNumber'
  | 'series'
  | 'status'
  | 'createdAt'
  | 'customerName'
  | 'serviceAmount'
  | 'accessKey';

export type NfseListItem = {
  id: string;
  dpsNumber: number | null;
  series: string | null;
  status: NfseListStatus;
  createdAt: string;
  customerName: string;
  serviceAmount: number;
  accessKey: string | null;
};

export type NfseListFilter = {
  page?: number;
  limit?: number;
  q?: string;
  status?: NfseListStatus;
  issuedFrom?: string;
  issuedTo?: string;
  sortField?: NfseListSortField;
  sortOrder?: 'asc' | 'desc';
};

export type NfseListPage = {
  data: NfseListItem[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};

export type DanfseParty = {
  name: string;
  taxId: string;
  municipalRegistration: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
};

export type DanfseIssqn = {
  taxation: string;
  rate: string;
  retention: string;
  cityLabel: string;
  immunityType: string;
  suspended: string;
  processNumber: string;
  base: string;
  amount: string;
};

export type DanfseView = {
  accessKey: string;
  nfseNumber: string;
  competence: string;
  nfseIssuedAt: string;
  dpsNumber: string;
  dpsSeries: string;
  dpsIssuedAt: string;
  situation: string;
  purpose: string;
  issuerCityName: string;
  environment: 'homologation' | 'production';
  environmentLabel: string;
  provider: DanfseParty;
  taker: DanfseParty;
  takerPresent: boolean;
  recipientSameAsTaker: boolean;
  intermediaryPresent: boolean;
  intermediary: DanfseParty;
  service: {
    nationalCode: string;
    municipalCode: string;
    description: string;
  };
  issqn: DanfseIssqn;
  issqnApplicable: boolean;
  federal: {
    irrf: string;
    cp: string;
    social: string;
  };
  federalPresent: boolean;
  ibsCbsPresent: boolean;
  ibsCbs: Record<string, string>;
  serviceAmount: string;
  discountAmount: string;
  federalRetentionTotal: string;
  ibsCbsTotal: string;
  netAmount: string;
  complementaryInfo: string;
  qrCodeUrl: string;
};

export const nfseStatusLabel: Record<NfseListStatus, string> = {
  pending: 'Pendente',
  authorized: 'Autorizada',
  rejected: 'Recusada',
  canceled: 'Cancelada',
};

function buildQuery(filter: NfseListFilter) {
  const params = new URLSearchParams();
  if (filter.page && filter.page > 1) params.set('page', String(filter.page));
  if (filter.limit && filter.limit !== 10) params.set('limit', String(filter.limit));
  if (filter.q) params.set('q', filter.q);
  if (filter.status) params.set('status', filter.status);
  if (filter.issuedFrom) params.set('issuedFrom', filter.issuedFrom);
  if (filter.issuedTo) params.set('issuedTo', filter.issuedTo);
  if (filter.sortField && filter.sortField !== 'dpsNumber') {
    params.set('sortField', filter.sortField);
  }
  if (filter.sortOrder && filter.sortOrder !== 'asc') {
    params.set('sortOrder', filter.sortOrder);
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

export const nfseService = {
  list: async (filter: NfseListFilter = {}): Promise<NfseListPage> => {
    const res = await apiFetch(`/nfse${buildQuery(filter)}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body.message || body.error || 'Falha ao carregar a NFS-e.');
    }
    return body as NfseListPage;
  },
};
