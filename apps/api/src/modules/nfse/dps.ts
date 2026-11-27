import { createHash, createSign } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';

import type { NfseEnvironment } from '@erp-360/shared';

import { nfeEventTimestamp } from '../inbound/dfe-event.ts';

/** O SEFIN rejeita dhEmi à frente do relógio dele (E0008). Dois minutos cobrem o atraso conhecido. */
export const nfseEmissionSkewMs = 120_000;

export function nfseEmissionTimestamp(now: Date) {
  return nfeEventTimestamp(new Date(now.getTime() - nfseEmissionSkewMs));
}

const nfseNs = 'http://www.sped.fazenda.gov.br/nfse';
const xmldsig = 'http://www.w3.org/2000/09/xmldsig#';
const excC14n = 'http://www.w3.org/2001/10/xml-exc-c14n#';
const rsaSha256 = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
const sha256Digest = 'http://www.w3.org/2001/04/xmlenc#sha256';
const enveloped = `${xmldsig}enveloped-signature`;

const endpoints: Record<NfseEnvironment, string> = {
  homologation: 'https://sefin.producaorestrita.nfse.gov.br/SefinNacional/nfse',
  production: 'https://sefin.nfse.gov.br/SefinNacional/nfse',
};

export function nfseSubmissionEndpoint(environment: NfseEnvironment) {
  return endpoints[environment];
}

export function nfseDpsId(input: {
  cityCode: string;
  cnpj: string;
  series: string;
  dpsNumber: number;
}) {
  const number = String(input.dpsNumber).padStart(15, '0');
  return `DPS${input.cityCode}2${input.cnpj}${input.series}${number}`;
}

export type NfseAddressDraft = {
  cityCode: string;
  postalCode: string;
  street: string;
  number: string;
  complement?: string | null;
  neighborhood: string;
};

export type NfseTomadorDraft = {
  kind: 'cpf' | 'cnpj';
  taxId: string;
  name: string;
  municipalRegistration?: string | null;
  address?: NfseAddressDraft | null;
  phone?: string | null;
  email?: string | null;
};

export interface NfseDpsDraft {
  environment: NfseEnvironment;
  emittedAt: string;
  series: string;
  dpsNumber: number;
  cityCode: string;
  cnpj: string;
  municipalRegistration: string | null;
  /** Telefone e e-mail do prestador. Nome e endereço não vão na DPS (E0121/E0128). */
  prestadorPhone?: string | null;
  prestadorEmail?: string | null;
  simplesNacional: '1' | '2' | '3' | '4';
  simplesAssessment: '1' | '2' | '3' | null;
  /** pTotTribSN — obrigatório para ME/EPP (3) e optante pendente (4). */
  simplesTaxPercent: string | null;
  specialTaxRegime: '0' | '1' | '2' | '3' | '4' | '5' | '6' | '9';
  issqnTaxation: '1' | '2' | '3' | '4';
  tomador: NfseTomadorDraft;
  nationalServiceCode: string;
  municipalServiceCode: string | null;
  description: string;
  issRate: string | null;
  serviceAmountCents: number;
  privateKeyPem: string;
  certificatePem: string;
}

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function certificateBody(pem: string) {
  const block = pem.match(/-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/);
  if (!block?.[1]) throw new Error('O certificado A1 da NFS-e é inválido.');
  return block[1].replace(/\s/g, '');
}

function money(cents: number) {
  const whole = Math.trunc(cents / 100);
  const fraction = String(Math.abs(cents % 100)).padStart(2, '0');
  return `${whole}.${fraction}`;
}

function rate(value: string) {
  const [whole, fraction = ''] = value.split('.');
  return `${Number(whole)}.${fraction.padEnd(2, '0').slice(0, 2)}`;
}

function digits(value: string | null | undefined) {
  return (value ?? '').replace(/\D/g, '');
}

/** Endereço nacional completo. Parcial vira rejeição E1235. */
export function nfseAddressXml(address: NfseAddressDraft | null | undefined) {
  if (!address) return '';
  const cityCode = digits(address.cityCode);
  const postalCode = digits(address.postalCode);
  const street = address.street.trim();
  const neighborhood = address.neighborhood.trim();
  const number = (address.number.trim() || 'S/N').slice(0, 60);
  const complement = address.complement?.trim() || '';
  if (!/^[0-9]{7}$/.test(cityCode) || !/^[0-9]{8}$/.test(postalCode)) return '';
  if (!street || !neighborhood) return '';
  return [
    '<end>',
    '<endNac>',
    `<cMun>${cityCode}</cMun>`,
    `<CEP>${postalCode}</CEP>`,
    '</endNac>',
    `<xLgr>${escapeXml(street.slice(0, 255))}</xLgr>`,
    `<nro>${escapeXml(number)}</nro>`,
    complement ? `<xCpl>${escapeXml(complement.slice(0, 156))}</xCpl>` : '',
    `<xBairro>${escapeXml(neighborhood.slice(0, 60))}</xBairro>`,
    '</end>',
  ]
    .filter(Boolean)
    .join('');
}

