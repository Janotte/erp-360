import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { describe, it } from 'node:test';
import { gunzipSync, gzipSync } from 'node:zlib';

import {
  buildSignedCancelEvent,
  nfseCancelEventType,
  nfseEventEndpoint,
  nfsePedRegEventId,
  readNfseEventSubmission,
} from '../src/modules/nfse/event.ts';

const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const privateKeyPem = keys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const certificatePem = '-----BEGIN CERTIFICATE-----\nVEVTVA==\n-----END CERTIFICATE-----';
const accessKey = '7'.repeat(50);

describe('evento de cancelamento da NFS-e', () => {
  it('monta o pedRegEvento e101101 assinado', () => {
    const signed = buildSignedCancelEvent({
      environment: 'homologation',
      accessKey,
      cnpj: '11222333000181',
      reasonCode: '1',
      reasonText: 'Erro de digitacao no valor do servico',
      emittedAt: '2026-11-27T12:00:00-03:00',
      privateKeyPem,
      certificatePem,
    });

    assert.equal(signed.pedId, nfsePedRegEventId(accessKey, 1));
    assert.match(signed.pedId, /^PRE[0-9]{50}101001$/);
    assert.match(signed.xml, new RegExp(`<${nfseCancelEventType}>`));
    assert.match(signed.xml, /<xDesc>Cancelamento de NFS-e<\/xDesc>/);
    assert.match(signed.xml, /<cMotivo>1<\/cMotivo>/);
    assert.match(signed.xml, /<tpAmb>2<\/tpAmb>/);
    assert.match(signed.xml, new RegExp(`<chNFSe>${accessKey}<\\/chNFSe>`));
    assert.match(signed.xml, /<SignatureValue>[A-Za-z0-9+/=]+<\/SignatureValue>/);

    const payload = JSON.parse(signed.body) as { pedidoRegistroEventoXmlGZipB64: string };
    const xml = gunzipSync(Buffer.from(payload.pedidoRegistroEventoXmlGZipB64, 'base64')).toString(
      'utf8',
    );
    assert.equal(xml, signed.xml);
  });

  it('monta o endpoint de eventos no ambiente do pedido', () => {
    assert.equal(
      nfseEventEndpoint('homologation', accessKey),
      `https://sefin.producaorestrita.nfse.gov.br/SefinNacional/nfse/${accessKey}/eventos`,
    );
    assert.equal(
      nfseEventEndpoint('production', accessKey),
      `https://sefin.nfse.gov.br/SefinNacional/nfse/${accessKey}/eventos`,
    );
  });

  it('lê aceitação e recusa do SEFIN', () => {
    const ok = readNfseEventSubmission(
      201,
      JSON.stringify({
        eventoXmlGZipB64: gzipSync(Buffer.from('<evento>ok</evento>')).toString('base64'),
      }),
    );
    assert.equal(ok.outcome, 'accepted');
    assert.match(ok.eventXml ?? '', /<evento>ok<\/evento>/);

    const refused = readNfseEventSubmission(
      400,
      JSON.stringify({
        erros: [{ Codigo: 'E0822', Descricao: 'Fora do prazo do municipio.' }],
      }),
    );
    assert.equal(refused.outcome, 'rejected');
    assert.match(refused.message, /E0822/);
  });
});
