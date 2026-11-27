import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

import { billingDocuments } from '@erp-360/mod-billing';
import { catalogItems, measures } from '@erp-360/mod-catalog';
import { tenants } from '@erp-360/mod-core';
import {
  meansOfPayment,
  paymentMethods,
  paymentMethodTerms,
  paymentPlanLines,
  paymentPlans,
  receivables,
} from '@erp-360/mod-financial';
import { nfseDpsCounters, nfseEvents, nfseRequests, nfseSettings } from '@erp-360/mod-nfse';
import { cities, countries, personAddresses, persons, states } from '@erp-360/mod-persons';
import { serviceOrderBillings, serviceOrders } from '@erp-360/mod-service-orders';
import { eq } from 'drizzle-orm';

import { buildApp } from '../src/app.ts';
import { env } from '../src/config/index.ts';
import { db } from '../src/db/index.ts';
import {
  setNfseCertificateLoaderForTests,
  setNfseTransportForTests,
} from '../src/modules/nfse/send.ts';
import { createCompany, removeCompany } from './fixtures.ts';

type Field = { slot: string; value: string | null };
type OrderDetail = { id: string; fields: Field[] };

describe('cancelamento da NFS-e', { concurrency: false }, () => {
  const app = buildApp({ logger: false });
  let token = '';
  let tenantId = '';
  let personId = '';
  let serviceId = '';
  let cashMethodId = '';
  let countryId = '';
  let stateId = '';
  let cityId = '';
  const calls: string[] = [];

  before(async () => {
    assert.equal(env.database.name, 'erp360_test', 'Os testes só rodam no banco erp360_test.');
    await app.ready();
    const company = await createCompany('Cancelamento NFS-e');
    tenantId = company.tenantId;
    personId = company.personId;
    token = app.jwt.sign({ userId: company.userId, tenantId });
    await db
      .update(persons)
      .set({ taxId: '52998224725', nfeEmail: 'cliente@teste.local' })
      .where(eq(persons.id, personId));

    const mark = randomUUID().replaceAll('-', '').slice(0, 6);
    const [country] = await db
      .insert(countries)
      .values({ name: `Pais ${mark}`, code: `Z${mark.slice(0, 3)}` })
      .returning({ id: countries.id });
    const [state] = await db
      .insert(states)
      .values({
        name: `Estado ${mark}`,
        abbreviation: 'QZ',
        code: '99',
        region: 'Sul',
        countryId: country.id,
      })
      .returning({ id: states.id });
    const [city] = await db
      .insert(cities)
      .values({ name: `Cidade ${mark}`, code: '3550308', stateId: state.id })
      .returning({ id: cities.id });
    countryId = country.id;
    stateId = state.id;
    cityId = city.id;
    await db
      .update(tenants)
      .set({
        cityId,
        email: 'prestador@empresa.local',
        phone: '1133334444',
        postalCode: '01001000',
        street: 'Rua A',
        number: '100',
        neighborhood: 'Centro',
      })
      .where(eq(tenants.id, tenantId));
    await db.insert(personAddresses).values({
      tenantId,
      personId,
      type: 'Principal',
      postalCode: '01001000',
      street: 'Rua B',
      number: '200',
      neighborhood: 'Sé',
      cityId,
    });

    const [measure] = await db
      .insert(measures)
      .values({
        tenantId,
        name: 'Unidade',
        abbreviation: 'UN',
        measureType: 'unit',
        showOnService: true,
      })
      .returning({ id: measures.id });
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
    serviceId = service.id;

    const [cashMean] = await db
      .select({ id: meansOfPayment.id })
      .from(meansOfPayment)
      .where(eq(meansOfPayment.code, '01'))
      .limit(1);
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
    cashMethodId = cash.id;
    await db.insert(paymentMethodTerms).values({
      tenantId,
      paymentMethodId: cashMethodId,
      installmentCount: 1,
    });

    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const [tenant] = await db
      .select({ cnpj: tenants.cnpj })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    setNfseCertificateLoaderForTests(async () => ({
      certificatePem: '-----BEGIN CERTIFICATE-----\nVEVTVA==\n-----END CERTIFICATE-----',
      privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      taxId: tenant.cnpj,
    }));
    setNfseTransportForTests(async (input) => {
      calls.push(input.endpoint);
      if (input.endpoint.includes('/eventos')) {
        return { statusCode: 201, body: JSON.stringify({}) };
      }
      return {
        statusCode: 201,
        body: JSON.stringify({ chaveAcesso: '7'.repeat(50) }),
      };
    });
  });

  after(async () => {
    setNfseTransportForTests(null);
    setNfseCertificateLoaderForTests(null);
    if (tenantId) {
      await db.delete(nfseEvents).where(eq(nfseEvents.tenantId, tenantId));
      await db.delete(nfseRequests).where(eq(nfseRequests.tenantId, tenantId));
      await db.delete(nfseDpsCounters).where(eq(nfseDpsCounters.tenantId, tenantId));
      await db.delete(nfseSettings).where(eq(nfseSettings.tenantId, tenantId));
      await db.delete(serviceOrderBillings).where(eq(serviceOrderBillings.tenantId, tenantId));
      await db.delete(billingDocuments).where(eq(billingDocuments.tenantId, tenantId));
      await db.delete(receivables).where(eq(receivables.tenantId, tenantId));
      await db.delete(serviceOrders).where(eq(serviceOrders.tenantId, tenantId));
      await db.delete(paymentPlanLines).where(eq(paymentPlanLines.tenantId, tenantId));
      await db.delete(paymentPlans).where(eq(paymentPlans.tenantId, tenantId));
      await db.delete(catalogItems).where(eq(catalogItems.tenantId, tenantId));
      await db.delete(measures).where(eq(measures.tenantId, tenantId));
      await db.delete(paymentMethods).where(eq(paymentMethods.tenantId, tenantId));
      await db.update(tenants).set({ cityId: null }).where(eq(tenants.id, tenantId));
      await removeCompany(tenantId);
    }
    if (cityId) await db.delete(cities).where(eq(cities.id, cityId));
    if (stateId) await db.delete(states).where(eq(states.id, stateId));
    if (countryId) await db.delete(countries).where(eq(countries.id, countryId));
    await app.close();
  });

  function headers() {
    return { authorization: `Bearer ${token}` };
  }

  async function save(detail: OrderDetail, patch: Record<string, unknown>) {
    const payload = { ...detail, ...patch } as OrderDetail;
    payload.fields = payload.fields.map((field) => {
      if (field.value?.trim()) return field;
      if (field.slot === 'field01') return { ...field, value: 'Aparelho' };
      if (field.slot === 'field08') return { ...field, value: 'Defeito' };
      return field;
    });
    const response = await app.inject({
      method: 'PUT',
      url: `/service-orders/${detail.id}`,
      headers: headers(),
      payload,
    });
    assert.equal(response.statusCode, 200, response.body);
    return response.json() as OrderDetail;
  }

  it('cancela no SEFIN, grava evento e libera novo pedido; bloqueia estorno enquanto autorizada', async () => {
    const opened = await app.inject({
      method: 'POST',
      url: '/service-orders',
      headers: headers(),
      payload: { personId },
    });
    assert.equal(opened.statusCode, 201, opened.body);
    let detail = opened.json() as OrderDetail;
    detail = await save(detail, {
      lines: [{ kind: 'service', itemId: serviceId, quantity: '1.0000', unitPrice: '10.0000' }],
      payments: [
        { paymentMethodId: cashMethodId, installmentCount: 1, dueOn: '2026-11-27', amount: 1000 },
      ],
    });
    detail = await save(detail, { status: 'in_progress' });
    detail = await save(detail, { status: 'ready' });
    detail = await save(detail, { status: 'delivered' });
    const billed = await app.inject({
      method: 'POST',
      url: `/service-orders/${detail.id}/billings`,
      headers: headers(),
      payload: {
        payments: [
          { paymentMethodId: cashMethodId, installmentCount: 1, dueOn: '2026-11-27', amount: 1000 },
        ],
      },
    });
    assert.equal(billed.statusCode, 200, billed.body);

    const settings = await app.inject({
      method: 'PUT',
      url: '/settings/nfse',
      headers: headers(),
      payload: {
        environment: 'homologation',
        series: '49001',
        simplesNacional: 'non_optant',
        simplesAssessment: null,
        simplesTaxPercent: null,
        ibsCbsAssessment: null,
        specialTaxRegime: 'none',
        issqnTaxation: 'taxable',
      },
    });
    assert.equal(settings.statusCode, 200, settings.body);

    const requested = await app.inject({
      method: 'POST',
      url: `/service-orders/${detail.id}/nfse`,
      headers: headers(),
    });
    assert.equal(requested.statusCode, 200, requested.body);
    const requestId = (requested.json() as { request: { id: string } }).request.id;

    const sent = await app.inject({
      method: 'POST',
      url: `/service-orders/${detail.id}/nfse/send`,
      headers: headers(),
    });
    assert.equal(sent.statusCode, 200, sent.body);

    const blockedReversal = await app.inject({
      method: 'POST',
      url: `/service-orders/${detail.id}/reversal`,
      headers: headers(),
    });
    assert.equal(blockedReversal.statusCode, 409, blockedReversal.body);
    assert.match(blockedReversal.body, /Cancele a NFS-e autorizada/);

    const canceled = await app.inject({
      method: 'POST',
      url: `/nfse/${requestId}/cancel`,
      headers: headers(),
      payload: {
        reasonCode: '1',
        reasonText: 'Erro de digitacao no valor do servico',
      },
    });
    assert.equal(canceled.statusCode, 200, canceled.body);
    assert.equal((canceled.json() as { message: string }).message, 'NFS-e cancelada.');
    assert.ok(calls.some((url) => url.includes('/eventos')));

    const events = await app.inject({
      method: 'GET',
      url: `/nfse/${requestId}/events`,
      headers: headers(),
    });
    assert.equal(events.statusCode, 200, events.body);
    const eventPage = events.json() as {
      data: Array<{ type: string; reasonCode: string; reasonText: string }>;
    };
    assert.equal(eventPage.data.length, 1);
    assert.equal(eventPage.data[0]?.type, 'e101101');
    assert.equal(eventPage.data[0]?.reasonCode, '1');

    const [document] = await db
      .select({ fiscalStatus: billingDocuments.fiscalStatus })
      .from(billingDocuments)
      .where(eq(billingDocuments.tenantId, tenantId));
    assert.equal(document?.fiscalStatus, 'canceled');

    const [request] = await db
      .select({ status: nfseRequests.status })
      .from(nfseRequests)
      .where(eq(nfseRequests.id, requestId));
    assert.equal(request?.status, 'canceled');

    const again = await app.inject({
      method: 'POST',
      url: `/service-orders/${detail.id}/nfse`,
      headers: headers(),
    });
    assert.equal(again.statusCode, 200, again.body);
    assert.equal((again.json() as { request: { status: string } }).request.status, 'pending');
  });
});
