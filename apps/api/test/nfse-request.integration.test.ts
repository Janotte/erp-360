import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { billingDocuments } from '@erp-360/mod-billing';
import { catalogItems, measures } from '@erp-360/mod-catalog';
import {
  meansOfPayment,
  paymentMethods,
  paymentMethodTerms,
  paymentPlanLines,
  paymentPlans,
  receivables,
} from '@erp-360/mod-financial';
import { nfseRequestLines, nfseRequests } from '@erp-360/mod-nfse';
import { serviceOrderBillings, serviceOrders } from '@erp-360/mod-service-orders';
import { and, eq } from 'drizzle-orm';

import { buildApp } from '../src/app.ts';
import { env } from '../src/config/index.ts';
import { db } from '../src/db/index.ts';
import { createCompany, removeCompany } from './fixtures.ts';

type Field = { slot: string; value: string | null };
type Note = { slot: string; body: string };
type OrderDetail = {
  id: string;
  totalAmount: number;
  fields: Field[];
  notes: Note[];
  billingDocument: {
    numberLabel: string;
    fiscalStatus: string;
    servicesAmount: number;
  } | null;
  nfseRequest: {
    status: string;
    serviceAmount: number;
    lines: {
      description: string;
      nationalServiceCode: string | null;
      municipalServiceCode: string | null;
      issRate: string | null;
      amount: number;
    }[];
  } | null;
};