function phoneXml(value: string | null | undefined) {
  const phone = digits(value);
  if (phone.length < 6 || phone.length > 20) return '';
  return `<fone>${phone}</fone>`;
}

function emailXml(value: string | null | undefined) {
  const email = (value ?? '').trim();
  if (!email || !email.includes('@') || email.length > 80) return '';
  return `<email>${escapeXml(email)}</email>`;
}

function imXml(value: string | null | undefined) {
  const registration = (value ?? '').trim();
  return registration ? `<IM>${escapeXml(registration.slice(0, 15))}</IM>` : '';
}

export function buildSignedDps(draft: NfseDpsDraft) {
  const dpsId = nfseDpsId(draft);
  const competence = draft.emittedAt.slice(0, 10);
  // E0625: ME/EPP (e optante pendente) com ISSQN pelo SN (regApTribSN=1) e
  // tpRetISSQN=1 não pode informar pAliq. MEI também não informa.
  const issBySimples =
    (draft.simplesNacional === '3' || draft.simplesNacional === '4') &&
    draft.simplesAssessment === '1';
  const includeRate =
    draft.issRate != null &&
    draft.issqnTaxation === '1' &&
    draft.simplesNacional !== '2' &&
    !issBySimples;
  // E0120: IM só quando o município tem complemento no CNC; sem cadastro, omitir.
  const municipalRegistration = imXml(draft.municipalRegistration);
  const assessment = draft.simplesAssessment
    ? `<regApTribSN>${draft.simplesAssessment}</regApTribSN>`
    : '';
  const municipalCode = draft.municipalServiceCode
    ? `<cTribMun>${draft.municipalServiceCode}</cTribMun>`
    : '';
  const aliq = includeRate && draft.issRate ? `<pAliq>${rate(draft.issRate)}</pAliq>` : '';
  // E1235: trib exige tribFed ou totTrib. E0712: ME/EPP usa pTotTribSN, não indTotTrib.
  const totalTax =
    draft.simplesNacional === '3' || draft.simplesNacional === '4'
      ? `<totTrib><pTotTribSN>${rate(draft.simplesTaxPercent ?? '0')}</pTotTribSN></totTrib>`
      : '<totTrib><indTotTrib>0</indTotTrib></totTrib>';
  const documentTag = draft.tomador.kind === 'cpf' ? 'CPF' : 'CNPJ';
  const tomadorAddress = nfseAddressXml(draft.tomador.address);
  const infDps = [
    `<infDPS xmlns="${nfseNs}" Id="${dpsId}">`,
    `<tpAmb>${draft.environment === 'production' ? '1' : '2'}</tpAmb>`,
    `<dhEmi>${draft.emittedAt}</dhEmi>`,
    '<verAplic>ERP360</verAplic>',
    `<serie>${draft.series}</serie>`,
    `<nDPS>${draft.dpsNumber}</nDPS>`,
    `<dCompet>${competence}</dCompet>`,
    '<tpEmit>1</tpEmit>',
    `<cLocEmi>${draft.cityCode}</cLocEmi>`,
    '<prest>',
    `<CNPJ>${draft.cnpj}</CNPJ>`,
    municipalRegistration,
    // E0121/E0128: com tpEmit 1 não enviar xNome nem end do prestador.
    phoneXml(draft.prestadorPhone),
    emailXml(draft.prestadorEmail),
    '<regTrib>',
    `<opSimpNac>${draft.simplesNacional}</opSimpNac>`,
    assessment,
    `<regEspTrib>${draft.specialTaxRegime}</regEspTrib>`,
    '</regTrib>',
    '</prest>',
    '<toma>',
    `<${documentTag}>${draft.tomador.taxId}</${documentTag}>`,
    imXml(draft.tomador.municipalRegistration),
    `<xNome>${escapeXml(draft.tomador.name.slice(0, 150))}</xNome>`,
    tomadorAddress,
    phoneXml(draft.tomador.phone),
    emailXml(draft.tomador.email),
    '</toma>',
    '<serv>',
    '<locPrest>',
    `<cLocPrestacao>${draft.cityCode}</cLocPrestacao>`,
    '</locPrest>',
    '<cServ>',
    `<cTribNac>${draft.nationalServiceCode}</cTribNac>`,
    municipalCode,
    `<xDescServ>${escapeXml(draft.description)}</xDescServ>`,
    '</cServ>',
    '</serv>',
    '<valores>',
    '<vServPrest>',
    `<vServ>${money(draft.serviceAmountCents)}</vServ>`,
    '</vServPrest>',
    '<trib>',
    '<tribMun>',
    `<tribISSQN>${draft.issqnTaxation}</tribISSQN>`,
    // XSD: tribISSQN … tpRetISSQN … pAliq (pAliq antes de tpRetISSQN → E1235).
    '<tpRetISSQN>1</tpRetISSQN>',
    aliq,
    '</tribMun>',
    totalTax,
    '</trib>',
    '</valores>',
    '</infDPS>',
  ]
    .filter(Boolean)
    .join('');

  const digest = createHash('sha256').update(infDps).digest('base64');
  const signedInfoBody = [
    `<CanonicalizationMethod Algorithm="${excC14n}"></CanonicalizationMethod>`,
    `<SignatureMethod Algorithm="${rsaSha256}"></SignatureMethod>`,
    `<Reference URI="#${dpsId}">`,
    '<Transforms>',
    `<Transform Algorithm="${enveloped}"></Transform>`,
    `<Transform Algorithm="${excC14n}"></Transform>`,
    '</Transforms>',
    `<DigestMethod Algorithm="${sha256Digest}"></DigestMethod>`,
    `<DigestValue>${digest}</DigestValue>`,
    '</Reference>',
  ].join('');
  const signedInfo = `<SignedInfo xmlns="${xmldsig}">${signedInfoBody}</SignedInfo>`;
  const signature = createSign('RSA-SHA256')
    .update(signedInfo, 'utf8')
    .sign(draft.privateKeyPem, 'base64');
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<DPS xmlns="${nfseNs}" versao="1.01">`,
    infDps,
    `<Signature xmlns="${xmldsig}">`,
    `<SignedInfo>${signedInfoBody}</SignedInfo>`,
    `<SignatureValue>${signature}</SignatureValue>`,
    '<KeyInfo><X509Data>',
    `<X509Certificate>${certificateBody(draft.certificatePem)}</X509Certificate>`,
    '</X509Data></KeyInfo>',
    '</Signature>',
    '</DPS>',
  ].join('');
  const dpsXmlGZipB64 = gzipSync(Buffer.from(xml, 'utf8')).toString('base64');
  return { dpsId, xml, body: JSON.stringify({ dpsXmlGZipB64 }) };
}

export interface NfseSubmissionResult {
  outcome: 'authorized' | 'rejected' | 'unreachable';
  accessKey: string | null;
  xml: string | null;
  message: string;
}

function textOf(value: unknown, names: string[]) {
  if (!value || typeof value !== 'object') return [] as string[];
  const found: string[] = [];
  const visit = (current: unknown) => {
    if (!current || typeof current !== 'object') return;
    if (Array.isArray(current)) {
      for (const item of current) visit(item);
      return;
    }
    for (const [key, item] of Object.entries(current)) {
      if (typeof item === 'string' && names.includes(key)) {
        const text = item.trim();
        if (text && !found.includes(text)) found.push(text);
      } else if (item && typeof item === 'object') {
        visit(item);
      }
    }
  };
  visit(value);
  return found;
}

function authorizedXml(encoded: unknown) {
  if (typeof encoded !== 'string' || !encoded) return null;
  try {
    const xml = gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8');
    if (!xml.startsWith('<') || xml.length > 500_000) return null;
    return xml;
  } catch {
    return null;
  }
}

function stringField(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function refusalLines(parsed: unknown) {
  if (!parsed || typeof parsed !== 'object') return [] as string[];
  const record = parsed as Record<string, unknown>;
  const errors = record.erros ?? record.Erros;
  if (Array.isArray(errors)) {
    return errors.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const error = item as Record<string, unknown>;
      const line = [
        stringField(error.Codigo ?? error.codigo),
        stringField(error.Descricao ?? error.descricao),
        stringField(error.Complemento ?? error.complemento),
      ]
        .filter(Boolean)
        .join(' ');
      return line ? [line] : [];
    });
  }
  return textOf(parsed, [
    'Descricao',
    'descricao',
    'Mensagem',
    'mensagem',
    'message',
    'xMotivo',
    'motivo',
  ]);
}

export function readNfseSubmission(statusCode: number, body: string): NfseSubmissionResult {
  let parsed: unknown = null;
  try {
    parsed = body ? JSON.parse(body) : null;
  } catch {
    parsed = null;
  }
  const record = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  const accessKey = [record.chaveAcesso, record.chaveDeAcesso].find(
    (value) => typeof value === 'string' && /^[0-9]{50}$/.test(value),
  );
  if ((statusCode === 200 || statusCode === 201) && typeof accessKey === 'string') {
    return {
      outcome: 'authorized',
      accessKey,
      xml: authorizedXml(record.nfseXmlGZipB64),
      message: '',
    };
  }
  const refused = refusalLines(parsed);
  if (refused.length > 0 || Array.isArray(record.erros) || Array.isArray(record.Erros)) {
    return {
      outcome: 'rejected',
      accessKey: null,
      xml: null,
      message: refused.join(' ').slice(0, 2000).trim() || 'A NFS-e foi recusada.',
    };
  }
  return {
    outcome: 'unreachable',
    accessKey: null,
    xml: null,
    message: '',
  };
}
