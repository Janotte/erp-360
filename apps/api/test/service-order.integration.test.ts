import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { catalogItems, measures } from '@erp-360/mod-catalog';
import { meansOfPayment, paymentMethods, paymentMethodTerms } from '@erp-360/mod-financial';
import { serviceOrderFields, serviceOrderFieldValues, serviceOrderNoteLines, serviceOrders } from '@erp-360/mod-service-orders';
import { eq, sql } from 'drizzle-orm';

import { buildApp } from '../src/app.ts';
import { env } from '../src/config/index.ts';
import { db } from '../src/db/index.ts';
import { createCompany, removeCompany } from './fixtures.ts';

type Field = {
  slot: string;
  label: string;
  isActive: boolean;
  isRequired: boolean;
  width: number;
};

type NoteLine = {
  slot: string;
  body: string;
  isActive: boolean;
};

type SettingsBody = {
  sectionTitle: string;
  productsTitle: string;
  servicesTitle: string;
  technicianSignatureLabel: string;
  customerSignatureLabel: string;
  summarySlot: string;
  fields: Field[];
  noteLines: NoteLine[];
  confirmLabelChange?: boolean;
};

describe('aba da ordem de serviço', { concurrency: false }, () => {
  const app = buildApp({ logger: false });
  let token = '';
  let tenantId = '';
  let userId = '';
  let personId = '';

  before(async () => {
    assert.equal(env.database.name, 'erp360_test', 'Os testes só rodam no banco erp360_test.');
    await app.ready();
    const company = await createCompany('Ordem');
    tenantId = company.tenantId;
    userId = company.userId;
    personId = company.personId;
    token = app.jwt.sign({ userId, tenantId });
  });

  after(async () => {
    if (tenantId) {
      await db.delete(serviceOrders).where(eq(serviceOrders.tenantId, tenantId));
      await removeCompany(tenantId);
    }
    await app.close();
  });

  function auth(method: 'GET' | 'PUT', payload?: SettingsBody) {
    return app.inject({
      method,
      url: '/settings/service-order',
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
  }

  async function read(): Promise<SettingsBody> {
    const response = await auth('GET');
    assert.equal(response.statusCode, 200);
    return response.json();
  }

  async function countRows() {
    const [fields] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(serviceOrderFields)
      .where(eq(serviceOrderFields.tenantId, tenantId));
    const [lines] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(serviceOrderNoteLines)
      .where(eq(serviceOrderNoteLines.tenantId, tenantId));
    return { fields: Number(fields?.count), lines: Number(lines?.count) };
  }

  it('cria a assistência na primeira leitura e não duplica na segunda', async () => {
    const first = await read();
    const field01 = first.fields.find((field) => field.slot === 'field01');
    const field08 = first.fields.find((field) => field.slot === 'field08');
    const line01 = first.noteLines.find((line) => line.slot === 'line01');
    const line02 = first.noteLines.find((line) => line.slot === 'line02');

    assert.equal(first.summarySlot, 'field01');
    assert.equal(first.sectionTitle, 'Informações do objeto');
    assert.equal(first.productsTitle, 'Produtos');
    assert.equal(first.servicesTitle, 'Serviços');
    assert.equal(first.technicianSignatureLabel, 'Responsável técnico');
    assert.equal(first.customerSignatureLabel, 'Assinatura do cliente');
    assert.deepEqual(field01, {
      slot: 'field01',
      label: 'Descrição',
      isActive: true,
      isRequired: true,
      width: 12,
    });
    assert.equal(field08?.label, 'Problema reclamado');
    assert.equal(field08?.isRequired, true);
    assert.equal(
      line01?.body,
      'Garantia dos serviços e peças de 90 dias conforme o Código de Defesa do Consumidor.',
    );
    assert.equal(line01?.isActive, true);
    assert.equal(line02?.body, 'Autorizo o descarte das peças substituídas.');
    assert.equal(line02?.isActive, true);
    for (const slot of ['line03', 'line04', 'line05']) {
      const line = first.noteLines.find((item) => item.slot === slot);
      assert.equal(line?.isActive, false);
      assert.equal(line?.body, '');
    }

    const second = await read();
    assert.deepEqual(second, first);
    assert.deepEqual(await countRows(), { fields: 11, lines: 5 });
  });

  it('grava os rótulos da oficina e recusa lista inativa ou rótulo ativo em branco', async () => {
    const current = await read();
    const workshop: SettingsBody = {
      ...current,
      summarySlot: 'field04',
      fields: current.fields.map((field) => {
        if (field.slot === 'field01') {
          return { ...field, label: 'Marca', width: 4, isRequired: false };
        }
        if (field.slot === 'field04') {
          return { ...field, label: 'Placa', width: 4, isRequired: true };
        }
        return field;
      }),
    };

    const saved = await auth('PUT', workshop);
    assert.equal(saved.statusCode, 200);
    const after = await read();
    assert.equal(after.summarySlot, 'field04');
    assert.equal(after.fields.find((field) => field.slot === 'field01')?.label, 'Marca');
    assert.equal(after.fields.find((field) => field.slot === 'field04')?.label, 'Placa');
    assert.equal(after.fields.find((field) => field.slot === 'field04')?.isRequired, true);

    const inactiveSummary: SettingsBody = {
      ...after,
      summarySlot: 'field06',
      fields: after.fields.map((field) =>
        field.slot === 'field06' ? { ...field, isActive: false } : field,
      ),
    };
    assert.equal((await auth('PUT', inactiveSummary)).statusCode, 400);

    const blankLabel: SettingsBody = {
      ...after,
      fields: after.fields.map((field) =>
        field.slot === 'field02' ? { ...field, isActive: true, label: '   ' } : field,
      ),
    };
    assert.equal((await auth('PUT', blankLabel)).statusCode, 400);
    assert.equal((await read()).summarySlot, 'field04');
  });

  it('pede confirmação para trocar rótulo com valor em ordem aberta', async () => {
    const current = await read();
    const [order] = await db
      .insert(serviceOrders)
      .values({
        tenantId,
        number: 1,
        openedByUserId: userId,
        personId,
        customerName: 'Cliente da ordem',
      })
      .returning({ id: serviceOrders.id });
    await db.insert(serviceOrderFieldValues).values({
      tenantId,
      orderId: order.id,
      slot: 'field08',
      value: 'não liga',
    });

    const renamed: SettingsBody = {
      ...current,
      fields: current.fields.map((field) =>
        field.slot === 'field08'
          ? { ...field, label: 'Reclamação do cliente / sintomas' }
          : field,
      ),
    };
    const blocked = await auth('PUT', renamed);
    assert.equal(blocked.statusCode, 409);
    assert.deepEqual(blocked.json(), { code: 'label_change', slots: ['field08'] });
    assert.equal(
      (await read()).fields.find((field) => field.slot === 'field08')?.label,
      current.fields.find((field) => field.slot === 'field08')?.label,
    );

    const confirmed = await auth('PUT', { ...renamed, confirmLabelChange: true });
    assert.equal(confirmed.statusCode, 200);
    assert.equal(
      (await read()).fields.find((field) => field.slot === 'field08')?.label,
      'Reclamação do cliente / sintomas',
    );

    await db
      .update(serviceOrders)
      .set({
        status: 'delivered',
        deliveredAt: new Date(),
        labelFrozenAt: new Date(),
      })
      .where(eq(serviceOrders.id, order.id));
    const afterDelivery: SettingsBody = {
      ...renamed,
      fields: renamed.fields.map((field) =>
        field.slot === 'field08' ? { ...field, label: 'Sintomas' } : field,
      ),
    };
    assert.equal((await auth('PUT', afterDelivery)).statusCode, 200);
  });
});

const warrantyNote =
  'Garantia dos serviços e peças de 90 dias conforme o Código de Defesa do Consumidor.';

type OrderField = {
  slot: string;
  value: string | null;
  label: string;
  width: number;
  isActive: boolean;
  isRequired: boolean;
};

type OrderNote = { slot: string; body: string };

type OrderLine = {
  lineNumber?: number;
  kind: string;
  itemId: string;
  code?: string;
  description?: string;
  quantity: string;
  unitPrice?: string;
  lineAmount?: number;
  technicianPersonId?: string | null;
  technicianName?: string | null;
};

type OrderDetail = {
  id: string;
  number: number;
  numberLabel: string;
  status: string;
  attendance: string;
  personId: string;
  originOrderId: string | null;
  promisedAt: string | null;
  internalNotes: string;
  customerName: string;
  customerTaxId: string | null;
  customerPhone: string | null;
  customerMobilePhone: string | null;
  customerWhatsapp: string | null;
  customerEmail: string | null;
  customerStreetLine: string | null;
  customerNeighborhood: string | null;
  customerCityLine: string | null;
  freightAmount: number;
  discountAmount: number;
  surchargeAmount: number;
  paymentMethodId: string | null;
  paymentInstallments: number | null;
  deliveredAt: string | null;
  labelFrozenAt: string | null;
  fields: OrderField[];
  notes: OrderNote[];
  lines: OrderLine[];
};

describe('gravação da ordem de serviço', { concurrency: false }, () => {
  const app = buildApp({ logger: false });
  let token = '';
  let tenantId = '';
  let personId = '';
  let productId = '';
  let paymentMethodId = '';

  before(async () => {
    assert.equal(env.database.name, 'erp360_test', 'Os testes só rodam no banco erp360_test.');
    await app.ready();
    const company = await createCompany('Abertura');
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
    const [product] = await db
      .insert(catalogItems)
      .values({
        tenantId,
        code: '000001',
        type: 'product',
        fiscalItemType: 'resale',
        tracksStock: true,
        measureId: measure.id,
        name: 'Peça',
        listPrice: '10.0000',
      })
      .returning({ id: catalogItems.id });
    await db.insert(catalogItems).values({
      tenantId,
      code: '000002',
      type: 'service',
      fiscalItemType: 'service',
      tracksStock: false,
      measureId: measure.id,
      name: 'Mão de obra',
    });
    productId = product.id;

    const [cash] = await db
      .select({ id: meansOfPayment.id })
      .from(meansOfPayment)
      .where(eq(meansOfPayment.code, '01'))
      .limit(1);
    const [method] = await db
      .insert(paymentMethods)
      .values({
        tenantId,
        code: 'DIN',
        name: 'Dinheiro',
        meansOfPaymentId: cash.id,
        receiptKind: 'cash',
        useInServiceOrder: true,
      })
      .returning({ id: paymentMethods.id });
    paymentMethodId = method.id;
    await db.insert(paymentMethodTerms).values({
      tenantId,
      paymentMethodId,
      installmentCount: 1,
    });
  });

  after(async () => {
    if (tenantId) {
      await db.delete(serviceOrders).where(eq(serviceOrders.tenantId, tenantId));
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

  async function open(payload: Record<string, unknown> = {}) {
    return app.inject({
      method: 'POST',
      url: '/service-orders',
      headers: headers(),
      payload: { personId, ...payload },
    });
  }

  async function readOrder(id: string): Promise<OrderDetail> {
    const response = await app.inject({
      method: 'GET',
      url: `/service-orders/${id}`,
      headers: headers(),
    });
    assert.equal(response.statusCode, 200);
    return response.json();
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

  async function send(detail: OrderDetail, patch: Record<string, unknown> = {}) {
    return app.inject({
      method: 'PUT',
      url: `/service-orders/${detail.id}`,
      headers: headers(),
      payload: completed(detail, patch),
    });
  }

  async function save(detail: OrderDetail, patch: Record<string, unknown> = {}) {
    const response = await send(detail, patch);
    assert.equal(response.statusCode, 200, response.body);
    return response.json() as Promise<OrderDetail>;
  }

  async function settings(): Promise<SettingsBody> {
    const response = await app.inject({
      method: 'GET',
      url: '/settings/service-order',
      headers: headers(),
    });
    assert.equal(response.statusCode, 200);
    return response.json();
  }

  async function saveSettings(body: SettingsBody) {
    const response = await app.inject({
      method: 'PUT',
      url: '/settings/service-order',
      headers: headers(),
      payload: body,
    });
    assert.equal(response.statusCode, 200, response.body);
  }

  it('não reaproveita o número de uma ordem cancelada', async () => {
    const first = await open();
    const second = await open();
    assert.equal(first.statusCode, 201, first.body);
    assert.equal(second.statusCode, 201, second.body);
    const created = first.json() as OrderDetail;
    const next = second.json() as OrderDetail;
    assert.equal(created.numberLabel, '000.000.001');
    assert.equal(next.numberLabel, '000.000.002');

    const cancelled = await save(created, { status: 'cancelled' });
    assert.equal(cancelled.status, 'cancelled');

    const third = await open();
    assert.equal(third.statusCode, 201, third.body);
    assert.equal((third.json() as OrderDetail).numberLabel, '000.000.003');
  });

  it('copia a observação ativa e não reescreve a ordem já aberta', async () => {
    const created = await open();
    assert.equal(created.statusCode, 201, created.body);
    const order = created.json() as OrderDetail;
    assert.equal(order.notes.find((note) => note.slot === 'line01')?.body, warrantyNote);

    const current = await settings();
    await saveSettings({
      ...current,
      noteLines: current.noteLines.map((line) =>
        line.slot === 'line01' ? { ...line, body: 'Texto novo da garantia.' } : line,
      ),
    });

    const kept = await readOrder(order.id);
    assert.equal(kept.notes.find((note) => note.slot === 'line01')?.body, warrantyNote);

    const later = await open();
    assert.equal(later.statusCode, 201, later.body);
    assert.equal(
      (later.json() as OrderDetail).notes.find((note) => note.slot === 'line01')?.body,
      'Texto novo da garantia.',
    );
  });

  it('guarda o valor do campo desligado e devolve ao religar', async () => {
    const current = await settings();
    await saveSettings({
      ...current,
      fields: current.fields.map((field) =>
        field.slot === 'field06' ? { ...field, isActive: false } : field,
      ),
    });

    const created = await open();
    assert.equal(created.statusCode, 201, created.body);
    const order = created.json() as OrderDetail;
    await save(order, {
      fields: order.fields.map((field) =>
        field.slot === 'field06' ? { ...field, value: 'Almoxarifado' } : field,
      ),
    });

    const reenabled = await settings();
    await saveSettings({
      ...reenabled,
      fields: reenabled.fields.map((field) =>
        field.slot === 'field06' ? { ...field, isActive: true } : field,
      ),
    });

    const readBack = await readOrder(order.id);
    const field06 = readBack.fields.find((field) => field.slot === 'field06');
    assert.equal(field06?.value, 'Almoxarifado');
    assert.equal(field06?.isActive, true);
  });

  it('recusa produto em serviço, técnico em produto e desconto acima da soma', async () => {
    const created = await open();
    assert.equal(created.statusCode, 201, created.body);
    const order = created.json() as OrderDetail;
    const serviceWithProduct = await send(order, {
      lines: [{ kind: 'service', itemId: productId, quantity: '1.0000', unitPrice: '10.0000' }],
    });
    assert.equal(serviceWithProduct.statusCode, 400);

    const productWithTechnician = await send(order, {
      lines: [
        {
          kind: 'product',
          itemId: productId,
          quantity: '1.0000',
          unitPrice: '10.0000',
          technicianPersonId: personId,
        },
      ],
    });
    assert.equal(productWithTechnician.statusCode, 400);

    const discount = await send(order, {
      lines: [{ kind: 'product', itemId: productId, quantity: '1.0000', unitPrice: '10.0000' }],
      discountAmount: 1001,
    });
    assert.equal(discount.statusCode, 400);
  });

  it('entrega com forma mesmo a zero, congela o rótulo e só aceita a nota interna', async () => {
    const created = await open();
    assert.equal(created.statusCode, 201, created.body);
    let detail = created.json() as OrderDetail;
    detail = await save(detail, { status: 'in_progress' });
    detail = await save(detail, { status: 'ready' });

    const withoutMethod = await send(detail, { status: 'delivered' });
    assert.equal(withoutMethod.statusCode, 400);

    detail = await save(detail, {
      status: 'delivered',
      paymentMethodId,
      paymentInstallments: 1,
    });
    assert.ok(detail.deliveredAt);
    assert.ok(detail.labelFrozenAt);
    const frozenLabel = detail.fields.find((field) => field.slot === 'field02')?.label;

    const current = await settings();
    await saveSettings({
      ...current,
      fields: current.fields.map((field) =>
        field.slot === 'field02' ? { ...field, label: 'Fabricante' } : field,
      ),
    });
    const frozen = await readOrder(detail.id);
    assert.equal(frozen.fields.find((field) => field.slot === 'field02')?.label, frozenLabel);

    assert.equal(
      (await send(frozen, {
        lines: [{ kind: 'product', itemId: productId, quantity: '1.0000', unitPrice: '5.0000' }],
      })).statusCode,
      400,
    );
    assert.equal((await send(frozen, { customerName: 'Outro cliente' })).statusCode, 400);
    assert.equal((await send(frozen, { discountAmount: 1 })).statusCode, 400);
    assert.equal(
      (await send(frozen, {
        notes: frozen.notes.map((note) =>
          note.slot === 'line01' ? { ...note, body: 'Texto trocado na ordem.' } : note,
        ),
      })).statusCode,
      400,
    );

    const noted = await save(frozen, { internalNotes: 'Senha 1234' });
    assert.equal(noted.internalNotes, 'Senha 1234');
    assert.equal(noted.fields.find((field) => field.slot === 'field02')?.label, frozenLabel);
  });

  it('recusa item e total numa ordem cancelada', async () => {
    const created = await open();
    assert.equal(created.statusCode, 201, created.body);
    const cancelled = await save(created.json() as OrderDetail, { status: 'cancelled' });
    assert.equal(
      (await send(cancelled, {
        lines: [{ kind: 'product', itemId: productId, quantity: '1.0000', unitPrice: '1.0000' }],
      })).statusCode,
      400,
    );
    assert.equal((await send(cancelled, { surchargeAmount: 10 })).statusCode, 400);
  });

  it('recusa origem em atendimento avulso', async () => {
    const created = await open();
    assert.equal(created.statusCode, 201, created.body);
    const origin = created.json() as OrderDetail;
    const refused = await open({ attendance: 'walk_in', originOrderId: origin.id });
    assert.equal(refused.statusCode, 400);
  });

  it('encontra a primeira ordem pelo número mascarado e pelo dígito', async () => {
    const byMask = await app.inject({
      method: 'GET',
      url: '/service-orders?q=000.000.001',
      headers: headers(),
    });
    assert.equal(byMask.statusCode, 200, byMask.body);
    const masked = byMask.json() as { data: { number: number }[] };
    assert.ok(masked.data.some((row) => row.number === 1));

    const byDigit = await app.inject({
      method: 'GET',
      url: '/service-orders?q=1',
      headers: headers(),
    });
    assert.equal(byDigit.statusCode, 200, byDigit.body);
    const digits = byDigit.json() as { data: { number: number }[] };
    assert.ok(digits.data.some((row) => row.number === 1));
  });
});
