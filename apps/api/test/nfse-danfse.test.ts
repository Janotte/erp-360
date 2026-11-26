import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { readDanfse } from '../src/modules/nfse/danfse.ts';

const accessKey = '35503082112223330001810000000120261126123456789012';

const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse">
  <infNFSe Id="NFS${accessKey}">
    <xLocEmi>São Paulo</xLocEmi>
    <nNFSe>1</nNFSe>
    <cStat>100</cStat>
    <dhProc>2026-11-26T12:00:00-03:00</dhProc>
    <nDFSe>1</nDFSe>
    <DPS>
      <infDPS Id="DPS355030821122233300018149001000000000000001">
        <tpAmb>2</tpAmb>
        <dhEmi>2026-11-26T11:58:00-03:00</dhEmi>
        <verAplic>ERP360</verAplic>
        <serie>49001</serie>
        <nDPS>1</nDPS>
        <dCompet>2026-11-26</dCompet>
        <cLocEmi>3550308</cLocEmi>
        <prest>
          <CNPJ>11222333000181</CNPJ>
          <xNome>PRESTADOR LTDA</xNome>
          <end>
            <endNac>
              <cMun>3550308</cMun>
              <CEP>01001000</CEP>
            </endNac>
            <xLgr>Rua A</xLgr>
            <nro>100</nro>
            <xBairro>Centro</xBairro>
          </end>
          <regTrib>
            <opSimpNac>3</opSimpNac>
            <regEspTrib>0</regEspTrib>
          </regTrib>
        </prest>
        <toma>
          <CPF>52998224725</CPF>
          <xNome>CLIENTE TESTE</xNome>
        </toma>
        <serv>
          <locPrest><cLocPrestacao>3550308</cLocPrestacao></locPrest>
          <cServ>
            <cTribNac>010701</cTribNac>
            <cTribMun>001</cTribMun>
            <xDescServ>SUPORTE MENSAL</xDescServ>
          </cServ>
        </serv>
        <valores>
          <vServPrest><vServ>10.00</vServ></vServPrest>
          <trib>
            <tribMun>
              <tribISSQN>1</tribISSQN>
              <pAliq>2.00</pAliq>
              <tpRetISSQN>1</tpRetISSQN>
            </tribMun>
            <totTrib><pTotTribSN>6.00</pTotTribSN></totTrib>
          </trib>
        </valores>
      </infDPS>
    </DPS>
    <valores>
      <vLiq>10.00</vLiq>
    </valores>
  </infNFSe>
</NFSe>`;

describe('DANFSe a partir do XML autorizado', () => {
  it('lê chave, prestador, tomador, serviço, totais e homologação', () => {
    const view = readDanfse(sampleXml);
    assert.ok(view);
    assert.equal(view.accessKey, accessKey);
    assert.equal(view.nfseNumber, '1');
    assert.equal(view.dpsNumber, '1');
    assert.equal(view.dpsSeries, '49001');
    assert.equal(view.competence, '2026-11-26');
    assert.equal(view.environment, 'homologation');
    assert.equal(view.issuerCityName, 'São Paulo');
    assert.equal(view.provider.name, 'PRESTADOR LTDA');
    assert.equal(view.provider.taxId, '11222333000181');
    assert.equal(view.taker.name, 'CLIENTE TESTE');
    assert.equal(view.taker.taxId, '52998224725');
    assert.equal(view.service.nationalCode, '010701');
    assert.equal(view.service.municipalCode, '001');
    assert.equal(view.service.description, 'SUPORTE MENSAL');
    assert.equal(view.serviceAmount, '10.00');
    assert.equal(view.netAmount, '10.00');
    assert.equal(view.issqn.taxation, '1');
    assert.equal(view.issqn.rate, '2.00');
    assert.match(view.qrCodeUrl, new RegExp(`chave=${accessKey}$`));
    assert.match(view.qrCodeUrl, /ConsultaPublica/);
  });

  it('recusa XML inválido', () => {
    assert.equal(readDanfse('<xml>'), null);
    assert.equal(readDanfse(''), null);
  });
});
