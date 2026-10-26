import { XMLParser } from 'fast-xml-parser';

import { moneyToCents } from './cost.ts';

export interface DanfeParty {
  name: string;
  taxId: string;
  stateRegistration: string | null;
  address: string;
}

export interface DanfeItem {
  number: string;
  code: string;
  description: string;
  ncm: string;
  cfop: string;
  unit: string;
  quantity: string;
  unitPrice: number;
  amount: number;
}

export interface DanfeView {
  accessKey: string;
  number: string;
  series: string;
  issuedAt: string;
  operation: string;
  protocol: string | null;
  emitter: DanfeParty;
  recipient: DanfeParty;
  items: DanfeItem[];
  productsAmount: number;
  freightAmount: number;
  discountAmount: number;
  totalAmount: number;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
});

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function text(value: unknown) {
  if (value == null) return '';
  return String(value).trim();
}

function formatCep(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 8) return value;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function formatAddress(address: Record<string, unknown> | null) {
  if (!address) return '';
  const street = [text(address.xLgr), text(address.nro)].filter(Boolean).join(', ');
  const city = text(address.xMun);
  const state = text(address.UF);
  const place = [
    text(address.xBairro),
    city && state ? `${city}/${state}` : city || state,
  ]
    .filter(Boolean)
    .join(' - ');
  const cep = formatCep(text(address.CEP));
  return [street, place, cep ? `CEP ${cep}` : ''].filter(Boolean).join(' - ');
}

function party(node: Record<string, unknown> | null, addressKey: string): DanfeParty {
  const address = asRecord(node?.[addressKey]);
  const registration = text(node?.IE);
  return {
    name: text(node?.xNome) || '—',
    taxId: text(node?.CNPJ) || text(node?.CPF),
    stateRegistration: registration || null,
    address: formatAddress(address),
  };
}

/** Lê o XML completo da NF-e para a consulta do DANFE. Resumo da SEFAZ não serve. */
export function readDanfe(xml: string): DanfeView | null {
  let root: Record<string, unknown>;
  try {
    root = parser.parse(xml) as Record<string, unknown>;
  } catch {
    return null;
  }
  const pack = asRecord(root.nfeProc) ?? root;
  const nfe = asRecord(pack.NFe) ?? asRecord(root.NFe);
  const inf = asRecord(nfe?.infNFe) ?? asRecord(pack.infNFe);
  if (!inf) return null;

  const ide = asRecord(inf.ide);
  const total = asRecord(asRecord(inf.total)?.ICMSTot);
  const accessKey = text(inf['@_Id']).replace(/^NFe/, '');
  const protocol = text(asRecord(asRecord(pack.protNFe)?.infProt)?.nProt) || null;
  const items = asArray(
    inf.det as Record<string, unknown> | Record<string, unknown>[],
  ).map((det, index) => {
    const item = asRecord(det) ?? {};
    const prod = asRecord(item.prod) ?? {};
    return {
      number: text(item['@_nItem']) || String(index + 1),
      code: text(prod.cProd),
      description: text(prod.xProd) || 'Item sem descrição',
      ncm: text(prod.NCM),
      cfop: text(prod.CFOP),
      unit: text(prod.uCom) || 'UN',
      quantity: text(prod.qCom),
      unitPrice: moneyToCents(text(prod.vUnCom)),
      amount: moneyToCents(text(prod.vProd)),
    };
  });

  return {
    accessKey,
    number:
      text(ide?.nNF) || (accessKey ? accessKey.slice(25, 34).replace(/^0+/, '') : ''),
    series:
      text(ide?.serie) || (accessKey ? accessKey.slice(22, 25).replace(/^0+/, '') : ''),
    issuedAt: text(ide?.dhEmi) || text(ide?.dEmi),
    operation: text(ide?.natOp),
    protocol,
    emitter: party(asRecord(inf.emit), 'enderEmit'),
    recipient: party(asRecord(inf.dest), 'enderDest'),
    items,
    productsAmount: moneyToCents(text(total?.vProd)),
    freightAmount: moneyToCents(text(total?.vFrete)),
    discountAmount: moneyToCents(text(total?.vDesc)),
    totalAmount: moneyToCents(text(total?.vNF)),
  };
}
