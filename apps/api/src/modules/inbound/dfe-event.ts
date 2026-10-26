import { createHash, createSign } from 'node:crypto';

import type { CertificateEnvironment } from '@erp-360/shared';

const portal = 'http://www.portalfiscal.inf.br/nfe';
const service = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4';
const xmldsig = 'http://www.w3.org/2000/09/xmldsig#';
const c14n = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
const rsaSha1 = `${xmldsig}rsa-sha1`;
const sha1Alg = `${xmldsig}sha1`;
const enveloped = `${xmldsig}enveloped-signature`;

const urls = {
  production:
    'https://www1.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx',
  homologation:
    'https://hom1.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx',
} as const;

const unread = 'A resposta da ciência da operação não pôde ser lida.';
const acceptedStatus = new Set(['135', '136', '573']);

export interface AwarenessEventResult {
  accepted: boolean;
  status: string;
  reason: string;
}

export function nfeEventTimestamp(now: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
  const date = `${pick('year')}-${pick('month')}-${pick('day')}`;
  const time = `${pick('hour')}:${pick('minute')}:${pick('second')}`;
  return `${date}T${time}-03:00`;
}

function compactXml(value: string) {
  return value.replace(/>\s+</g, '><').trim();
}

function x509Certificate(pem: string) {
  const block = pem.match(
    /-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/,
  );
  if (!block) throw new Error('O certificado da ciência da operação é inválido.');
  return block[1].replace(/\s/g, '');
}

function tagValue(xml: string, name: string) {
  return xml.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1]?.trim() ?? '';
}

export const recipientManifestKinds = [
  'aware',
  'confirmed',
  'unaware',
  'not_performed',
] as const;

export type RecipientManifestKind = (typeof recipientManifestKinds)[number];

const recipientManifestSpec = {
  aware: { code: '210210', description: 'Ciencia da Operacao' },
  confirmed: { code: '210200', description: 'Confirmacao da Operacao' },
  unaware: { code: '210220', description: 'Desconhecimento da Operacao' },
  not_performed: { code: '210240', description: 'Operacao nao Realizada' },
} as const;

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

/** Manifestação do destinatário no Ambiente Nacional. O serviço exige SOAP 1.2. */
export function recipientEventRequest(input: {
  environment: CertificateEnvironment;
  cnpj: string;
  accessKey: string;
  at: string;
  kind: RecipientManifestKind;
  justification?: string;
  privateKeyPem: string;
  certificatePem: string;
}) {
  const spec = recipientManifestSpec[input.kind];
  const justification =
    input.kind === 'not_performed' ? (input.justification ?? '').trim() : '';
  if (
    input.kind === 'not_performed' &&
    (justification.length < 15 || justification.length > 255)
  ) {
    throw new Error(
      'A justificativa da operação não realizada precisa ter entre 15 e 255 caracteres.',
    );
  }
  const tpAmb = input.environment === 'production' ? '1' : '2';
  const eventId = `ID${spec.code}${input.accessKey}01`;
  const detail = [
    '<detEvento versao="1.00">',
    `<descEvento>${spec.description}</descEvento>`,
    ...(justification ? [`<xJust>${escapeXml(justification)}</xJust>`] : []),
    '</detEvento>',
  ].join('');
  const infEvento = [
    `<infEvento xmlns="${portal}" Id="${eventId}">`,
    '<cOrgao>91</cOrgao>',
    `<tpAmb>${tpAmb}</tpAmb>`,
    `<CNPJ>${input.cnpj}</CNPJ>`,
    `<chNFe>${input.accessKey}</chNFe>`,
    `<dhEvento>${input.at}</dhEvento>`,
    `<tpEvento>${spec.code}</tpEvento>`,
    '<nSeqEvento>1</nSeqEvento>',
    '<verEvento>1.00</verEvento>',
    detail,
    '</infEvento>',
  ].join('');
  const digest = createHash('sha1').update(infEvento).digest('base64');
  const signedInfoBody = [
    `<CanonicalizationMethod Algorithm="${c14n}"></CanonicalizationMethod>`,
    `<SignatureMethod Algorithm="${rsaSha1}"></SignatureMethod>`,
    `<Reference URI="#${eventId}">`,
    '<Transforms>',
    `<Transform Algorithm="${enveloped}"></Transform>`,
    `<Transform Algorithm="${c14n}"></Transform>`,
    '</Transforms>',
    `<DigestMethod Algorithm="${sha1Alg}"></DigestMethod>`,
    `<DigestValue>${digest}</DigestValue>`,
    '</Reference>',
  ].join('');
  const signedInfo = `<SignedInfo xmlns="${xmldsig}">${signedInfoBody}</SignedInfo>`;
  const signature = createSign('RSA-SHA1')
    .update(signedInfo, 'utf8')
    .sign(input.privateKeyPem, 'base64');
  const signatureXml = [
    `<Signature xmlns="${xmldsig}">`,
    `<SignedInfo>${signedInfoBody}</SignedInfo>`,
    `<SignatureValue>${signature}</SignatureValue>`,
    '<KeyInfo><X509Data>',
    `<X509Certificate>${x509Certificate(input.certificatePem)}</X509Certificate>`,
    '</X509Data></KeyInfo>',
    '</Signature>',
  ].join('');
  const envEvento = [
    `<envEvento xmlns="${portal}" versao="1.00">`,
    '<idLote>1</idLote>',
    `<evento versao="1.00">${infEvento}${signatureXml}</evento>`,
    '</envEvento>',
  ].join('');
  const body = compactXml(`<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <nfeDadosMsg xmlns="${service}">${envEvento}</nfeDadosMsg>
  </soap12:Body>
</soap12:Envelope>`);

  return {
    endpoint: urls[input.environment],
    body,
    headers: {
      'Content-Type': `application/soap+xml; charset=utf-8; action="${service}/nfeRecepcaoEvento"`,
    },
  };
}

export function awarenessEventRequest(
  input: Omit<Parameters<typeof recipientEventRequest>[0], 'kind' | 'justification'>,
) {
  return recipientEventRequest({ ...input, kind: 'aware' });
}

/** Junta o evento assinado com o retorno da SEFAZ para guardar o procEventoNFe. */
export function recipientManifestDocument(requestBody: string, responseBody: string) {
  const evento = requestBody.match(/<evento\b[^>]*>[\s\S]*?<\/evento>/)?.[0] ?? '';
  const retEvento =
    responseBody.match(/<retEvento\b[^>]*>[\s\S]*?<\/retEvento>/)?.[0] ?? '';
  if (evento && retEvento) {
    return `<procEventoNFe xmlns="${portal}" versao="1.00">${evento}${retEvento}</procEventoNFe>`;
  }
  return evento || responseBody;
}

export function parseAwarenessEvent(body: string): AwarenessEventResult {
  const infEvento = body.match(/<infEvento\b[^>]*>([\s\S]*?)<\/infEvento>/);
  if (!infEvento) return { accepted: false, status: '', reason: unread };
  const status = tagValue(infEvento[1], 'cStat');
  const reason = tagValue(infEvento[1], 'xMotivo');
  if (!status) return { accepted: false, status: '', reason: unread };
  return { accepted: acceptedStatus.has(status), status, reason };
}
