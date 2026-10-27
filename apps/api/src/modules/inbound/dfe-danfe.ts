import { XMLParser } from 'fast-xml-parser';

import { moneyToCents } from './cost.ts';

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

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
});

const emptyTransport: DanfeTransport = {
  carrierName: '',
  freightType: '',
  anttCode: '',
  plate: '',
  plateState: '',
  taxId: '',
  address: '',
  city: '',
  state: '',
  stateRegistration: '',
  volumeQuantity: '',
  volumeSpecies: '',
  volumeBrand: '',
  volumeNumber: '',
  grossWeight: '',
  netWeight: '',
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function text(value: unknown) {
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  return '';
}

function cents(value: unknown) {
  return moneyToCents(text(value));
}

function centsOrNull(value: unknown) {
  return text(value) ? moneyToCents(text(value)) : null;
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
    stateRegistrationSt: text(node?.IEST) || null,
    municipalRegistration: text(node?.IM) || null,
    address: formatAddress(address),
    street: [text(address?.xLgr), text(address?.nro), text(address?.xCpl)]
      .filter(Boolean)
      .join(', '),
    neighborhood: text(address?.xBairro),
    city: text(address?.xMun),
    state: text(address?.UF),
    postalCode: text(address?.CEP),
    phone: text(address?.fone),
  };
}

function taxGroup(node: Record<string, unknown> | null) {
  if (!node) return null;
  for (const value of Object.values(node)) {
    const group = asRecord(value);
    if (!group) continue;
    if (text(group.CST) || text(group.CSOSN) || text(group.vBC) || text(group.vICMS)) {
      return group;
    }
  }
  return null;
}

function readTransport(node: Record<string, unknown> | null): DanfeTransport {
  if (!node) return emptyTransport;
  const carrier = asRecord(node.transporta);
  const vehicle = asRecord(node.veicTransp);
  const volume = asRecord(asArray(node.vol)[0]);
  return {
    carrierName: text(carrier?.xNome),
    freightType: text(node.modFrete),
    anttCode: text(vehicle?.RNTC),
    plate: text(vehicle?.placa),
    plateState: text(vehicle?.UF),
    taxId: text(carrier?.CNPJ) || text(carrier?.CPF),
    address: text(carrier?.xEnder),
    city: text(carrier?.xMun),
    state: text(carrier?.UF),
    stateRegistration: text(carrier?.IE),
    volumeQuantity: text(volume?.qVol),
    volumeSpecies: text(volume?.esp),
    volumeBrand: text(volume?.marca),
    volumeNumber: text(volume?.nVol),
    grossWeight: text(volume?.pesoB),
    netWeight: text(volume?.pesoL),
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
  const total = asRecord(inf.total);
  const icms = asRecord(total?.ICMSTot);
  const issqn = asRecord(total?.ISSQNtot);
  const extra = asRecord(inf.infAdic);
  const protocol = asRecord(asRecord(pack.protNFe)?.infProt);
  const accessKey = text(inf['@_Id']).replace(/^NFe/, '');
  const departure = text(ide?.dhSaiEnt);
  const items = asArray(
    inf.det as Record<string, unknown> | Record<string, unknown>[],
  ).map((det, index) => {
    const item = asRecord(det) ?? {};
    const prod = asRecord(item.prod) ?? {};
    const tax = asRecord(item.imposto);
    const icmsItem = taxGroup(asRecord(tax?.ICMS));
    const ipiItem = taxGroup(asRecord(tax?.IPI));
    return {
      number: text(item['@_nItem']) || String(index + 1),
      code: text(prod.cProd),
      description: text(prod.xProd) || 'Item sem descrição',
      ncm: text(prod.NCM),
      cst: text(icmsItem?.CST) || text(icmsItem?.CSOSN),
      cfop: text(prod.CFOP),
      unit: text(prod.uCom) || 'UN',
      quantity: text(prod.qCom),
      unitPrice: cents(prod.vUnCom),
      amount: cents(prod.vProd),
      icmsBase: centsOrNull(icmsItem?.vBC),
      icmsAmount: centsOrNull(icmsItem?.vICMS),
      icmsRate: text(icmsItem?.pICMS),
      ipiAmount: centsOrNull(ipiItem?.vIPI),
      ipiRate: text(ipiItem?.pIPI),
    };
  });

  return {
    accessKey,
    number:
      text(ide?.nNF) || (accessKey ? accessKey.slice(25, 34).replace(/^0+/, '') : ''),
    series:
      text(ide?.serie) || (accessKey ? accessKey.slice(22, 25).replace(/^0+/, '') : ''),
    issuedAt: text(ide?.dhEmi) || text(ide?.dEmi),
    entryAt: departure || text(ide?.dSaiEnt),
    entryTime: departure ? '' : text(ide?.hSaiEnt),
    operation: text(ide?.natOp),
    operationType: text(ide?.tpNF),
    protocol: text(protocol?.nProt) || null,
    protocolAt: text(protocol?.dhRecbto),
    emitter: party(asRecord(inf.emit), 'enderEmit'),
    recipient: party(asRecord(inf.dest), 'enderDest'),
    items,
    duplicates: asArray(asRecord(inf.cobr)?.dup as Record<string, unknown>).flatMap(
      (dup) => {
        const row = asRecord(dup);
        if (!row) return [];
        return [
          {
            number: text(row.nDup),
            dueOn: text(row.dVenc),
            amount: cents(row.vDup),
          },
        ];
      },
    ),
    transport: readTransport(asRecord(inf.transp)),
    productsAmount: cents(icms?.vProd),
    freightAmount: cents(icms?.vFrete),
    insuranceAmount: cents(icms?.vSeg),
    discountAmount: cents(icms?.vDesc),
    otherAmount: cents(icms?.vOutro),
    icmsBase: cents(icms?.vBC),
    icmsAmount: cents(icms?.vICMS),
    icmsStBase: cents(icms?.vBCST),
    icmsStAmount: cents(icms?.vST),
    importAmount: cents(icms?.vII),
    icmsSenderAmount: cents(icms?.vICMSUFRemet),
    fcpAmount: cents(icms?.vFCP),
    pisAmount: cents(icms?.vPIS),
    ipiAmount: cents(icms?.vIPI),
    icmsDestinationAmount: cents(icms?.vICMSUFDest),
    taxAmount: cents(icms?.vTotTrib),
    cofinsAmount: cents(icms?.vCOFINS),
    totalAmount: cents(icms?.vNF),
    servicesAmount: cents(issqn?.vServ),
    issqnBase: cents(issqn?.vBC),
    issqnAmount: cents(issqn?.vISS),
    additionalInfo: [text(extra?.infCpl), text(extra?.infAdFisco)]
      .filter(Boolean)
      .join('\n'),
  };
}
