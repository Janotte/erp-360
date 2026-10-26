import { gunzipSync } from 'node:zlib';

import type { CertificateEnvironment } from '@erp-360/shared';
import { XMLParser } from 'fast-xml-parser';

const portal = 'http://www.portalfiscal.inf.br/nfe';
const service = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe';

const urls = {
  production:
    'https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx',
  homologation:
    'https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx',
} as const;

export type DfeQuery =
  | { kind: 'lastNsu'; ultNsu: string }
  | { kind: 'nsu'; nsu: string }
  | { kind: 'accessKey'; accessKey: string };

export function dfeDistributionUrl(environment: CertificateEnvironment) {
  return urls[environment];
}

function compactXml(value: string) {
  return value.replace(/>\s+</g, '><').trim();
}

function requireDigits(value: string, length: number, message: string) {
  if (!new RegExp(`^[0-9]{${length}}$`).test(value)) {
    throw new Error(message);
  }
}

function queryXml(query: DfeQuery) {
  if (query.kind === 'lastNsu') {
    requireDigits(query.ultNsu, 15, 'O NSU da distribuição de DF-e é inválido.');
    return `<distNSU><ultNSU>${query.ultNsu}</ultNSU></distNSU>`;
  }
  if (query.kind === 'nsu') {
    requireDigits(query.nsu, 15, 'O NSU da distribuição de DF-e é inválido.');
    return `<consNSU><NSU>${query.nsu}</NSU></consNSU>`;
  }
  requireDigits(query.accessKey, 44, 'A chave da distribuição de DF-e é inválida.');
  return `<consChNFe><chNFe>${query.accessKey}</chNFe></consChNFe>`;
}

/** Pedido da NFeDistribuicaoDFe. O Ambiente Nacional exige SOAP 1.2, mesmo no endereço .asmx. */
export function dfeDistributionRequest(input: {
  cUF: string;
  cnpj: string;
  environment: CertificateEnvironment;
  query: DfeQuery;
}) {
  requireDigits(input.cUF, 2, 'A UF da distribuição de DF-e é inválida.');
  requireDigits(input.cnpj, 14, 'O CNPJ da distribuição de DF-e é inválido.');
  const tpAmb = input.environment === 'production' ? '1' : '2';
  const distDFeInt = `<distDFeInt xmlns="${portal}" versao="1.01"><tpAmb>${tpAmb}</tpAmb><cUFAutor>${input.cUF}</cUFAutor><CNPJ>${input.cnpj}</CNPJ>${queryXml(input.query)}</distDFeInt>`;
  const body = compactXml(`<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <nfeDistDFeInteresse xmlns="${service}">
      <nfeDadosMsg>${distDFeInt}</nfeDadosMsg>
    </nfeDistDFeInteresse>
  </soap12:Body>
</soap12:Envelope>`);
  return {
    endpoint: urls[input.environment],
    body,
    headers: {
      'Content-Type': `application/soap+xml; charset=utf-8; action="${service}/nfeDistDFeInteresse"`,
    },
  };
}

export type DfeDocumentKind = 'summary' | 'nfe' | 'event_summary' | 'event' | 'unknown';

export interface DfeDocument {
  nsu: string;
  schema: string;
  kind: DfeDocumentKind;
  accessKey: string | null;
  xml: string;
}

export interface DfeDistribution {
  cStat: string;
  reason: string;
  respondedAt: string | null;
  ultNsu: string | null;
  maxNsu: string | null;
  documents: DfeDocument[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
});

const unread = 'A resposta da distribuição de DF-e não pôde ser lida.';

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function textOf(value: unknown) {
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  if (value && typeof value === 'object' && '#text' in value) {
    return textOf((value as { '#text': unknown })['#text']);
  }
  return '';
}

function findNode(node: unknown, name: string): unknown {
  if (!node || typeof node !== 'object') return null;
  const record = node as Record<string, unknown>;
  if (name in record) return record[name];
  for (const value of Object.values(record)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findNode(item, name);
        if (found != null) return found;
      }
      continue;
    }
    const found = findNode(value, name);
    if (found != null) return found;
  }
  return null;
}

function documentKind(schema: string): DfeDocumentKind {
  const name = schema.toLowerCase();
  if (name.startsWith('resnfe')) return 'summary';
  if (name.startsWith('procnfe')) return 'nfe';
  if (name.startsWith('resevento')) return 'event_summary';
  if (name.startsWith('proceventonfe')) return 'event';
  return 'unknown';
}

function accessKeyOf(xml: string) {
  const identified = xml.match(/Id="NFe(\d{44})"/);
  if (identified) return identified[1];
  return xml.match(/<chNFe>(\d{44})<\/chNFe>/)?.[1] ?? null;
}

function unzipDocument(nsu: string, payload: string) {
  try {
    return gunzipSync(Buffer.from(payload.replace(/\s/g, ''), 'base64')).toString('utf8');
  } catch {
    throw new Error(`O documento ${nsu} da distribuição de DF-e não pôde ser lido.`);
  }
}

function distributionNode(body: string) {
  let root: unknown;
  try {
    root = parser.parse(body);
  } catch {
    throw new Error(unread);
  }
  let found = findNode(root, 'retDistDFeInt');
  if (typeof found === 'string' && found.includes('retDistDFeInt')) {
    try {
      found = findNode(parser.parse(found), 'retDistDFeInt');
    } catch {
      found = null;
    }
  }
  if (!found || typeof found !== 'object') throw new Error(unread);
  return found as Record<string, unknown>;
}

/** Lê o SOAP da NFeDistribuicaoDFe e descompacta cada docZip. */
export function parseDfeDistribution(body: string): DfeDistribution {
  const dist = distributionNode(body);
  const cStat = textOf(dist.cStat);
  if (!/^[0-9]{3}$/.test(cStat)) throw new Error(unread);
  const lote = (dist.loteDistDFeInt ?? null) as Record<string, unknown> | null;
  const documents = asArray(
    lote?.docZip as Record<string, unknown> | Record<string, unknown>[],
  ).map((doc) => {
    const nsu = textOf(doc['@_NSU']);
    const schema = textOf(doc['@_schema']);
    if (!/^[0-9]{15}$/.test(nsu)) {
      throw new Error('Um documento da distribuição de DF-e está sem NSU.');
    }
    const xml = unzipDocument(nsu, textOf(doc));
    return {
      nsu,
      schema,
      kind: documentKind(schema),
      accessKey: accessKeyOf(xml),
      xml,
    };
  });
  const respondedAt = textOf(dist.dhResp);
  const ultNsu = textOf(dist.ultNSU);
  const maxNsu = textOf(dist.maxNSU);
  return {
    cStat,
    reason: textOf(dist.xMotivo),
    respondedAt: respondedAt || null,
    ultNsu: ultNsu || null,
    maxNsu: maxNsu || null,
    documents,
  };
}
