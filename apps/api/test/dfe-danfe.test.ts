import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { readDanfe } from '../src/modules/inbound/dfe-danfe.ts';

const key = '42261018371298000101550010000021161300002070';

describe('DANFE da NF-e de entrada', () => {
  it('lê emitente, destinatário, item e totais do XML completo', () => {
    const danfe = readDanfe(`<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe">
      <NFe><infNFe Id="NFe${key}">
        <ide><natOp>Compra</natOp><serie>1</serie><nNF>2116</nNF><dhEmi>2026-10-23T10:00:00-03:00</dhEmi><tpNF>1</tpNF></ide>
        <emit><CNPJ>18371298000101</CNPJ><xNome>Fornecedor</xNome><IE>123</IE>
          <enderEmit><xLgr>Rua A</xLgr><nro>10</nro><xBairro>Centro</xBairro><xMun>Florianopolis</xMun><UF>SC</UF><CEP>88000000</CEP><fone>4833334444</fone></enderEmit>
        </emit>
        <dest><CNPJ>00000000000191</CNPJ><xNome>Empresa</xNome></dest>
        <det nItem="1"><prod><cProd>ABC</cProd><xProd>Parafuso</xProd><NCM>73181500</NCM><CFOP>1102</CFOP><uCom>UN</uCom><qCom>2.0000</qCom><vUnCom>10.5000</vUnCom><vProd>21.00</vProd></prod>
          <imposto><ICMS><ICMS00><CST>00</CST><vBC>21.00</vBC><pICMS>12.00</pICMS><vICMS>2.52</vICMS></ICMS00></ICMS></imposto>
        </det>
        <total><ICMSTot><vBC>21.00</vBC><vICMS>2.52</vICMS><vProd>21.00</vProd><vFrete>1.00</vFrete><vDesc>0.50</vDesc><vNF>21.50</vNF></ICMSTot></total>
        <transp><modFrete>0</modFrete><transporta><xNome>Transportes</xNome></transporta></transp>
        <cobr><dup><nDup>001</nDup><dVenc>2026-11-23</dVenc><vDup>21.50</vDup></dup></cobr>
        <infAdic><infCpl>Pedido 10</infCpl></infAdic>
      </infNFe></NFe>
      <protNFe><infProt><nProt>135792468</nProt></infProt></protNFe>
    </nfeProc>`);
    assert.ok(danfe);
    assert.equal(danfe.accessKey, key);
    assert.equal(danfe.number, '2116');
    assert.equal(danfe.series, '1');
    assert.equal(danfe.operation, 'Compra');
    assert.equal(danfe.protocol, '135792468');
    assert.equal(danfe.emitter.name, 'Fornecedor');
    assert.equal(danfe.emitter.address.includes('Rua A, 10'), true);
    assert.equal(danfe.emitter.address.includes('CEP 88000-000'), true);
    assert.equal(danfe.recipient.name, 'Empresa');
    assert.equal(danfe.items.length, 1);
    assert.equal(danfe.items[0]?.description, 'Parafuso');
    assert.equal(danfe.items[0]?.unitPrice, 1050);
    assert.equal(danfe.items[0]?.amount, 2100);
    assert.equal(danfe.totalAmount, 2150);
    assert.equal(danfe.freightAmount, 100);
    assert.equal(danfe.discountAmount, 50);
    assert.equal(danfe.operationType, '1');
    assert.equal(danfe.emitter.street, 'Rua A, 10');
    assert.equal(danfe.emitter.city, 'Florianopolis');
    assert.equal(danfe.emitter.phone, '4833334444');
    assert.equal(danfe.icmsAmount, 252);
    assert.equal(danfe.items[0]?.cst, '00');
    assert.equal(danfe.items[0]?.icmsRate, '12.00');
    assert.equal(danfe.transport.freightType, '0');
    assert.equal(danfe.transport.carrierName, 'Transportes');
    assert.equal(danfe.duplicates[0]?.number, '001');
    assert.equal(danfe.duplicates[0]?.amount, 2150);
    assert.equal(danfe.additionalInfo, 'Pedido 10');
  });

  it('ignora resumo e XML inválido', () => {
    assert.equal(readDanfe('<resNFe><chNFe>1</chNFe></resNFe>'), null);
    assert.equal(readDanfe('<'), null);
  });
});
