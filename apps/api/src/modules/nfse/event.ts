import { createHash, createSign } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';

import type { NfseCancelReasonCode, NfseEnvironment } from '@erp-360/shared';

import { nfseEmissionTimestamp } from './dps.ts';

const nfseNs = 'http://www.sped.fazenda.gov.br/nfse';
const xmldsig = 'http://www.w3.org/2000/09/xmldsig#';
const excC14n = 'http://www.w3.org/2001/10/xml-exc-c14n#';
const rsaSha256 = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
const sha256Digest = 'http://www.w3.org/2001/04/xmlenc#sha256';
const enveloped = `${xmldsig}enveloped-signature`;

const eventHosts: Record<NfseEnvironment, string> = {
  homologation: 'https://sefin.producaorestrita.nfse.gov.br/SefinNacional',
  production: 'https://sefin.nfse.gov.br/SefinNacional',
};

export const nfseCancelEventType = 'e101101';
export const nfseCancelEventCode = '101';

export function nfseEventEndpoint(environment: NfseEnvironment, accessKey: string) {
  return `${eventHosts[environment]}/nfse/${accessKey}/eventos`;
}

export function nfsePedRegEventId(accessKey: string, sequence = 1) {
  const seq = String(sequence).padStart(3, '0');
  return `PRE${accessKey}${nfseCancelEventCode}${seq}`;
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

export interface NfseCancelEventDraft {
  environment: NfseEnvironment;
  accessKey: string;
  cnpj: string;
  reasonCode: NfseCancelReasonCode;
  reasonText: string;
  sequence?: number;
  emittedAt?: string;
  privateKeyPem: string;
  certificatePem: string;
}

export function buildSignedCancelEvent(draft: NfseCancelEventDraft) {
  const sequence = draft.sequence ?? 1;
  const pedId = nfsePedRegEventId(draft.accessKey, sequence);
  const emittedAt = draft.emittedAt ?? nfseEmissionTimestamp(new Date());
  const reasonText = draft.reasonText.trim().slice(0, 255);
  const infPedReg = [
    `<infPedReg xmlns="${nfseNs}" Id="${pedId}">`,
    `<tpAmb>${draft.environment === 'production' ? '1' : '2'}</tpAmb>`,
    '<verAplic>ERP360</verAplic>',
    `<dhEvento>${emittedAt}</dhEvento>`,
    `<CNPJAutor>${draft.cnpj}</CNPJAutor>`,
    `<chNFSe>${draft.accessKey}</chNFSe>`,
    `<${nfseCancelEventType}>`,
    '<xDesc>Cancelamento de NFS-e</xDesc>',
    `<cMotivo>${draft.reasonCode}</cMotivo>`,
    `<xMotivo>${escapeXml(reasonText)}</xMotivo>`,
    `</${nfseCancelEventType}>`,
    '</infPedReg>',
  ].join('');

  const digest = createHash('sha256').update(infPedReg).digest('base64');
  const signedInfoBody = [
    `<CanonicalizationMethod Algorithm="${excC14n}"></CanonicalizationMethod>`,
    `<SignatureMethod Algorithm="${rsaSha256}"></SignatureMethod>`,
    `<Reference URI="#${pedId}">`,
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
    `<pedRegEvento xmlns="${nfseNs}" versao="1.00">`,
    infPedReg,
    `<Signature xmlns="${xmldsig}">`,
    `<SignedInfo>${signedInfoBody}</SignedInfo>`,
    `<SignatureValue>${signature}</SignatureValue>`,
    '<KeyInfo><X509Data>',
    `<X509Certificate>${certificateBody(draft.certificatePem)}</X509Certificate>`,
    '</X509Data></KeyInfo>',
    '</Signature>',
    '</pedRegEvento>',
  ].join('');
  const pedidoRegistroEventoXmlGZipB64 = gzipSync(Buffer.from(xml, 'utf8')).toString('base64');
  return {
    pedId,
    sequence,
    xml,
    body: JSON.stringify({ pedidoRegistroEventoXmlGZipB64 }),
  };
}

export interface NfseEventSubmissionResult {
  outcome: 'accepted' | 'rejected' | 'unreachable';
  eventXml: string | null;
  message: string;
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
  const lines: string[] = [];
  const visit = (current: unknown) => {
    if (!current || typeof current !== 'object') return;
    if (Array.isArray(current)) {
      for (const item of current) visit(item);
      return;
    }
    for (const [key, item] of Object.entries(current)) {
      if (
        typeof item === 'string' &&
        ['Descricao', 'descricao', 'Mensagem', 'mensagem', 'message', 'xMotivo', 'motivo'].includes(
          key,
        )
      ) {
        const text = item.trim();
        if (text && !lines.includes(text)) lines.push(text);
      } else if (item && typeof item === 'object') {
        visit(item);
      }
    }
  };
  visit(parsed);
  return lines;
}

function eventXmlOf(encoded: unknown) {
  if (typeof encoded !== 'string' || !encoded) return null;
  try {
    const xml = gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8');
    if (!xml.startsWith('<') || xml.length > 500_000) return null;
    return xml;
  } catch {
    return null;
  }
}

export function readNfseEventSubmission(
  statusCode: number,
  body: string,
): NfseEventSubmissionResult {
  let parsed: unknown = null;
  try {
    parsed = body ? JSON.parse(body) : null;
  } catch {
    parsed = null;
  }
  const record = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  const eventXml =
    eventXmlOf(record.eventoXmlGZipB64) ??
    eventXmlOf(record.EventoXmlGZipB64) ??
    eventXmlOf(record.pedidoRegistroEventoXmlGZipB64);
  if ((statusCode === 200 || statusCode === 201) && (eventXml || !refusalLines(parsed).length)) {
    return {
      outcome: 'accepted',
      eventXml,
      message: '',
    };
  }
  const refused = refusalLines(parsed);
  if (refused.length > 0 || Array.isArray(record.erros) || Array.isArray(record.Erros)) {
    return {
      outcome: 'rejected',
      eventXml: null,
      message: refused.join(' ').slice(0, 2000).trim() || 'O cancelamento da NFS-e foi recusado.',
    };
  }
  return {
    outcome: 'unreachable',
    eventXml: null,
    message: '',
  };
}
