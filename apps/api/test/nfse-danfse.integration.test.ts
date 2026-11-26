import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

import { billingDocuments } from '@erp-360/mod-billing';
import { nfseRequests } from '@erp-360/mod-nfse';
import { serviceOrders } from '@erp-360/mod-service-orders';
import { eq } from 'drizzle-orm';

import { buildApp } from '../src/app.ts';
import { env } from '../src/config/index.ts';
import { db } from '../src/db/index.ts';
import { createCompany, removeCompany } from './fixtures.ts';

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
        </prest>
        <toma>
          <CPF>52998224725</CPF>
          <xNome>CLIENTE TESTE</xNome>
        </toma>
        <serv>
          <cServ>
            <cTribNac>010701</cTribNac>
            <xDescServ>SUPORTE MENSAL</xDescServ>
          </cServ>
        </serv>
        <valores>
          <vServPrest><vServ>10.00</vServ></vServPrest>
          <trib>
            <tribMun>
              <tribISSQN>1</tribISSQN>
              <tpRetISSQN>1</tpRetISSQN>
            </tribMun>
          </trib>
        </valores>
      </infDPS>
    </DPS>
    <valores><vLiq>10.00</vLiq></valores>
  </infNFSe>
</NFSe>`;

describe('DANFSe da NFS-e', { concurrency: false }, () => {
  const app = buildApp({ logger: false });
  let token = '';
  let tenantId = '';
  let userId = '';
  let personId = '';
  let authorizedId = '';
  let pendingId = '';
  let authorizedWithoutXmlId = '';

  before(async () => {
    assert.equal(env.database.name, 'erp360_test', 'Os testes só rodam no banco erp360_test.');
    await app.ready();
    const company = await createCompany('DANFSe');
    tenantId = company.tenantId;
    userId = company.userId;
    personId = company.personId;
    token = app.jwt.sign({ userId, tenantId });

    async function seed(input: {
      number: number;
      status: 'pending' | 'authorized';
      accessKey: string | null;
      nfseXml: string | null;
      series: string | null;
      dpsNumber: number | null;
    }) {
      const [order] = await db
        .insert(serviceOrders)
        .values({
          tenantId,
          number: input.number,
          openedByUserId: userId,
          personId,
          customerName: 'Cliente',
          status: 'open',
        })
        .returning({ id: serviceOrders.id });
      if (!order) throw new Error('ordem');
      const [document] = await db
        .insert(billingDocuments)
        .values({
          tenantId,
          number: input.number,
          personId,
          serviceOrderId: order.id,
          productsAmount: 0,
          servicesAmount: 1000,
          freightAmount: 0,
          discountAmount: 0,
          surchargeAmount: 0,
          totalAmount: 1000,
          commercialStatus: 'issued',
          fiscalStatus: input.status === 'pending' ? 'pending' : 'authorized',
          issuedOn: '2026-11-26',
        })
        .returning({ id: billingDocuments.id });
      if (!document) throw new Error('documento');
      const [request] = await db
        .insert(nfseRequests)
        .values({
          tenantId,
          billingDocumentId: document.id,
          status: input.status,
          serviceAmount: 1000,
          series: input.series,
          dpsNumber: input.dpsNumber,
          dpsId: input.dpsNumber ? `DPS${String(input.dpsNumber).padStart(42, '0')}` : null,
          accessKey: input.accessKey,
          environment: input.dpsNumber ? 'homologation' : null,
          nfseXml: input.nfseXml,
        })
        .returning({ id: nfseRequests.id });
      if (!request) throw new Error('pedido');
      return request.id;
    }

    authorizedId = await seed({
      number: 1,
      status: 'authorized',
      accessKey,
      nfseXml: sampleXml,
      series: '49001',
      dpsNumber: 1,
    });
    pendingId = await seed({
      number: 2,
      status: 'pending',
      accessKey: null,
      nfseXml: null,
      series: null,
      dpsNumber: null,
    });
    authorizedWithoutXmlId = await seed({
      number: 3,
      status: 'authorized',
      accessKey: '2'.repeat(50),
      nfseXml: null,
      series: '49002',
      dpsNumber: 2,
    });
  });

  after(async () => {
    if (tenantId) {
      await db.delete(nfseRequests).where(eq(nfseRequests.tenantId, tenantId));
      await db.delete(billingDocuments).where(eq(billingDocuments.tenantId, tenantId));
      await db.delete(serviceOrders).where(eq(serviceOrders.tenantId, tenantId));
      await removeCompany(tenantId);
    }
    await app.close();
  });

  function headers() {
    return { authorization: `Bearer ${token}` };
  }

  it('devolve a DANFSe da nota autorizada com XML', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/nfse/${authorizedId}/danfse`,
      headers: headers(),
    });
    assert.equal(response.statusCode, 200, response.body);
    const body = response.json() as { accessKey: string; provider: { name: string } };
    assert.equal(body.accessKey, accessKey);
    assert.equal(body.provider.name, 'PRESTADOR LTDA');
  });

  it('recusa pedido pendente', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/nfse/${pendingId}/danfse`,
      headers: headers(),
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.match(response.json().message, /autorizada/i);
  });

  it('recusa autorizada sem XML', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/nfse/${authorizedWithoutXmlId}/danfse`,
      headers: headers(),
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.match(response.json().message, /XML/i);
  });

  it('responde 404 para pedido inexistente', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/nfse/${randomUUID()}/danfse`,
      headers: headers(),
    });
    assert.equal(response.statusCode, 404, response.body);
  });
});