describe('pedido local da NFS-e', { concurrency: false }, () => {
  const app = buildApp({ logger: false });
  let token = '';
  let tenantId = '';
  let personId = '';
  let serviceId = '';
  let plainServiceId = '';
  let productId = '';
  let cashMethodId = '';

  before(async () => {
    assert.equal(env.database.name, 'erp360_test', 'Os testes só rodam no banco erp360_test.');
    await app.ready();
    const company = await createCompany('Pedido NFS-e');
    tenantId = company.tenantId;
    personId = company.personId;
    token = app.jwt.sign({ userId: company.userId, tenantId });

    const [measure] = await db
      .insert(measures)
      .values({
        tenantId,
        name: 'Unidade',
        abbreviation: 'UN',
        measureType: 'unit',
        showOnProduct: true,
        showOnService: true,
      })
      .returning({ id: measures.id });
    if (!measure) throw new Error('medida');

    const [service] = await db
      .insert(catalogItems)
      .values({
        tenantId,
        code: '000001',
        type: 'service',
        fiscalItemType: 'service',
        tracksStock: false,
        measureId: measure.id,
        name: 'SUPORTE',
        listPrice: '10.0000',
        nationalServiceCode: '010701',
        municipalServiceCode: '001',
        issRate: '2.00',
        serviceDescription: 'SUPORTE MENSAL',
      })
      .returning({ id: catalogItems.id });
    const [plain] = await db
      .insert(catalogItems)
      .values({
        tenantId,
        code: '000002',
        type: 'service',
        fiscalItemType: 'service',
        tracksStock: false,
        measureId: measure.id,
        name: 'VISITA',
        listPrice: '5.0000',
      })
      .returning({ id: catalogItems.id });
    const [product] = await db
      .insert(catalogItems)
      .values({
        tenantId,
        code: '000003',
        type: 'product',
        fiscalItemType: 'resale',
        tracksStock: true,
        measureId: measure.id,
        name: 'PEÇA',
        listPrice: '10.0000',
      })
      .returning({ id: catalogItems.id });
    if (!service || !plain || !product) throw new Error('item');
    serviceId = service.id;
    plainServiceId = plain.id;
    productId = product.id;

    const [cashMean] = await db
      .select({ id: meansOfPayment.id })
      .from(meansOfPayment)
      .where(eq(meansOfPayment.code, '01'))
      .limit(1);
    if (!cashMean) throw new Error('meio');
    const [cash] = await db
      .insert(paymentMethods)
      .values({
        tenantId,
        code: 'DIN',
        name: 'Dinheiro',
        meansOfPaymentId: cashMean.id,
        receiptKind: 'cash',
        useInServiceOrder: true,
      })
      .returning({ id: paymentMethods.id });
    if (!cash) throw new Error('forma');
    cashMethodId = cash.id;
    await db.insert(paymentMethodTerms).values({
      tenantId,
      paymentMethodId: cashMethodId,
      installmentCount: 1,
    });
  });

  after(async () => {
    if (tenantId) {
      await db.delete(nfseRequests).where(eq(nfseRequests.tenantId, tenantId));
      await db.delete(serviceOrderBillings).where(eq(serviceOrderBillings.tenantId, tenantId));
      await db.delete(billingDocuments).where(eq(billingDocuments.tenantId, tenantId));
      await db.delete(receivables).where(eq(receivables.tenantId, tenantId));
      await db.delete(serviceOrders).where(eq(serviceOrders.tenantId, tenantId));
      await db.delete(paymentPlanLines).where(eq(paymentPlanLines.tenantId, tenantId));
      await db.delete(paymentPlans).where(eq(paymentPlans.tenantId, tenantId));
      await db.delete(catalogItems).where(eq(catalogItems.tenantId, tenantId));
      await db.delete(measures).where(eq(measures.tenantId, tenantId));
      await db.delete(paymentMethods).where(eq(paymentMethods.tenantId, tenantId));
      await removeCompany(tenantId);
    }
    await app.close();
  });

  function headers() {
    return { authorization: `Bearer ${token}` };
  }

  function completed(detail: OrderDetail, patch: Record<string, unknown>) {
    const payload = { ...detail, ...patch } as OrderDetail;
    payload.fields = payload.fields.map((field) => {
      if (field.value?.trim()) return field;
      if (field.slot === 'field01') return { ...field, value: 'Aparelho' };
      if (field.slot === 'field08') return { ...field, value: 'Defeito' };
      return field;
    });
    return payload;
  }

  async function open() {
    const response = await app.inject({
      method: 'POST',
      url: '/service-orders',
      headers: headers(),
      payload: { personId },
    });
    assert.equal(response.statusCode, 201, response.body);
    return response.json() as OrderDetail;
  }

  async function save(detail: OrderDetail, patch: Record<string, unknown>) {
    const response = await app.inject({
      method: 'PUT',
      url: `/service-orders/${detail.id}`,
      headers: headers(),
      payload: completed(detail, patch),
    });
    assert.equal(response.statusCode, 200, response.body);
    return response.json() as OrderDetail;
  }

  async function deliver(lines: Record<string, unknown>[], amount: number) {
    let detail = await open();
    detail = await save(detail, {
      lines,
      paymentMethodId: null,
      paymentInstallments: null,
      payments: [
        { paymentMethodId: cashMethodId, installmentCount: 1, dueOn: '2026-11-24', amount },
      ],
    });
    detail = await save(detail, { status: 'in_progress' });
    detail = await save(detail, { status: 'ready' });
    return save(detail, { status: 'delivered' });
  }

  async function bill(detail: OrderDetail, amount: number) {
    return app.inject({
      method: 'POST',
      url: `/service-orders/${detail.id}/billings`,
      headers: headers(),
      payload: {
        payments: [
          { paymentMethodId: cashMethodId, installmentCount: 1, dueOn: '2026-11-24', amount },
        ],
      },
    });
  }

  async function requestNfse(id: string) {
    return app.inject({
      method: 'POST',
      url: `/service-orders/${id}/nfse`,
      headers: headers(),
    });
  }

  const serviceLines = [
    { kind: 'service', itemId: '', quantity: '1.0000', unitPrice: '10.0000' },
    { kind: 'service', itemId: '', quantity: '1.0000', unitPrice: '5.0000' },
  ];

  it('grava o pedido local e não duplica', async () => {
    serviceLines[0].itemId = serviceId;
    serviceLines[1].itemId = plainServiceId;
    const detail = await deliver(serviceLines, 1500);
    assert.equal(detail.totalAmount, 1500);

    const before = await requestNfse(detail.id);
    assert.equal(before.statusCode, 400, before.body);
    assert.match(before.body, /Gere o financeiro antes de solicitar a NFS-e/);

    const billed = await bill(detail, 1500);
    assert.equal(billed.statusCode, 200, billed.body);

    const response = await requestNfse(detail.id);
    assert.equal(response.statusCode, 200, response.body);
    const body = response.json() as {
      message: string;
      request: OrderDetail['nfseRequest'];
    };
    assert.equal(body.message, 'NFS-e solicitada.');
    assert.equal(body.request?.status, 'pending');
    assert.equal(body.request?.serviceAmount, 1500);
    assert.deepEqual(body.request?.lines, [
      {
        lineNumber: 1,
        description: 'SUPORTE MENSAL',
        nationalServiceCode: '010701',
        municipalServiceCode: '001',
        issRate: '2.00',
        amount: 1000,
      },
      {
        lineNumber: 2,
        description: 'VISITA',
        nationalServiceCode: null,
        municipalServiceCode: null,
        issRate: null,
        amount: 500,
      },
    ]);

    const again = await requestNfse(detail.id);
    assert.equal(again.statusCode, 409, again.body);
    assert.match(again.body, /A NFS-e deste documento já foi solicitada/);
    const stored = await db
      .select({ id: nfseRequests.id, status: nfseRequests.status })
      .from(nfseRequests)
      .where(eq(nfseRequests.tenantId, tenantId));
    assert.equal(stored.length, 1);
    assert.equal(stored[0]?.status, 'pending');
    const lineCount = await db
      .select({ id: nfseRequestLines.id })
      .from(nfseRequestLines)
      .where(eq(nfseRequestLines.tenantId, tenantId));
    assert.equal(lineCount.length, 2);

    const titles = await db
      .select({ status: receivables.status, invoiceNumber: receivables.invoiceNumber })
      .from(receivables)
      .where(eq(receivables.tenantId, tenantId));
    assert.equal(titles.length, 1);
    assert.equal(titles[0]?.status, 'pendente');
    assert.equal(titles[0]?.invoiceNumber, '000.001');

    const read = await app.inject({
      method: 'GET',
      url: `/service-orders/${detail.id}`,
      headers: headers(),
    });
    const loaded = read.json() as OrderDetail;
    assert.equal(loaded.billingDocument?.numberLabel, '000.001');
    assert.equal(loaded.billingDocument?.fiscalStatus, 'pending');
    assert.equal(loaded.nfseRequest?.lines[0]?.description, 'SUPORTE MENSAL');

    const reversed = await app.inject({
      method: 'POST',
      url: `/service-orders/${detail.id}/reversal`,
      headers: headers(),
    });
    assert.equal(reversed.statusCode, 200, reversed.body);
    const afterReverse = await db
      .select({ status: nfseRequests.status })
      .from(nfseRequests)
      .where(eq(nfseRequests.tenantId, tenantId));
    assert.deepEqual(
      afterReverse.map((row) => row.status),
      ['canceled'],
    );
  });

  it('recusa documento só de produto', async () => {
    const detail = await deliver(
      [{ kind: 'product', itemId: productId, quantity: '1.0000', unitPrice: '10.0000' }],
      1000,
    );
    const billed = await bill(detail, 1000);
    assert.equal(billed.statusCode, 200, billed.body);
    const response = await requestNfse(detail.id);
    assert.equal(response.statusCode, 400, response.body);
    assert.match(response.body, /Este documento não tem serviço/);
    const [document] = await db
      .select({ fiscalStatus: billingDocuments.fiscalStatus })
      .from(billingDocuments)
      .where(
        and(
          eq(billingDocuments.tenantId, tenantId),
          eq(billingDocuments.serviceOrderId, detail.id),
        ),
      );
    assert.equal(document?.fiscalStatus, 'not_requested');
  });
});
