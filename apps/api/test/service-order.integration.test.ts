import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

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
