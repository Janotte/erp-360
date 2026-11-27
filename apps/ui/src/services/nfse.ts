import { apiFetch } from './apiClient';

export type NfseListStatus = 'pending' | 'authorized' | 'rejected' | 'canceled';

export type NfseListSortField =
  | 'dpsNumber'
  | 'series'
  | 'nfseNumber'
  | 'status'
  | 'createdAt'
  | 'customerName'
  | 'serviceAmount'
  | 'accessKey';

export type NfseListItem = {
  id: string;
  dpsNumber: number | null;
  series: string | null;
  nfseNumber: string | null;
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
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  postalCode: string;
  simplesNacional: string;
  simplesAssessment: string;
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
  exigibility: string;
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
  environmentGenerator: string;
  environmentType: string;
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
    nbsCode: string;
    description: string;
    location: string;
  };
  issqn: DanfseIssqn;
  issqnApplicable: boolean;
  federal: {
    irrf: string;
    cp: string;
    social: string;
    pis: string;
    cofins: string;
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

export type NfseCancelReasonCode = '1' | '2' | '9';

export type NfseEventItem = {
  id: string;
  type: string;
  sequence: number;
  reasonCode: string | null;
  reasonText: string | null;
  registeredAt: string;
  eventXml: string;
};

export const nfseCancelReasonLabel: Record<NfseCancelReasonCode, string> = {
  '1': 'Erro na emissão',
  '2': 'Serviço não prestado',
  '9': 'Outros',
};

export const nfseService = {
  list: async (filter: NfseListFilter = {}): Promise<NfseListPage> => {
    const res = await apiFetch(`/nfse${buildQuery(filter)}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body.message || body.error || 'Falha ao carregar a NFS-e.');
    }
    return body as NfseListPage;
  },
  danfse: async (requestId: string): Promise<DanfseView> => {
    const res = await apiFetch(`/nfse/${requestId}/danfse`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body.message || body.error || 'Falha ao carregar a DANFSe.');
    }
    return body as DanfseView;
  },
  events: async (requestId: string): Promise<NfseEventItem[]> => {
    const res = await apiFetch(`/nfse/${requestId}/events`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body.message || body.error || 'Falha ao carregar os eventos da NFS-e.');
    }
    return (body as { data: NfseEventItem[] }).data;
  },
  cancel: async (
    requestId: string,
    input: { reasonCode: NfseCancelReasonCode; reasonText: string },
  ): Promise<{ message: string }> => {
    const res = await apiFetch(`/nfse/${requestId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body.message || body.error || 'Falha ao cancelar a NFS-e.');
    }
    return body as { message: string };
  },
};
