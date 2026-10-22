import { apiFetch } from './apiClient';

export type InboundStatus =
  | 'pending'
  | 'pre_note'
  | 'divergent'
  | 'posted'
  | 'reversed'
  | 'ignored';

export interface InboundNature {
  id: string;
  code: string;
  name: string;
  fiscalPurpose: string;
  movesStock: boolean;
}

export interface InboundLine {
  id: string;
  lineNumber: number;
  supplierCode: string;
  description: string;
  ncmCode: string | null;
  cestCode: string | null;
  barcode: string | null;
  xmlCfop: string;
  entryCfop: string | null;
  commercialQty: string;
  commercialUnit: string;
  factor: string;
  unitPrice: string;
  lineAmount: number;
  itemId: string | null;
  itemCode: string | null;
  itemName: string | null;
  unitCost: string | null;
}

export interface InboundInstallment {
  id: string;
  number: string;
  dueOn: string;
  amount: number;
}

export interface InboundDocument {
  id: string;
  status: InboundStatus;
  model: string;
  accessKey: string | null;
  number: string;
  series: string;
  issueOn: string;
  inboundOn: string | null;
  supplierId: string | null;
  supplierTaxId: string | null;
  supplierName: string | null;
  supplierActive: boolean | null;
  natureId: string | null;
  hasProtocol: boolean;
  totalAmount: number;
  blockers: string[];
  lines: InboundLine[];
  installments: InboundInstallment[];
}

export interface InboundListItem {
  id: string;
  status: InboundStatus;
  number: string;
  series: string;
  issueOn: string;
  inboundOn: string | null;
  supplierName: string | null;
  linkedSupplierName: string | null;
  totalAmount: number;
  accessKey: string | null;
}

export interface InboundDraftLine {
  lineNumber: number;
  supplierCode: string;
  description: string;
  xmlCfop: string;
  commercialQty: number;
  commercialUnit: string;
  unitPrice: number;
  factor: number;
  entryCfop?: string | null;
  itemId?: string | null;
  barcode?: string | null;
  ncmCode?: string | null;
  cestCode?: string | null;
}

export interface InboundDraft {
  supplierId?: string | null;
  natureId?: string | null;
  number: string;
  series: string;
  issueOn: string;
  lines: InboundDraftLine[];
  installments: { number: string; dueOn: string; amount: number }[];
}

async function readBody(res: Response) {
  return res.json().catch(() => ({}));
}

async function parse<T>(res: Response, fallback: string): Promise<T> {
  const body = await readBody(res);
  if (!res.ok) throw new Error(body.message || body.error || fallback);
  return body as T;
}

export const inboundService = {
  natures: async (): Promise<InboundNature[]> => {
    const res = await apiFetch('/inbound/natures');
    return parse(res, 'Falha ao carregar naturezas.');
  },
  list: async (): Promise<InboundListItem[]> => {
    const res = await apiFetch('/inbound');
    return parse(res, 'Falha ao carregar entradas.');
  },
  get: async (id: string): Promise<InboundDocument> => {
    const res = await apiFetch(`/inbound/${id}`);
    return parse(res, 'Falha ao carregar a nota.');
  },
  createManual: async (dados: InboundDraft): Promise<InboundDocument> => {
    const res = await apiFetch('/inbound/manual', {
      method: 'POST',
      body: JSON.stringify(dados),
    });
    return parse(res, 'Falha ao criar a entrada.');
  },
  importXml: async (fileName: string, xml: string): Promise<InboundDocument> => {
    const res = await apiFetch('/inbound/xml', {
      method: 'POST',
      body: JSON.stringify({ fileName, xml }),
    });
    return parse(res, 'Falha ao importar o XML.');
  },
  save: async (id: string, dados: InboundDraft): Promise<InboundDocument> => {
    const res = await apiFetch(`/inbound/${id}`, {
      method: 'PUT',
      body: JSON.stringify(dados),
    });
    return parse(res, 'Falha ao salvar a nota.');
  },
  createSupplier: async (id: string): Promise<InboundDocument> => {
    const res = await apiFetch(`/inbound/${id}/supplier`, { method: 'POST' });
    return parse(res, 'Falha ao cadastrar o fornecedor.');
  },
  post: async (id: string): Promise<InboundDocument> => {
    const res = await apiFetch(`/inbound/${id}/post`, { method: 'POST' });
    return parse(res, 'Falha ao lançar a nota.');
  },
  remove: async (id: string): Promise<void> => {
    const res = await apiFetch(`/inbound/${id}`, { method: 'DELETE' });
    if (res.status === 204) return;
    const body = await readBody(res);
    throw new Error(body.message || body.error || 'Falha ao excluir a nota.');
  },
  reverse: async (id: string): Promise<InboundDocument> => {
    const res = await apiFetch(`/inbound/${id}/reverse`, { method: 'POST' });
    return parse(res, 'Falha ao estornar a nota.');
  },
};

export const inboundStatusLabel: Record<InboundStatus, string> = {
  pending: 'Pendente',
  pre_note: 'Pré-nota',
  divergent: 'Divergente',
  posted: 'Lançada',
  reversed: 'Estornada',
  ignored: 'Ignorada',
};
