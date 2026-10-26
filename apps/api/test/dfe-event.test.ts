import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { describe, it } from 'node:test';

import forge from 'node-forge';

import {
  awarenessEventRequest,
  nfeEventTimestamp,
  parseAwarenessEvent,
  recipientEventRequest,
  recipientManifestDocument,
} from '../src/modules/inbound/dfe-event.ts';

const key = '42261018371298000101550010000021161300002070';

function material() {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const certificate = forge.pki.createCertificate();
  certificate.publicKey = forge.pki.publicKeyFromPem(
    pair.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  );
  certificate.serialNumber = '01';
  certificate.validity.notBefore = new Date('2026-01-01T00:00:00Z');
  certificate.validity.notAfter = new Date('2027-01-01T00:00:00Z');
  const attrs = [{ name: 'commonName', value: 'ERP 360' }];
  certificate.setSubject(attrs);
  certificate.setIssuer(attrs);
  certificate.sign(
    forge.pki.privateKeyFromPem(
      pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    ),
    forge.md.sha256.create(),
  );
  return {
    privateKeyPem: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    certificatePem: forge.pki.certificateToPem(certificate),
  };
}

describe('ciência da operação', () => {
  it('assina o evento 210210 para o Ambiente Nacional', () => {
    const keys = material();
    const request = awarenessEventRequest({
      environment: 'homologation',
      cnpj: '18371298000101',
      accessKey: key,
      at: nfeEventTimestamp(new Date('2026-10-26T17:00:00.000Z')),
      privateKeyPem: keys.privateKeyPem,
      certificatePem: keys.certificatePem,
    });
    assert.equal(
      request.endpoint,
      'https://hom1.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx',
    );
    assert.match(request.body, /<cOrgao>91<\/cOrgao>/);
    assert.match(request.body, /<tpAmb>2<\/tpAmb>/);
    assert.match(request.body, /<tpEvento>210210<\/tpEvento>/);
    assert.match(request.body, /<descEvento>Ciencia da Operacao<\/descEvento>/);
    assert.match(request.body, new RegExp(`Id="ID210210${key}01"`));
    assert.match(
      request.body,
      /<Signature xmlns="http:\/\/www.w3.org\/2000\/09\/xmldsig#">/,
    );
    assert.equal(request.headers['Content-Type']?.includes('application/soap+xml'), true);
  });

  it('aceita o evento registrado e a duplicidade', () => {
    assert.deepEqual(
      parseAwarenessEvent(
        '<retEnvEvento><cStat>128</cStat><retEvento><infEvento><cStat>135</cStat><xMotivo>Evento registrado</xMotivo></infEvento></retEvento></retEnvEvento>',
      ),
      { accepted: true, status: '135', reason: 'Evento registrado' },
    );
    assert.equal(
      parseAwarenessEvent(
        '<retEnvEvento><cStat>128</cStat><retEvento><infEvento><cStat>573</cStat><xMotivo>Duplicidade</xMotivo></infEvento></retEvento></retEnvEvento>',
      ).accepted,
      true,
    );
    const refused = parseAwarenessEvent(
      '<retEnvEvento><cStat>128</cStat><retEvento><infEvento><cStat>999</cStat><xMotivo>Rejeicao</xMotivo></infEvento></retEvento></retEnvEvento>',
    );
    assert.equal(refused.accepted, false);
    assert.equal(refused.reason, 'Rejeicao');
  });

  it('assina confirmação, desconhecimento e operação não realizada', () => {
    const keys = material();
    const base = {
      environment: 'production' as const,
      cnpj: '18371298000101',
      accessKey: key,
      at: '2026-10-26T14:00:00-03:00',
      privateKeyPem: keys.privateKeyPem,
      certificatePem: keys.certificatePem,
    };
    const confirmed = recipientEventRequest({ ...base, kind: 'confirmed' });
    assert.match(confirmed.body, /<tpEvento>210200<\/tpEvento>/);
    assert.match(confirmed.body, /<descEvento>Confirmacao da Operacao<\/descEvento>/);
    assert.equal(confirmed.body.includes('<xJust>'), false);
    assert.equal(confirmed.endpoint.includes('www1.nfe.fazenda.gov.br'), true);
    const unaware = recipientEventRequest({ ...base, kind: 'unaware' });
    assert.match(unaware.body, /<tpEvento>210220<\/tpEvento>/);
    assert.match(unaware.body, new RegExp(`Id="ID210220${key}01"`));
    assert.throws(
      () =>
        recipientEventRequest({ ...base, kind: 'not_performed', justification: 'curta' }),
      /justificativa/,
    );
    const skipped = recipientEventRequest({
      ...base,
      kind: 'not_performed',
      justification: 'Mercadoria não entregue & recusada',
    });
    assert.match(skipped.body, /<tpEvento>210240<\/tpEvento>/);
    assert.match(skipped.body, /<descEvento>Operacao nao Realizada<\/descEvento>/);
    assert.match(skipped.body, /<xJust>Mercadoria não entregue &amp; recusada<\/xJust>/);
  });

  it('guarda o evento assinado junto com o retorno da SEFAZ', () => {
    const request = `<envEvento><evento versao="1.00"><infEvento><tpEvento>210210</tpEvento></infEvento></evento></envEvento>`;
    const response =
      '<retEnvEvento><retEvento versao="1.00"><infEvento><cStat>135</cStat><nProt>999</nProt></infEvento></retEvento></retEnvEvento>';
    const xml = recipientManifestDocument(request, response);
    assert.match(xml, /^<procEventoNFe /);
    assert.match(xml, /<tpEvento>210210<\/tpEvento>/);
    assert.match(xml, /<nProt>999<\/nProt>/);
  });
});
