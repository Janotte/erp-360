import { apiFetch } from './apiClient';

export type FiscalPurpose =
  | 'resale'
  | 'industrialization'
  | 'consumption'
  | 'fixed_asset'
  | 'service';

export type CfopScope = 'internal' | 'interstate' | 'import';

export interface OperationNature {
  id: string;
  code: string;
  name: string;
  fiscalPurpose: FiscalPurpose;
  movesStock: boolean;
  createsPayable: boolean;
  updatesAverageCost: boolean;
  recordsEntryPrice: boolean;
  suggestsListPrice: boolean;
  freightInCost: boolean;
  insuranceInCost: boolean;
  otherInCost: boolean;
  discountInCost: boolean;
  ipiInCost: boolean;
  stInCost: boolean;
  icmsInCost: boolean;
  planAccountId: string | null;
  planAccountCode: string | null;
  planAccountName: string | null;
  isActive: boolean;
}

export type OperationNatureInput = Omit<
  OperationNature,
  'id' | 'planAccountCode' | 'planAccountName'
>;

export interface CfopEntryRule {
  id: string;
  sourceCfop: string;
  scope: CfopScope;
  fiscalPurpose: FiscalPurpose;
  entryCfop: string;
}

export type CfopEntryRuleInput = Pick<CfopEntryRule, 'sourceCfop' | 'fiscalPurpose' | 'entryCfop'>;

async function readBody(res: Response) {
  return res.json().catch(() => ({}));
}

async function parse<T>(res: Response, fallback: string): Promise<T> {
  const body = await readBody(res);
  if (!res.ok) throw new Error(body.message || body.error || fallback);
  return body as T;
}

export const inboundSetupService = {
  listNatures: async (): Promise<OperationNature[]> => {
    const res = await apiFetch('/inbound/operation-natures');
    const body = await parse<OperationNature[]>(res, 'Falha ao carregar naturezas.');
    return Array.isArray(body) ? body : [];
  },
  getNature: async (id: string): Promise<OperationNature> => {
    const res = await apiFetch(`/inbound/operation-natures/${id}`);
    return parse(res, 'Falha ao carregar a natureza.');
  },
  createNature: async (dados: OperationNatureInput): Promise<OperationNature> => {
    const res = await apiFetch('/inbound/operation-natures', {
      method: 'POST',
      body: JSON.stringify(dados),
    });
    return parse(res, 'Falha ao cadastrar a natureza.');
  },
  updateNature: async (id: string, dados: OperationNatureInput): Promise<OperationNature> => {
    const res = await apiFetch(`/inbound/operation-natures/${id}`, {
      method: 'PUT',
      body: JSON.stringify(dados),
    });
    return parse(res, 'Falha ao atualizar a natureza.');
  },
  deleteNature: async (id: string): Promise<void> => {
    const res = await apiFetch(`/inbound/operation-natures/${id}`, { method: 'DELETE' });
    await parse(res, 'Falha ao excluir a natureza.');
  },
  listCfopRules: async (): Promise<CfopEntryRule[]> => {
    const res = await apiFetch('/inbound/cfop-rules');
    const body = await parse<CfopEntryRule[]>(res, 'Falha ao carregar regras de CFOP.');
    return Array.isArray(body) ? body : [];
  },
  createCfopRule: async (dados: CfopEntryRuleInput): Promise<CfopEntryRule> => {
    const res = await apiFetch('/inbound/cfop-rules', {
      method: 'POST',
      body: JSON.stringify(dados),
    });
    return parse(res, 'Falha ao cadastrar a regra de CFOP.');
  },
  updateCfopRule: async (id: string, dados: CfopEntryRuleInput): Promise<CfopEntryRule> => {
    const res = await apiFetch(`/inbound/cfop-rules/${id}`, {
      method: 'PUT',
      body: JSON.stringify(dados),
    });
    return parse(res, 'Falha ao atualizar a regra de CFOP.');
  },
  deleteCfopRule: async (id: string): Promise<void> => {
    const res = await apiFetch(`/inbound/cfop-rules/${id}`, { method: 'DELETE' });
    await parse(res, 'Falha ao excluir a regra de CFOP.');
  },
};
