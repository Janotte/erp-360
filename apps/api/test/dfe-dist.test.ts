import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { gzipSync } from 'node:zlib';

import {
  describeDfeDocument,
  dfeDistributionRequest,
  dfeDistributionUrl,
  parseDfeDistribution,
} from '../src/modules/inbound/dfe.ts';

const cnpj = '18371298000101';

describe('resumo do documento de DF-e', () => {
  it('lê o nome, o valor e o tipo do evento', () => {
    assert.deepEqual(
      describeDfeDocument(
        '<resNFe><xNome>Fornecedor</xNome><vNF>1358.10</vNF></resNFe>',
      ),
      { partyName: 'Fornecedor', amount: 135810, eventType: null },
    );
    assert.equal(
      describeDfeDocument('<procEventoNFe><tpEvento>210210</tpEvento></procEventoNFe>')
        .eventType,
      '210210',
    );
  });
});

describe('pedido da distribuição de DF-e', () => {
  it('monta a consulta pelo último NSU em SOAP 1.2', () => {
    assert.equal(
      dfeDistributionUrl('production'),
      'https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx',
    );
    assert.equal(
      dfeDistributionUrl('homologation'),
      'https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx',
    );

    const request = dfeDistributionRequest({
      cUF: '42',
      cnpj,
      environment: 'production',
      query: { kind: 'lastNsu', ultNsu: '000000000000000' },
    });

    assert.equal(request.endpoint, dfeDistributionUrl('production'));
    assert.match(request.body, /<soap12:Envelope/);
    assert.match(request.body, /<distDFeInt [^>]*versao="1.01"/);
    assert.match(request.body, /<tpAmb>1<\/tpAmb>/);
    assert.match(request.body, /<cUFAutor>42<\/cUFAutor>/);
    assert.match(request.body, new RegExp(`<CNPJ>${cnpj}</CNPJ>`));
    assert.match(request.body, /<distNSU><ultNSU>000000000000000<\/ultNSU><\/distNSU>/);
    assert.doesNotMatch(request.body, /<consNSU>|<consChNFe>/);
    assert.match(
      request.headers['Content-Type'],
      /application\/soap\+xml; charset=utf-8; action="http:\/\/www\.portalfiscal\.inf\.br\/nfe\/wsdl\/NFeDistribuicaoDFe\/nfeDistDFeInteresse"/,
    );
  });

  it('consulta um NSU ou a chave, em homologação', () => {
    const byNsu = dfeDistributionRequest({
      cUF: '35',
      cnpj,
      environment: 'homologation',
      query: { kind: 'nsu', nsu: '000000000000123' },
    });
    assert.match(byNsu.body, /<tpAmb>2<\/tpAmb>/);
    assert.match(byNsu.body, /<consNSU><NSU>000000000000123<\/NSU><\/consNSU>/);
    assert.doesNotMatch(byNsu.body, /<distNSU>|<consChNFe>/);

    const key = '42261018371298000101550010000021161300002070';
    const byKey = dfeDistributionRequest({
      cUF: '42',
      cnpj,
      environment: 'production',
      query: { kind: 'accessKey', accessKey: key },
    });
    assert.match(byKey.body, new RegExp(`<consChNFe><chNFe>${key}</chNFe></consChNFe>`));
    assert.doesNotMatch(byKey.body, /<distNSU>|<consNSU>/);
  });

  it('recusa UF, CNPJ, NSU ou chave fora do formato', () => {
    const base = {
      cUF: '42',
      cnpj,
      environment: 'production' as const,
      query: { kind: 'lastNsu' as const, ultNsu: '000000000000000' },
    };
    assert.throws(() => dfeDistributionRequest({ ...base, cUF: 'SC' }), /UF/);
    assert.throws(
      () => dfeDistributionRequest({ ...base, cnpj: '1837129800010' }),
      /CNPJ/,
    );
    assert.throws(
      () => dfeDistributionRequest({ ...base, query: { kind: 'nsu', nsu: '123' } }),
      /NSU/,
    );
    assert.throws(
      () =>
        dfeDistributionRequest({
          ...base,
          query: { kind: 'accessKey', accessKey: '4226' },
        }),
      /chave/,
    );
  });
});

const accessKey = '42261018371298000101550010000021161300002070';

function zip(xml: string) {
  return gzipSync(Buffer.from(xml, 'utf8')).toString('base64');
}

