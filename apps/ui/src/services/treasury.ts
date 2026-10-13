import { apiFetch } from './apiClient';

async function parseJson(res: Response) {
  return res.json().catch(() => ({}));
}

export type BankAccountKind = 'operating' | 'investment';

export interface BankAccount {
  id: string;
  name: string;
  kind?: BankAccountKind;
  branchNumber?: string | null;
  accountCode?: string | null;
  planAccountId?: string | null;
  openingOn?: string | null;
  openingAmount?: number;
  balance: number;
  financialInstitutionId?: string | null;
}

export interface TreasuryEntry {
  id: string;
  occurredOn: string;
  description: string;
  inflowAmount: number;
  outflowAmount: number;
  balance: number;
  reconciled?: boolean;
  transferId?: string | null;
}

export interface FinancialSettings {
  tenantId: string;
  lateFeeBps: number;
  dailyInterestBps: number;
  graceDays: number;
  cashPlanAccountId?: string | null;
  discountObtainedPlanAccountId?: string | null;
  discountGrantedPlanAccountId?: string | null;
  lateFeePaidPlanAccountId?: string | null;
  lateFeeReceivedPlanAccountId?: string | null;
  cashOpeningOn?: string | null;
  cashOpeningAmount?: number;
}

export interface CashFlowDay {
  date: string;
  inflows: number;
  outflows: number;
  balance: number;
}

export const treasuryService = {
  settings: async (): Promise<FinancialSettings> => {
    const res = await apiFetch(`/financial/settings`);
    const body = await parseJson(res);
    if (!res.ok) throw new Error(body.message || 'Falha ao carregar configurações.');
    return body as FinancialSettings;
  },
  saveSettings: async (
    dados: Omit<FinancialSettings, 'tenantId'>,
  ): Promise<FinancialSettings> => {
    const res = await apiFetch(`/financial/settings`, {
      method: 'PUT',
      body: JSON.stringify(dados),
    });
    const body = await parseJson(res);
    if (!res.ok) throw new Error(body.message || 'Falha ao salvar configurações.');
    return body as FinancialSettings;
  },
  cashEntries: async (): Promise<TreasuryEntry[]> => {
    const res = await apiFetch(`/financial/cash-entries`);
    const body = await parseJson(res);
    if (!res.ok) throw new Error(body.message || 'Falha ao carregar o livro caixa.');
    return Array.isArray(body) ? body : [];
  },
  cashFlow: async (): Promise<{ openingBalance: number; days: CashFlowDay[] }> => {
    const res = await apiFetch(`/financial/cash-flow?days=60`);
    const body = await parseJson(res);
    if (!res.ok) throw new Error(body.message || 'Falha ao carregar o fluxo de caixa.');
    return body as { openingBalance: number; days: CashFlowDay[] };
  },
  bankAccounts: async (): Promise<BankAccount[]> => {
    const res = await apiFetch(`/financial/bank-accounts`);
    const body = await parseJson(res);
    if (!res.ok) throw new Error(body.message || 'Falha ao listar contas bancárias.');
    return Array.isArray(body) ? body : [];
  },
  createBankAccount: async (dados: {
    name: string;
    kind?: BankAccountKind;
    branchNumber?: string;
    accountCode?: string;
    planAccountId?: string;
    openingOn?: string | null;
    openingAmount?: number;
  }): Promise<BankAccount> => {
    const res = await apiFetch(`/financial/bank-accounts`, {
      method: 'POST',
      body: JSON.stringify(dados),
    });
    const body = await parseJson(res);
    if (!res.ok) throw new Error(body.message || 'Falha ao cadastrar conta bancária.');
    return body as BankAccount;
  },
  updateBankAccount: async (
    id: string,
    dados: {
      name: string;
      kind?: BankAccountKind;
      branchNumber?: string;
      accountCode?: string;
      planAccountId?: string;
      openingOn?: string | null;
      openingAmount?: number;
    },
  ): Promise<BankAccount> => {
    const res = await apiFetch(`/financial/bank-accounts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(dados),
    });
    const body = await parseJson(res);
    if (!res.ok) throw new Error(body.message || 'Falha ao atualizar conta bancária.');
    return body as BankAccount;
  },
  saveCashOpening: async (dados: {
    cashOpeningOn?: string | null;
    cashOpeningAmount: number;
  }): Promise<FinancialSettings> => {
    const res = await apiFetch(`/financial/cash-opening`, {
      method: 'PUT',
      body: JSON.stringify(dados),
    });
    const body = await parseJson(res);
    if (!res.ok)
      throw new Error(body.message || 'Falha ao salvar o saldo inicial do caixa.');
    return body as FinancialSettings;
  },
  bankEntries: async (
    id: string,
  ): Promise<{ account: BankAccount; entries: TreasuryEntry[] }> => {
    const res = await apiFetch(`/financial/bank-accounts/${id}/entries`);
    const body = await parseJson(res);
    if (!res.ok) throw new Error(body.message || 'Falha ao carregar extrato.');
    return body as { account: BankAccount; entries: TreasuryEntry[] };
  },
  transfer: async (dados: {
    occurredOn: string;
    amount: number;
    fromTreasury: 'cash' | 'bank';
    fromBankAccountId?: string | null;
    toTreasury: 'cash' | 'bank';
    toBankAccountId?: string | null;
    description?: string | null;
  }) => {
    const res = await apiFetch(`/financial/transfers`, {
      method: 'POST',
      body: JSON.stringify(dados),
    });
    const body = await parseJson(res);
    if (!res.ok) throw new Error(body.message || 'Falha ao transferir.');
    return body;
  },
  reverseTransfer: async (id: string) => {
    const res = await apiFetch(`/financial/transfers/${id}`, {
      method: 'DELETE',
    });
    const body = await parseJson(res);
    if (!res.ok) throw new Error(body.message || 'Falha ao estornar a transferência.');
    return body as { id: string };
  },
  reconcile: async (id: string, reconciled: boolean): Promise<TreasuryEntry> => {
    const res = await apiFetch(`/financial/bank-entries/${id}/reconcile`, {
      method: 'POST',
      body: JSON.stringify({ reconciled }),
    });
    const body = await parseJson(res);
    if (!res.ok) throw new Error(body.message || 'Falha ao conciliar lançamento.');
    return body as TreasuryEntry;
  },
};
