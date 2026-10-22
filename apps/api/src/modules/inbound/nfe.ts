import { XMLParser } from 'fast-xml-parser';

import { isValidNfeAccessKey, moneyToCents } from './cost.ts';
import { InboundError } from './errors.ts';

export interface ParsedInboundLine {
  lineNumber: number;
  supplierCode: string;
  description: string;
  ncmCode: string | null;
  barcode: string | null;
  xmlCfop: string;
  commercialQty: string;
  commercialUnit: string;
  unitPrice: string;
  lineAmount: number;
  freightAmount: number;
  insuranceAmount: number;
  otherAmount: number;
  discountAmount: number;
  ipiAmount: number;
  stAmount: number;
  icmsAmount: number;
}

export interface ParsedInboundInstallment {
  number: string;
  dueOn: string;
  amount: number;
}

export interface ParsedNfe {
  accessKey: string;
  number: string;
  series: string;
  issueOn: string;
  supplierTaxId: string;
  supplierName: string;
  stateRegistration: string | null;
  recipientTaxId: string;
  hasProtocol: boolean;
  totalAmount: number;
  lines: ParsedInboundLine[];
  installments: ParsedInboundInstallment[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
});

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function text(value: unknown) {
  if (value == null) return '';
  return String(value).trim();
}

function decimal(value: unknown, scale: number) {
  const parsed = Number(text(value).replace(',', '.'));
  if (!Number.isFinite(parsed)) return (0).toFixed(scale);
  return parsed.toFixed(scale);
}

function civilFromDateTime(value: string) {
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match) {
    throw new InboundError(400, 'A data de emissão da NF-e é inválida.');
  }
  return match[1];
}

function taxAmount(group: unknown, tag: string) {
  if (!group || typeof group !== 'object') return 0;
  for (const child of Object.values(group as Record<string, unknown>)) {
    if (child && typeof child === 'object' && tag in child) {
      return moneyToCents((child as Record<string, unknown>)[tag] as string);
    }
  }
  return 0;
}

function rejectedStatus(code: string) {
  return ['101', '151', '155', '110', '301', '302'].includes(code);
}

