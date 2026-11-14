import { apiFetch } from './apiClient';

export interface CompanyCard {
  id: string;
  name: string;
  issuerId: string;
  issuerName: string;
  cardBrandId: string | null;
  closingDay: number;
  dueDay: number;
  bankAccountId: string | null;
  bankAccountName: string | null;
  isActive: boolean;
  openBalance: number;
}

export interface CardStatementEntry {
  id: string;
  occurredOn: string;
  dueOn: string;
  description: string;
  documentId: string | null;
  amount: number;
  status: 'pendente' | 'pago' | 'cancelado';
  balance: number;
}

export interface CardStatement {
  card: CompanyCard;
  openBalance: number;
  entries: CardStatementEntry[];
}

export interface CompanyCardInput {
  name: string;
  issuerId: string;
  cardBrandId?: string | null;
  closingDay: number;
  dueDay: number;
  bankAccountId?: string | null;
  isActive?: boolean;
}

async function parse<T>(res: Response, fallback: string): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || body.error || fallback);
  return body as T;
}

export const companyCardService = {
  list: async (): Promise<CompanyCard[]> => {
    const res = await apiFetch('/financial/company-cards');
    return parse(res, 'Falha ao carregar os cartões.');
  },
  statement: async (id: string): Promise<CardStatement> => {
    const res = await apiFetch(`/financial/company-cards/${id}/statement`);
    return parse(res, 'Falha ao carregar o extrato do cartão.');
  },
  create: async (dados: CompanyCardInput): Promise<CompanyCard> => {
    const res = await apiFetch('/financial/company-cards', {
      method: 'POST',
      body: JSON.stringify(dados),
    });
    return parse(res, 'Falha ao cadastrar o cartão.');
  },
  update: async (id: string, dados: CompanyCardInput): Promise<CompanyCard> => {
    const res = await apiFetch(`/financial/company-cards/${id}`, {
      method: 'PUT',
      body: JSON.stringify(dados),
    });
    return parse(res, 'Falha ao salvar o cartão.');
  },
};
