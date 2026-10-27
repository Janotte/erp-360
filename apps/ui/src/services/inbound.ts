import { apiFetch } from './apiClient';

export type InboundStatus =
  'pending' | 'pre_note' | 'divergent' | 'posted' | 'reversed' | 'ignored' | 'discovered';

export type RecipientManifestation =
  'none' | 'aware' | 'confirmed' | 'unaware' | 'not_performed';

export type NfeAuthorizationStatus = 'authorized' | 'denied' | 'cancelled';

export type DiscoveryAction =
  | { kind: 'blocked'; message: string }
  | { kind: 'import' | 'manifest' | 'download' | 'none' };

export interface InboundListFilter {
  search?: string;
  issueFrom?: string;
  issueTo?: string;
  inboundFrom?: string;
  inboundTo?: string;
  status?: InboundStatus | '';
}

export type InboundDiscoveryResult =
  { outcome: 'imported' } | { outcome: 'aware'; message: string };

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
  recipientManifestation: RecipientManifestation;
  authorizationStatus: NfeAuthorizationStatus;
  discoveryAction: DiscoveryAction;
  blockers: string[];
  lines: InboundLine[];
  installments: InboundInstallment[];
}

export type RecipientManifestKind = Exclude<RecipientManifestation, 'none'>;

export interface InboundEventView {
  code: string;
  label: string;
  at: string | null;
  protocol: string | null;
  status: string | null;
  reason: string | null;
}

export interface DanfeParty {
  name: string;
  taxId: string;
  stateRegistration: string | null;
  stateRegistrationSt: string | null;
  municipalRegistration: string | null;
  address: string;
  street: string;
  neighborhood: string;
  city: string;
  state: string;
  postalCode: string;
  phone: string;
}

export interface DanfeItem {
  number: string;
  code: string;
  description: string;
  ncm: string;
  cst: string;
  cfop: string;
  unit: string;
  quantity: string;
  unitPrice: number;
  amount: number;
  icmsBase: number | null;
  icmsAmount: number | null;
  icmsRate: string;
  ipiAmount: number | null;
  ipiRate: string;
}

export interface DanfeDuplicate {
  number: string;
  dueOn: string;
  amount: number;
}

export interface DanfeTransport {
  carrierName: string;
  freightType: string;
  anttCode: string;
  plate: string;
  plateState: string;
  taxId: string;
  address: string;
  city: string;
  state: string;
  stateRegistration: string;
  volumeQuantity: string;
  volumeSpecies: string;
  volumeBrand: string;
  volumeNumber: string;
  grossWeight: string;
  netWeight: string;
}

export interface DanfeView {
  accessKey: string;
  number: string;
  series: string;
  issuedAt: string;
  entryAt: string;
  entryTime: string;
  operation: string;
  operationType: string;
  protocol: string | null;
  protocolAt: string;
  emitter: DanfeParty;
  recipient: DanfeParty;
  items: DanfeItem[];
  duplicates: DanfeDuplicate[];
  transport: DanfeTransport;
  productsAmount: number;
  freightAmount: number;
  insuranceAmount: number;
  discountAmount: number;
  otherAmount: number;
  icmsBase: number;
  icmsAmount: number;
  icmsStBase: number;
  icmsStAmount: number;
  importAmount: number;
  icmsSenderAmount: number;
  fcpAmount: number;
  pisAmount: number;
  ipiAmount: number;
  icmsDestinationAmount: number;
  taxAmount: number;
  cofinsAmount: number;
  totalAmount: number;
  servicesAmount: number;
  issqnBase: number;
  issqnAmount: number;
  additionalInfo: string;
}

export interface ManifestResult {
  recipientManifestation: RecipientManifestKind;
  status: string;
  reason: string;
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
  natureName: string | null;
  recipientManifestation: RecipientManifestation;
  authorizationStatus: NfeAuthorizationStatus;
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
  list: async (filter: InboundListFilter): Promise<InboundListItem[]> => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filter)) {
      if (value) params.set(key, value);
    }
    const query = params.size > 0 ? `?${params.toString()}` : '';
    const res = await apiFetch(`/inbound${query}`);
    return parse(res, 'Falha ao carregar entradas.');
  },
  get: async (id: string): Promise<InboundDocument> => {
    const res = await apiFetch(`/inbound/${id}`);
    return parse(res, 'Falha ao carregar a nota.');
  },
  discover: async (id: string): Promise<InboundDiscoveryResult> => {
    const res = await apiFetch(`/inbound/${id}/discover`, { method: 'POST' });
    return parse(res, 'Falha ao consultar a NF-e.');
  },
  events: async (id: string): Promise<InboundEventView[]> => {
    const res = await apiFetch(`/inbound/${id}/events`);
    const body = await parse<{ events: InboundEventView[] }>(
      res,
      'Falha ao carregar os eventos.',
    );
    return body.events;
  },
  manifestationXml: async (id: string): Promise<string> => {
    const res = await apiFetch(`/inbound/${id}/manifestation`);
    const body = await parse<{ xml: string }>(
      res,
      'Falha ao carregar o XML da manifestação.',
    );
    return body.xml;
  },
  danfe: async (id: string): Promise<DanfeView> => {
    const res = await apiFetch(`/inbound/${id}/danfe`);
    return parse(res, 'Falha ao carregar o DANFE.');
  },
  manifest: async (
    id: string,
    kind: RecipientManifestKind,
    justification?: string,
  ): Promise<ManifestResult> => {
    const res = await apiFetch(`/inbound/${id}/manifest`, {
      method: 'POST',
      body: JSON.stringify({ kind, justification }),
    });
    return parse(res, 'Falha ao manifestar a NF-e.');
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
  discovered: 'Descoberta',
};

export const recipientManifestationLabel: Record<RecipientManifestation, string> = {
  none: 'Sem manifesto',
  aware: 'Ciente',
  confirmed: 'Confirmada',
  unaware: 'Desconhecida',
  not_performed: 'Não realizada',
};

export const discoveryConfirm = {
  import: 'Importar esta NF-e?',
  manifest: 'Manifestar ciência desta NF-e e baixar o XML completo?',
  download: 'Baixar o XML completo?',
} as const;
