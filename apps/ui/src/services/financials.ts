import { API_URL } from '@erp-360/shared';

import { authStorage } from '../utils/auth';

export interface FinancialAccount {
  id: string;
  personId: string;
  document?: string;
  description: string;
  issueDate: string;
  amount: number;
  dueDate: string;
  paymentDate?: string;
  amountPaid?: number;
  status: 'pendente' | 'pago' | 'cancelado';
}

type FinancialTipo = 'payable' | 'receivable';

const authHeaders = () => ({
  Authorization: `Bearer ${authStorage.getToken()}`,
});

const jsonHeaders = () => ({
  'Content-Type': 'application/json',
  ...authHeaders(),
});

const collection = (tipo: FinancialTipo) =>
  tipo === 'payable' ? 'payables' : 'receivables';

function normalizeAccount(item: Record<string, unknown>): FinancialAccount {
  return {
    id: String(item.id),
    personId: String(item.personId),
    document: item.document ? String(item.document) : undefined,
    description: String(item.description ?? ''),
    issueDate: String(item.issueDate ?? ''),
    amount: Number(item.amount ?? 0),
    dueDate: String(item.dueDate ?? ''),
    paymentDate:
      (item.paymentDate as string | undefined) ||
      (item.receiveDate as string | undefined),
    amountPaid:
      (item.amountPaid as number | undefined) ??
      (item.amountReceived as number | undefined),
    status: (item.status as FinancialAccount['status']) ?? 'pendente',
  };
}

async function parseJson(res: Response) {
  return res.json().catch(() => ({}));
}

export const financialService = {
  list: async (tipo: FinancialTipo): Promise<FinancialAccount[]> => {
    const res = await fetch(`${API_URL}/${collection(tipo)}`, {
      headers: authHeaders(),
    });
    const body = await parseJson(res);
    if (!res.ok) {
      throw new Error(body.message || body.error || 'Falha ao listar lançamentos.');
    }
    if (!Array.isArray(body)) return [];
    return body.map((item) => normalizeAccount(item as Record<string, unknown>));
  },
  create: async (
    tipo: FinancialTipo,
    dados: Omit<FinancialAccount, 'id' | 'status'>,
  ): Promise<FinancialAccount> => {
    const res = await fetch(`${API_URL}/${collection(tipo)}`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify(dados),
    });
    const body = await parseJson(res);
    if (!res.ok) {
      throw new Error(body.message || body.error || 'Falha ao lançar conta.');
    }
    return normalizeAccount(body as Record<string, unknown>);
  },
  pay: async (
    tipo: FinancialTipo,
    id: string,
    dados: { paymentDate: string; amountPaid: number },
  ): Promise<FinancialAccount> => {
    const endpoint = tipo === 'payable' ? 'pay' : 'receive';
    const payload =
      tipo === 'payable'
        ? dados
        : { receiveDate: dados.paymentDate, amountReceived: dados.amountPaid };

    const res = await fetch(`${API_URL}/${collection(tipo)}/${id}/${endpoint}`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify(payload),
    });
    const body = await parseJson(res);
    if (!res.ok) {
      throw new Error(body.message || body.error || 'Falha ao liquidar título.');
    }
    return normalizeAccount(body as Record<string, unknown>);
  },
  receive: async (
    tipo: 'receivable',
    id: string,
    dados: { paymentDate: string; amountPaid: number },
  ): Promise<Record<string, unknown>> => {
    const res = await fetch(`${API_URL}/${collection('receivable')}/${id}/receive`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify(dados),
    });
    const body = await parseJson(res);
    if (!res.ok) {
      throw new Error(body.message || body.error || 'Falha ao receber título.');
    }
    return body as Record<string, unknown>;
  },
};
