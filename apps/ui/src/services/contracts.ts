import { formatCurrency } from '@erp-360/shared';

import { apiFetch } from './apiClient';

export type ContractStatus = 'draft' | 'active' | 'suspended' | 'closed' | 'cancelled';

export type ContractBillingKind =
  'none' | 'monthly' | 'quarterly' | 'semiannual' | 'annual';

export type ContractBillingCompetence = 'current' | 'previous';

export interface ContractListItem {
  id: string;
  number: number;
  numberLabel: string;
  personId: string;
  customerName: string;
  title: string;
  status: ContractStatus;
  startedOn: string;
  endedOn: string | null;
  billingKind: ContractBillingKind;
  billingCompetence: ContractBillingCompetence | null;
  periodAmount: number;
  termExpired: boolean;
}

export interface ContractEvent {
  id: string;
  kind: 'status' | 'billing';
  fromStatus: ContractStatus | null;
  toStatus: ContractStatus;
  billingKind: ContractBillingKind;
  billingCompetence: ContractBillingCompetence | null;
  periodAmount: number;
  dueDay: number | null;
  reason: string | null;
  createdAt: string;
  actorName: string;
}

export interface ContractOrder {
  id: string;
  number: number;
  numberLabel: string;
  status: string;
  totalAmount: number;
}

export interface ContractInstallment {
  competence: string;
  dueOn: string;
}

export interface ContractDetail {
  id: string;
  number: number;
  numberLabel: string;
  personId: string;
  customerName: string;
  title: string;
  status: ContractStatus;
  startedOn: string;
  endedOn: string | null;
  billingKind: ContractBillingKind;
  billingCompetence: ContractBillingCompetence | null;
  periodAmount: number;
  dueDay: number | null;
  paymentMethodId: string | null;
  notes: string;
  suspensionReason: string | null;
  closedOn: string | null;
  termExpired: boolean;
  billedCompetences: string[];
  schedule: ContractInstallment[];
  events: ContractEvent[];
  orders: ContractOrder[];
}

export interface ContractBillingResult {
  contracts: number;
  titles: number;
  amount: number;
  failures: { contractId: string; numberLabel: string; message: string }[];
}

export function billingConfirmText(
  result: Pick<ContractBillingResult, 'contracts' | 'titles' | 'amount'>,
) {
  const titles = result.titles === 1 ? '1 título' : `${result.titles} títulos`;
  const contracts =
    result.contracts === 1 ? '1 contrato' : `${result.contracts} contratos`;
  const verb = result.titles === 1 ? 'Será gerado' : 'Serão gerados';
  return `${verb} ${titles} em ${contracts}, no total de ${formatCurrency(result.amount)}.`;
}

export function billingDoneText(result: ContractBillingResult) {
  const done =
    result.titles === 1 ? '1 título gerado.' : `${result.titles} títulos gerados.`;
  if (result.failures.length === 0) return done;
  const failed = result.failures
    .map((row) => `${row.numberLabel}: ${row.message}`)
    .join(' ');
  if (result.titles === 0) return failed;
  return `${done} ${failed}`;
}

export interface ContractInput {
  personId: string;
  title: string;
  startedOn: string;
  endedOn: string | null;
  billingKind: ContractBillingKind;
  billingCompetence: ContractBillingCompetence | null;
  periodAmount: number;
  dueDay: number | null;
  paymentMethodId: string | null;
  notes: string;
}

export interface ContractUpdate extends ContractInput {
  status: ContractStatus;
  suspensionReason: string | null;
}

async function readBody(res: Response): Promise<Record<string, unknown>> {
  return res.json().catch(() => ({}));
}

function messageOf(body: Record<string, unknown>, fallback: string) {
  return typeof body.message === 'string' ? body.message : fallback;
}

export const contractsService = {
  list: async (filters?: {
    q?: string;
    status?: ContractStatus;
    personId?: string;
  }): Promise<{ data: ContractListItem[] }> => {
    const params = new URLSearchParams();
    if (filters?.q) params.set('q', filters.q);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.personId) params.set('personId', filters.personId);
    const query = params.toString();
    const res = await apiFetch(`/contracts${query ? `?${query}` : ''}`);
    const body = await readBody(res);
    if (!res.ok) throw new Error(messageOf(body, 'Falha ao listar os contratos.'));
    return body as unknown as { data: ContractListItem[] };
  },

  get: async (id: string): Promise<ContractDetail> => {
    const res = await apiFetch(`/contracts/${id}`);
    const body = await readBody(res);
    if (!res.ok) throw new Error(messageOf(body, 'Falha ao carregar o contrato.'));
    return body as unknown as ContractDetail;
  },

  create: async (input: ContractInput): Promise<ContractDetail> => {
    const res = await apiFetch('/contracts', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    const body = await readBody(res);
    if (!res.ok) throw new Error(messageOf(body, 'Falha ao abrir o contrato.'));
    return body as unknown as ContractDetail;
  },

  update: async (id: string, input: ContractUpdate): Promise<ContractDetail> => {
    const res = await apiFetch(`/contracts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
    const body = await readBody(res);
    if (!res.ok) throw new Error(messageOf(body, 'Falha ao salvar o contrato.'));
    return body as unknown as ContractDetail;
  },

  previewBillings: async (contractId?: string): Promise<ContractBillingResult> => {
    const query = contractId ? `?contractId=${contractId}` : '';
    const res = await apiFetch(`/contracts/billings/preview${query}`);
    const body = await readBody(res);
    if (!res.ok) throw new Error(messageOf(body, 'Falha ao consultar a cobrança.'));
    return body as unknown as ContractBillingResult;
  },

  generateBillings: async (contractId?: string): Promise<ContractBillingResult> => {
    const res = await apiFetch('/contracts/billings', {
      method: 'POST',
      body: JSON.stringify(contractId ? { contractId } : {}),
    });
    const body = await readBody(res);
    if (!res.ok) throw new Error(messageOf(body, 'Falha ao gerar a cobrança.'));
    return body as unknown as ContractBillingResult;
  },
};
