import { X509Certificate } from 'node:crypto';

import type { CertificateEnvironment } from '@erp-360/shared';

const wsNs = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4';

const statusUrls = {
  AM: {
    production: 'https://nfe.sefaz.am.gov.br/services2/services/NfeStatusServico4',
    homologation: 'https://homnfe.sefaz.am.gov.br/services2/services/NfeStatusServico4',
  },
  BA: {
    production: 'https://nfe.sefaz.ba.gov.br/webservices/NFeStatusServico4/NFeStatusServico4.asmx',
    homologation: 'https://hnfe.sefaz.ba.gov.br/webservices/NFeStatusServico4/NFeStatusServico4.asmx',
  },
  GO: {
    production: 'https://nfe.sefaz.go.gov.br/nfe/services/NFeStatusServico4',
    homologation: 'https://homolog.sefaz.go.gov.br/nfe/services/NFeStatusServico4',
  },
  MG: {
    production: 'https://nfe.fazenda.mg.gov.br/nfe2/services/NFeStatusServico4',
    homologation: 'https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeStatusServico4',
  },
  MS: {
    production: 'https://nfe.sefaz.ms.gov.br/ws/NFeStatusServico4',
    homologation: 'https://hom.nfe.sefaz.ms.gov.br/ws/NFeStatusServico4',
  },
  MT: {
    production: 'https://nfe.sefaz.mt.gov.br/nfews/v2/services/NfeStatusServico4',
    homologation: 'https://homologacao.sefaz.mt.gov.br/nfews/v2/services/NfeStatusServico4',
  },
  PE: {
    production: 'https://nfe.sefaz.pe.gov.br/nfe-service/services/NFeStatusServico4',
    homologation: 'https://nfehomolog.sefaz.pe.gov.br/nfe-service/services/NFeStatusServico4',
  },
  PR: {
    production: 'https://nfe.sefa.pr.gov.br/nfe/NFeStatusServico4',
    homologation: 'https://homologacao.nfe.sefa.pr.gov.br/nfe/NFeStatusServico4',
  },
  RS: {
    production: 'https://nfe.sefazrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx',
    homologation:
      'https://nfe-homologacao.sefazrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx',
  },
  SP: {
    production: 'https://nfe.fazenda.sp.gov.br/ws/nfestatusservico4.asmx',
    homologation: 'https://homologacao.nfe.fazenda.sp.gov.br/ws/nfestatusservico4.asmx',
  },
  SVRS: {
    production: 'https://nfe.svrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx',
    homologation: 'https://nfe-homologacao.svrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx',
  },
  SVAN: {
    production: 'https://www.sefazvirtual.fazenda.gov.br/NFeStatusServico4/NFeStatusServico4.asmx',
    homologation: 'https://hom.sefazvirtual.fazenda.gov.br/NFeStatusServico4/NFeStatusServico4.asmx',
  },
} as const;

const authorizerByUf: Record<string, keyof typeof statusUrls> = {
  AC: 'SVRS',
  AL: 'SVRS',
  AM: 'AM',
  AP: 'SVRS',
  BA: 'BA',
  CE: 'SVRS',
  DF: 'SVRS',
  ES: 'SVRS',
  GO: 'GO',
  MA: 'SVAN',
  MG: 'MG',
  MS: 'MS',
  MT: 'MT',
  PA: 'SVRS',
  PB: 'SVRS',
  PE: 'PE',
  PI: 'SVRS',
  PR: 'PR',
  RJ: 'SVRS',
  RN: 'SVRS',
  RO: 'SVRS',
  RR: 'SVRS',
  RS: 'RS',
  SC: 'SVRS',
  SE: 'SVRS',
  SP: 'SP',
  TO: 'SVRS',
};

