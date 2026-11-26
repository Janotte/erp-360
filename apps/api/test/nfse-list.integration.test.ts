import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { billingDocuments } from '@erp-360/mod-billing';
import { nfseRequests } from '@erp-360/mod-nfse';
import { persons } from '@erp-360/mod-persons';
import { serviceOrders } from '@erp-360/mod-service-orders';
import { eq } from 'drizzle-orm';

import { buildApp } from '../src/app.ts';
import { env } from '../src/config/index.ts';
import { db } from '../src/db/index.ts';
import { createCompany, removeCompany } from './fixtures.ts';

type ListItem = {
  id: string;
  dpsNumber: number | null;
  series: string | null;
  status: string;
  createdAt: string;
  customerName: string;
  serviceAmount: number;
  accessKey: string | null;
};

type ListPage = {
  data: ListItem[];
  meta: { total: number; page: number; limit: number; totalPages: number };
};

describe('lista de NFS-e', { concurrency: false }, () => {
  const app = buildApp({ logger: false });
  let token = '';
  let tenantId = '';
  let userId = '';
  let personId = '';
  let otherPersonId = '';
  let pendingId = '';
  let authorizedId = '';

  before(async () => {
    assert.equal(env.database.name, 'erp360_test', 'Os testes só rodam no banco erp360_test.');
    await app.ready();
    const company = await createCompany('Lista NFS-e');
    tenantId = company.tenantId;
    userId = company.userId;
    personId = company.personId;
    token = app.jwt.sign({ userId, tenantId });

    const [other] = await db
      .insert(persons)
      .values({
        tenantId,
        name: 'Cliente Beta',
        isClient: true,
      })
      .returning({ id: persons.id });
    if (!other) throw new Error('pessoa');
    otherPersonId = other.id;

    async function seed(input: {
      personId: string;
      number: number;
      status: 'pending' | 'authorized' | 'rejected' | 'canceled';
      serviceAmount: number;
      series: string | null;
      dpsNumber: number | null;
      accessKey: string | null;
      createdAt: Date;
    }) {
      const [order] = await db
        .insert(serviceOrders)
        .values({
          tenantId,
          number: input.number,
          openedByUserId: userId,
          personId: input.personId,
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
          personId: input.personId,
          serviceOrderId: order.id,
          productsAmount: 0,
          servicesAmount: input.serviceAmount,
          freightAmount: 0,
          discountAmount: 0,
          surchargeAmount: 0,
          totalAmount: input.serviceAmount,
          commercialStatus: 'issued',
          fiscalStatus: input.status === 'pending' ? 'pending' : input.status,
          issuedOn: '2026-11-20',
        })
        .returning({ id: billingDocuments.id });
      if (!document) throw new Error('documento');
      const [request] = await db
        .insert(nfseRequests)
        .values({
          tenantId,
          billingDocumentId: document.id,
          status: input.status,
          serviceAmount: input.serviceAmount,
          series: input.series,
          dpsNumber: input.dpsNumber,
          dpsId: input.dpsNumber
            ? `DPS${String(input.dpsNumber).padStart(42, '0')}`
            : null,
          accessKey: input.accessKey,
          environment: input.dpsNumber ? 'homologation' : null,
          createdAt: input.createdAt,
        })
        .returning({ id: nfseRequests.id });
      if (!request) throw new Error('pedido');
      return request.id;
    }

    pendingId = await seed({
      personId,
      number: 1,
      status: 'pending',
      serviceAmount: 1500,
      series: null,
      dpsNumber: null,
      accessKey: null,
      createdAt: new Date('2026-11-21T15:00:00.000Z'),
    });
    authorizedId = await seed({
      personId: otherPersonId,
      number: 2,
      status: 'authorized',
      serviceAmount: 3200,
      series: '00001',
      dpsNumber: 42,
      accessKey: '1'.repeat(50),
      createdAt: new Date('2026-11-22T15:00:00.000Z'),
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

  it('lista com ordenação padrão por DPS e página', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/nfse?limit=10',
      headers: headers(),
    });
    assert.equal(response.statusCode, 200, response.body);
    const body = response.json() as ListPage;
    assert.equal(body.meta.total, 2);
    assert.equal(body.data[0]?.id, authorizedId);
    assert.equal(body.data[0]?.dpsNumber, 42);
    assert.equal(body.data[0]?.customerName, 'Cliente Beta');
    assert.equal(body.data[1]?.id, pendingId);
    assert.equal(body.data[1]?.dpsNumber, null);
  });

  it('filtra por status e intervalo de emissão', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/nfse?status=authorized&issuedFrom=2026-11-22&issuedTo=2026-11-22',
      headers: headers(),
    });
    assert.equal(response.statusCode, 200, response.body);
    const body = response.json() as ListPage;
    assert.equal(body.meta.total, 1);
    assert.equal(body.data[0]?.id, authorizedId);
  });

  it('busca por DPS, série, cliente e chave', async () => {
    const byDps = await app.inject({
      method: 'GET',
      url: '/nfse?q=42',
      headers: headers(),
    });
    assert.equal(byDps.statusCode, 200, byDps.body);
    assert.equal((byDps.json() as ListPage).data[0]?.id, authorizedId);

    const bySeries = await app.inject({
      method: 'GET',
      url: '/nfse?q=00001',
      headers: headers(),
    });
    assert.equal((bySeries.json() as ListPage).data[0]?.id, authorizedId);

    const byCustomer = await app.inject({
      method: 'GET',
      url: '/nfse?q=Beta',
      headers: headers(),
    });
    assert.equal((byCustomer.json() as ListPage).data[0]?.id, authorizedId);

    const byKey = await app.inject({
      method: 'GET',
      url: `/nfse?q=${'1'.repeat(8)}`,
      headers: headers(),
    });
    assert.equal((byKey.json() as ListPage).data[0]?.id, authorizedId);
  });

  it('ordena por total e rejeita sort inválido', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/nfse?sortField=serviceAmount&sortOrder=desc',
      headers: headers(),
    });
    assert.equal(response.statusCode, 200, response.body);
    const body = response.json() as ListPage;
    assert.equal(body.data[0]?.serviceAmount, 3200);

    const bad = await app.inject({
      method: 'GET',
      url: '/nfse?sortField=foo',
      headers: headers(),
    });
    assert.equal(bad.statusCode, 400);
  });
});
