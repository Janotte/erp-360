import assert from 'node:assert/strict';
import { X509Certificate } from 'node:crypto';
import { describe, it } from 'node:test';
import tls from 'node:tls';

import {
  interpretSefaz,
  sefazStatusRequest,
  sefazStatusUrl,
  stateAbbreviationFromSubject,
  stateCode,
} from '../src/modules/certificates/sefaz.ts';
import { trustedCertificates } from '../src/modules/certificates/trust.ts';

describe('conexão do certificado', () => {
  it('escolhe o autorizador da UF e o ambiente do certificado', () => {
    assert.equal(
      sefazStatusUrl('SP', 'production'),
      'https://nfe.fazenda.sp.gov.br/ws/nfestatusservico4.asmx',
    );
    assert.equal(
      sefazStatusUrl('sc', 'homologation'),
      'https://nfe-homologacao.svrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx',
    );
    assert.equal(
      sefazStatusUrl('MA', 'production'),
      'https://www.sefazvirtual.fazenda.gov.br/NFeStatusServico4/NFeStatusServico4.asmx',
    );
    assert.equal(sefazStatusUrl('XX', 'production'), null);
    assert.equal(stateCode('SP'), '35');
    assert.equal(stateCode('sc'), '42');
  });

  it('monta SOAP 1.1 no ASMX e SOAP 1.2 nos demais', () => {
    const asmx = sefazStatusRequest({
      endpoint: 'https://nfe.fazenda.sp.gov.br/ws/nfestatusservico4.asmx',
      cUF: '35',
      environment: 'production',
    });
    assert.match(asmx.body, /<soap:Envelope/);
    assert.match(asmx.body, /<cUF>35<\/cUF>/);
    assert.match(asmx.body, /<tpAmb>1<\/tpAmb>/);
    assert.match(asmx.body, /<versaoDados>4.00<\/versaoDados>/);
    assert.equal(asmx.headers['Content-Type'], 'text/xml; charset=utf-8');

    const java = sefazStatusRequest({
      endpoint: 'https://nfe.fazenda.mg.gov.br/nfe2/services/NFeStatusServico4',
      cUF: '31',
      environment: 'homologation',
    });
    assert.match(java.body, /<soap12:Envelope/);
    assert.doesNotMatch(java.body, /nfeCabecMsg/);
    assert.match(java.body, /<tpAmb>2<\/tpAmb>/);
    assert.match(java.headers['Content-Type'], /application\/soap\+xml/);
  });

  it('considera sucesso só o cStat 107', () => {
    const available = interpretSefaz(
      200,
      '<retConsStatServ><cStat>107</cStat><xMotivo>Servico em Operacao</xMotivo></retConsStatServ>',
    );
    assert.equal(available.ok, true);
    assert.equal(available.statusMessage, 'Servico em Operacao');
    assert.equal(available.error, null);

    const rejected = interpretSefaz(
      200,
      '<cStat>215</cStat><xMotivo>Falha no schema</xMotivo>',
    );
    assert.equal(rejected.ok, false);
    assert.match(rejected.error ?? '', /cStat 215/);
    assert.equal(interpretSefaz(500, '<cStat>107</cStat>').ok, false);
  });

  it('confia na Raiz Brasileira v10 e na intermediária do e-CAC', () => {
    const certificates = trustedCertificates().map((pem) => new X509Certificate(pem));
    const root = certificates.find((certificate) =>
      certificate.subject.includes('CN=Autoridade Certificadora Raiz Brasileira v10'),
    );
    const intermediate = certificates.find((certificate) =>
      certificate.subject.includes('CN=AC SERPRO AR46 OV TLS CA 2025'),
    );
    const globalSign = certificates.find((certificate) =>
      certificate.subject.includes('CN=GlobalSign Root R46'),
    );

    assert.ok(root);
    assert.equal(
      root.fingerprint256.replaceAll(':', ''),
      '6E0BFF069A26994C15DE2C4888CC54AF84882E5495B7FBF66BE9CCFFEC7489F6',
    );
    assert.equal(root.verify(root.publicKey), true);
    assert.ok(intermediate);
    assert.ok(globalSign);
    assert.equal(intermediate.verify(globalSign.publicKey), true);
    assert.equal(trustedCertificates().length, tls.rootCertificates.length + 2);
  });

  it('lê a UF no subject do certificado', () => {
    assert.equal(stateAbbreviationFromSubject('CN=EMPRESA\nST=SC\nO=ICP-Brasil'), 'SC');
    assert.equal(stateAbbreviationFromSubject('CN=EMPRESA, ST=sp, O=ICP-Brasil'), 'SP');
    assert.equal(stateAbbreviationFromSubject('CN=EMPRESA'), null);
  });
});