export function parseNfeXml(xml: string): ParsedNfe {
  let root: Record<string, unknown>;
  try {
    root = parser.parse(xml) as Record<string, unknown>;
  } catch {
    throw new InboundError(400, 'O XML da NF-e não pôde ser lido.');
  }

  const pack = (root.nfeProc ?? root) as Record<string, unknown>;
  const nfe = (pack.NFe ?? root.NFe) as Record<string, unknown> | undefined;
  const inf = (nfe?.infNFe ?? null) as Record<string, unknown> | null;
  if (!inf) throw new InboundError(400, 'O arquivo não contém uma NF-e.');

  const rawId = text(inf['@_Id']).replace(/^NFe/, '');
  if (!isValidNfeAccessKey(rawId)) {
    throw new InboundError(400, 'A chave da NF-e é inválida.');
  }
  const ide = inf.ide as Record<string, unknown>;
  const model = text(ide?.mod);
  if (model !== '55') {
    throw new InboundError(400, 'Somente NF-e modelo 55 entra nesta etapa.');
  }
  if (rawId.slice(20, 22) !== '55') {
    throw new InboundError(400, 'A chave não corresponde a uma NF-e modelo 55.');
  }

  const emit = inf.emit as Record<string, unknown>;
  const dest = inf.dest as Record<string, unknown>;
  const supplierTaxId = text(emit?.CNPJ);
  const recipientTaxId = text(dest?.CNPJ);
  if (rawId.slice(6, 20) !== supplierTaxId) {
    throw new InboundError(400, 'O CNPJ do emitente não confere com a chave.');
  }

  const prot = ((pack.protNFe as Record<string, unknown> | undefined)?.infProt ??
    null) as Record<string, unknown> | null;
  const protocolStatus = text(prot?.cStat);
  if (protocolStatus && rejectedStatus(protocolStatus)) {
    throw new InboundError(400, 'A NF-e está cancelada ou denegada.');
  }
  const hasProtocol = protocolStatus === '100' || protocolStatus === '150';
  if (prot && text(prot.chNFe) && text(prot.chNFe) !== rawId) {
    throw new InboundError(400, 'O protocolo não corresponde à chave da NF-e.');
  }
  if (!nfe?.Signature) {
    throw new InboundError(400, 'A NF-e não contém assinatura digital.');
  }

  const total = ((inf.total as Record<string, unknown> | undefined)?.ICMSTot ??
    {}) as Record<string, unknown>;
  const lines = asArray(inf.det as Record<string, unknown> | Record<string, unknown>[]).map(
    (det, index) => {
      const prod = (det.prod ?? {}) as Record<string, unknown>;
      const qty = Number(text(prod.qCom).replace(',', '.'));
      if (!Number.isFinite(qty) || qty <= 0) {
        throw new InboundError(400, `O item ${index + 1} está com quantidade inválida.`);
      }
      const cfop = text(prod.CFOP);
      if (!/^[0-9]{4}$/.test(cfop)) {
        throw new InboundError(400, `O item ${index + 1} está sem CFOP.`);
      }
      const barcode = text(prod.cEAN);
      const tax = (det.imposto ?? {}) as Record<string, unknown>;
      const ipi = tax.IPI as Record<string, unknown> | undefined;
      const ipiValue = moneyToCents(
        (ipi?.IPITrib as Record<string, unknown> | undefined)?.vIPI as string,
      );
      return {
        lineNumber: index + 1,
        supplierCode: text(prod.cProd).slice(0, 60),
        description: text(prod.xProd).slice(0, 120) || 'Item sem descrição',
        ncmCode: text(prod.NCM).replace(/\D/g, '').slice(0, 8) || null,
        barcode: barcode && barcode.toUpperCase() !== 'SEM GTIN' ? barcode.slice(0, 14) : null,
        xmlCfop: cfop,
        commercialQty: decimal(prod.qCom, 4),
        commercialUnit: text(prod.uCom).slice(0, 6) || 'UN',
        unitPrice: decimal(prod.vUnCom, 4),
        lineAmount: moneyToCents(prod.vProd as string),
        freightAmount: moneyToCents(prod.vFrete as string),
        insuranceAmount: moneyToCents(prod.vSeg as string),
        otherAmount: moneyToCents(prod.vOutro as string),
        discountAmount: moneyToCents(prod.vDesc as string),
        ipiAmount: ipiValue,
        stAmount: taxAmount(tax.ICMS, 'vICMSST'),
        icmsAmount: taxAmount(tax.ICMS, 'vICMS'),
      } satisfies ParsedInboundLine;
    },
  );
  if (lines.length === 0) {
    throw new InboundError(400, 'A NF-e não tem itens.');
  }

  const cobr = (inf.cobr ?? {}) as Record<string, unknown>;
  const installments = asArray(cobr.dup as Record<string, unknown> | Record<string, unknown>[])
    .map((dup, index) => ({
      number: text(dup.nDup).slice(0, 3) || String(index + 1).padStart(3, '0'),
      dueOn: civilFromDateTime(text(dup.dVenc) || text(ide.dhEmi) || text(ide.dEmi)),
      amount: moneyToCents(dup.vDup as string),
    }))
    .filter((dup) => dup.amount > 0);

  const issueSource = text(ide.dhEmi) || text(ide.dEmi);
  return {
    accessKey: rawId,
    number: text(ide.nNF).replace(/\D/g, '').slice(0, 9) || rawId.slice(25, 34).replace(/^0+/, ''),
    series: text(ide.serie).replace(/\D/g, '').slice(0, 3) || '0',
    issueOn: civilFromDateTime(issueSource),
    supplierTaxId,
    supplierName: text(emit.xNome).slice(0, 120),
    stateRegistration: text(emit.IE) || null,
    recipientTaxId,
    hasProtocol,
    totalAmount: moneyToCents(total.vNF as string),
    lines,
    installments,
  };
}
