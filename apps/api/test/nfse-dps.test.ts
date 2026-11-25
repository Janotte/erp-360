import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { describe, it } from 'node:test';

import { buildSignedDps, nfseDpsId, nfseSubmissionEndpoint, readNfseSubmission } from '../src/modules/nfse/dps.ts';

const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const privateKeyPem = keys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const certificatePem = '-----BEGIN CERTIFICATE-----\nVEVTVA==\n-----END CERTIFICATE-----';

describe('DPS da NFS-e nacional', () => {
  it('monta a declaração de homologação com série de aplicativo', () => {
    const signed = buildSignedDps({
      environment: 'homologation',
      emittedAt: '2026-11-24T21:00:00-03:00',
      series: '49001',
      dpsNumber: 1,
      cityCode: '3550308',
      cnpj: '11222333000181',
      municipalRegistration: null,
      simplesNacional: '1',
      simplesAssessment: null,
      specialTaxRegime: '0',
      issqnTaxation: '1',
      tomador: { kind: 'cpf', taxId: '52998224725', name: 'CLIENTE' },
      nationalServiceCode: '010701',
      municipalServiceCode: '001',
      description: 'SUPORTE MENSAL',
      issRate: '2.00',
      serviceAmountCents: 1000,
      privateKeyPem,
      certificatePem,
    });

    assert.equal(
      signed.dpsId,
      nfseDpsId({
        cityCode: '3550308',
        cnpj: '11222333000181',
        series: '49001',
        dpsNumber: 1,
      }),
    );
    assert.match(signed.dpsId, /^DPS[0-9]{42}$/);
    assert.match(signed.xml, /<tpAmb>2<\/tpAmb>/);
    assert.match(signed.xml, /<serie>49001<\/serie>/);
    assert.match(signed.xml, /<nDPS>1<\/nDPS>/);
    assert.match(signed.xml, /<pAliq>2.00<\/pAliq><tpRetISSQN>1<\/tpRetISSQN>/);
    assert.match(signed.xml, /rsa-sha256/);
    assert.match(signed.xml, /xmlenc#sha256/);
    assert.doesNotMatch(signed.xml, /sefin\.nfse\.gov\.br/);
    assert.match(signed.body, /"dpsXmlGZipB64":/);
  });

  it('aponta homologação para a produção restrita', () => {
    assert.match(nfseSubmissionEndpoint('homologation'), /sefin\.producaorestrita\.nfse\.gov\.br/);
    assert.equal(
      nfseSubmissionEndpoint('production'),
      'https://sefin.nfse.gov.br/SefinNacional/nfse',
    );
  });

  it('lê a chave autorizada e a recusa', () => {
    const authorized = readNfseSubmission(
      201,
      JSON.stringify({ chaveAcesso: '3'.repeat(50) }),
    );
    assert.equal(authorized.outcome, 'authorized');
    assert.equal(authorized.accessKey, '3'.repeat(50));

    const rejected = readNfseSubmission(
      400,
      JSON.stringify({
        erros: [{ Codigo: 'E0010', Descricao: 'Série inválida.', Complemento: 'Use 00001.' }],
      }),
    );
    assert.equal(rejected.outcome, 'rejected');
    assert.match(rejected.message, /E0010/);
    assert.match(rejected.message, /Série inválida/);
    assert.match(rejected.message, /Use 00001/);

    const blocked = readNfseSubmission(403, '<html><h2>403 - Forbidden</h2></html>');
    assert.equal(blocked.outcome, 'unreachable');
    assert.equal(blocked.message, '');
  });
});