const ibgeByUf: Record<string, string> = {
  AC: '12',
  AL: '27',
  AM: '13',
  AP: '16',
  BA: '29',
  CE: '23',
  DF: '53',
  ES: '32',
  GO: '52',
  MA: '21',
  MG: '31',
  MS: '50',
  MT: '51',
  PA: '15',
  PB: '25',
  PE: '26',
  PI: '22',
  PR: '41',
  RJ: '33',
  RN: '24',
  RO: '11',
  RR: '14',
  RS: '43',
  SC: '42',
  SE: '28',
  SP: '35',
  TO: '17',
};

export const ecacUrl = 'https://cav.receita.fazenda.gov.br/autenticacao/login';
export const connectionTimeoutMs = 20_000;

export function stateCode(abbreviation: string | null | undefined) {
  if (!abbreviation) return null;
  return ibgeByUf[abbreviation.trim().toUpperCase()] ?? null;
}

export function sefazStatusUrl(abbreviation: string, environment: CertificateEnvironment) {
  const authorizer = authorizerByUf[abbreviation.trim().toUpperCase()];
  if (!authorizer) return null;
  return statusUrls[authorizer][environment];
}

export function stateAbbreviationFromSubject(subject: string) {
  const match = subject.match(/(?:^|[,\n]\s*)ST=([A-Za-z]{2})(?=[,\n]|$)/);
  return match?.[1]?.toUpperCase() ?? null;
}

export function subjectStateAbbreviation(certificatePem: string) {
  const first = certificatePem.match(
    /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/,
  );
  if (!first) return null;
  try {
    return stateAbbreviationFromSubject(new X509Certificate(first[0]).subject);
  } catch {
    return null;
  }
}

function compactXml(value: string) {
  return value.replace(/>\s+</g, '><').trim();
}

export function sefazStatusRequest(input: {
  endpoint: string;
  cUF: string;
  environment: CertificateEnvironment;
}) {
  const cUF = input.cUF;
  const tpAmb = input.environment === 'production' ? '1' : '2';
  if (!/^\d{2}$/.test(cUF)) {
    throw new Error('UF inválida para a consulta de status.');
  }

  const consStatServ = `<consStatServ xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><tpAmb>${tpAmb}</tpAmb><cUF>${cUF}</cUF><xServ>STATUS</xServ></consStatServ>`;
  const soap11 = input.endpoint.toLowerCase().endsWith('.asmx');
  const body = soap11
    ? compactXml(`<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Header>
    <nfeCabecMsg xmlns="${wsNs}">
      <cUF>${cUF}</cUF>
      <versaoDados>4.00</versaoDados>
    </nfeCabecMsg>
  </soap:Header>
  <soap:Body>
    <nfeDadosMsg xmlns="${wsNs}">${consStatServ}</nfeDadosMsg>
  </soap:Body>
</soap:Envelope>`)
    : compactXml(`<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <nfeDadosMsg xmlns="${wsNs}">${consStatServ}</nfeDadosMsg>
  </soap12:Body>
</soap12:Envelope>`);

  return {
    body,
    headers: soap11
      ? { 'Content-Type': 'text/xml; charset=utf-8' }
      : {
          'Content-Type': `application/soap+xml; charset=utf-8; action="${wsNs}/nfeStatusServicoNF"`,
        },
  };
}

function xmlText(xml: string, tag: string) {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i'));
  if (!match?.[1]) return null;
  return match[1]
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .trim()
    .slice(0, 180);
}

export function interpretSefaz(statusCode: number | null, body: string) {
  const cStat = xmlText(body, 'cStat');
  const xMotivo = xmlText(body, 'xMotivo');
  const available = cStat === '107';
  const httpOk = statusCode !== null && statusCode < 500;
  const ok = httpOk && available;
  return {
    ok,
    statusCode,
    statusMessage: xMotivo,
    error: ok
      ? null
      : cStat
        ? `A SEFAZ recusou o teste (cStat ${cStat}${xMotivo ? `: ${xMotivo}` : ''}).`
        : 'Falha no teste com a SEFAZ.',
  };
}