function soap(inner: string) {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <nfeDistDFeInteresseResponse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
      <nfeDistDFeInteresseResult>${inner}</nfeDistDFeInteresseResult>
    </nfeDistDFeInteresseResponse>
  </soap12:Body>
</soap12:Envelope>`;
}

describe('resposta da distribuição de DF-e', () => {
  it('separa resumo, XML completo e evento', () => {
    const summary = `<resNFe xmlns="http://www.portalfiscal.inf.br/nfe"><chNFe>${accessKey}</chNFe><xNome>Fornecedor</xNome></resNFe>`;
    const nfe = `<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe><infNFe Id="NFe${accessKey}"></infNFe></NFe></nfeProc>`;
    const eventSummary = `<resEvento xmlns="http://www.portalfiscal.inf.br/nfe"><chNFe>${accessKey}</chNFe><tpEvento>110111</tpEvento></resEvento>`;
    const event = `<procEventoNFe xmlns="http://www.portalfiscal.inf.br/nfe"><evento><infEvento><chNFe>${accessKey}</chNFe><tpEvento>210210</tpEvento></infEvento></evento></procEventoNFe>`;
    const body =
      soap(`<retDistDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">
      <tpAmb>1</tpAmb>
      <cStat>138</cStat>
      <xMotivo>Documento localizado</xMotivo>
      <dhResp>2026-10-26T12:00:00-03:00</dhResp>
      <ultNSU>000000000000126</ultNSU>
      <maxNSU>000000000000200</maxNSU>
      <loteDistDFeInt>
        <docZip NSU="000000000000123" schema="resNFe_v1.01.xsd">${zip(summary)}</docZip>
        <docZip NSU="000000000000124" schema="procNFe_v4.00.xsd">${zip(nfe)}</docZip>
        <docZip NSU="000000000000125" schema="resEvento_v1.01.xsd">${zip(eventSummary)}</docZip>
        <docZip NSU="000000000000126" schema="procEventoNFe_v1.00.xsd">${zip(event)}</docZip>
      </loteDistDFeInt>
    </retDistDFeInt>`);

    const parsed = parseDfeDistribution(body);
    assert.equal(parsed.cStat, '138');
    assert.equal(parsed.reason, 'Documento localizado');
    assert.equal(parsed.respondedAt, '2026-10-26T12:00:00-03:00');
    assert.equal(parsed.ultNsu, '000000000000126');
    assert.equal(parsed.maxNsu, '000000000000200');
    assert.deepEqual(
      parsed.documents.map((document) => ({
        nsu: document.nsu,
        schema: document.schema,
        kind: document.kind,
        accessKey: document.accessKey,
      })),
      [
        {
          nsu: '000000000000123',
          schema: 'resNFe_v1.01.xsd',
          kind: 'summary',
          accessKey,
        },
        { nsu: '000000000000124', schema: 'procNFe_v4.00.xsd', kind: 'nfe', accessKey },
        {
          nsu: '000000000000125',
          schema: 'resEvento_v1.01.xsd',
          kind: 'event_summary',
          accessKey,
        },
        {
          nsu: '000000000000126',
          schema: 'procEventoNFe_v1.00.xsd',
          kind: 'event',
          accessKey,
        },
      ],
    );
    assert.match(parsed.documents[0].xml, /<xNome>Fornecedor<\/xNome>/);
    assert.match(parsed.documents[3].xml, /<tpEvento>210210<\/tpEvento>/);
  });

  it('aceita lote vazio e o bloqueio por consumo indevido', () => {
    const empty = parseDfeDistribution(
      soap(
        `<retDistDFeInt versao="1.01"><tpAmb>2</tpAmb><cStat>137</cStat><xMotivo>Nenhum documento localizado</xMotivo><ultNSU>000000000000010</ultNSU><maxNSU>000000000000010</maxNSU></retDistDFeInt>`,
      ),
    );
    assert.equal(empty.cStat, '137');
    assert.deepEqual(empty.documents, []);
    assert.equal(empty.ultNsu, '000000000000010');

    const blocked = parseDfeDistribution(
      '<retDistDFeInt><cStat>656</cStat><xMotivo>Consumo indevido</xMotivo><ultNSU>000000000000010</ultNSU><maxNSU>000000000000010</maxNSU></retDistDFeInt>',
    );
    assert.equal(blocked.cStat, '656');
    assert.equal(blocked.reason, 'Consumo indevido');
    assert.deepEqual(blocked.documents, []);
  });

  it('recusa resposta sem retorno e documento que não descompacta', () => {
    assert.throws(
      () => parseDfeDistribution('<soap12:Body></soap12:Body>'),
      /não pôde ser lida/,
    );
    assert.throws(
      () =>
        parseDfeDistribution(
          soap(
            '<retDistDFeInt><cStat>138</cStat><xMotivo>Documento localizado</xMotivo><ultNSU>000000000000001</ultNSU><maxNSU>000000000000001</maxNSU><loteDistDFeInt><docZip NSU="000000000000001" schema="resNFe_v1.01.xsd">AAAA</docZip></loteDistDFeInt></retDistDFeInt>',
          ),
        ),
      /000000000000001/,
    );
  });
});
