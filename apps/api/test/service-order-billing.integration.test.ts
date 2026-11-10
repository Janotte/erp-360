import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { catalogItems, measures } from '@erp-360/mod-catalog';
import { meansOfPayment, paymentMethods, paymentMethodTerms, paymentPlanLines, paymentPlans, receivables } from '@erp-360/mod-financial';
import { serviceOrderBillings, serviceOrders } from '@erp-360/mod-service-orders';
import { and, eq } from 'drizzle-orm';

import { buildApp } from '../src/app.ts';
import { env } from '../src/config/index.ts';
import { db } from '../src/db/index.ts';
import { todayForTenant } from '../src/modules/contracts/clock.ts';
import { createCompany, removeCompany } from './fixtures.ts';

type Field = { slot: string; value: string | null };
type Note = { slot: string; body: string };
type Line = {
  kind: 'product' | 'service';
  itemId: string;
  quantity: string;
  unitPrice?: string;
};
type Payment = {
  paymentMethodId: string;
  installmentCount: number;
  dueOn: string;
  amount: number;
};
type OrderDetail = {
  id: string;
  number: number;
  numberLabel: string;
  status: string;
  deliveredAt: string | null;
  totalAmount: number;
  paymentMethodId: string | null;
  paymentInstallments: number | null;
  fields: Field[];
  notes: Note[];
  lines: Line[];
  payments?: { methodName: string; dueOn: string; amount: number }[];
  billings?: { documentNumber: string | null }[];
  today?: string;
};

type BillingLine = {
  documentNumber: string | null;
  description: string;
  dueOn: string;
  amount: number;
  status: string;
};

describe('cobrança da ordem de serviço', { concurrency: false }, () => {
  const app = buildApp({ logger: false });
  let token = '';
  let tenantId = '';
  let personId = '';
  let productId = '';
  let cashMethodId = '';
  let pixMethodId = '';
  let blockedMethodId = '';
  let creditMethodId = '';
  let billed: OrderDetail;

  before(async () => {
    assert.equal(env.database.name, 'erp360_test', 'Os testes só rodam no banco erp360_test.');
    await app.ready();
    const company = await createCompany('Cobranca OS');
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
        name: 'PEÇA',
        listPrice: '10.0000',
      })
      .returning({ id: catalogItems.id });
    productId = product.id;

    const means = await db
      .select({ id: meansOfPayment.id, code: meansOfPayment.code })
      .from(meansOfPayment);
    const mean = (code: string) => {
      const found = means.find((row) => row.code === code);
      if (!found) throw new Error(`Meio ${code} não encontrado.`);
      return found.id;
    };

    const [cash] = await db
      .insert(paymentMethods)
      .values({
        tenantId,
        code: 'DIN',
        name: 'Dinheiro',
        meansOfPaymentId: mean('01'),
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

    const [pix] = await db
      .insert(paymentMethods)
      .values({
        tenantId,
        code: 'PIX',
        name: 'PIX',
        meansOfPaymentId: mean('17'),
        receiptKind: 'bank',
        useInServiceOrder: true,
      })
      .returning({ id: paymentMethods.id });
    pixMethodId = pix.id;
    await db.insert(paymentMethodTerms).values({
      tenantId,
      paymentMethodId: pixMethodId,
      installmentCount: 2,
      firstDueDays: 0,
      intervalDays: 30,
    });

    const [blocked] = await db
      .insert(paymentMethods)
      .values({
        tenantId,
        code: 'FORA',
        name: 'Fora da ordem',
        meansOfPaymentId: mean('01'),
        receiptKind: 'cash',
        useInQuote: true,
        useInServiceOrder: false,
      })
      .returning({ id: paymentMethods.id });
    blockedMethodId = blocked.id;
    await db.insert(paymentMethodTerms).values({
      tenantId,
      paymentMethodId: blockedMethodId,
      installmentCount: 1,
    });

    const [credit] = await db
      .insert(paymentMethods)
      .values({
        tenantId,
        code: 'LOJA',
        name: 'Crédito em loja',
        meansOfPaymentId: mean('21'),
        receiptKind: 'store_credit',
        useInServiceOrder: true,
      })
      .returning({ id: paymentMethods.id });
    creditMethodId = credit.id;
    await db.insert(paymentMethodTerms).values({
      tenantId,
      paymentMethodId: creditMethodId,
      installmentCount: 1,
    });
  });

  after(async () => {
    if (tenantId) {
      await db.delete(serviceOrderBillings).where(eq(serviceOrderBillings.tenantId, tenantId));
      await db.delete(receivables).where(eq(receivables.tenantId, tenantId));
      await db.delete(serviceOrders).where(eq(serviceOrders.tenantId, tenantId));
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

  async function deliver(payments: Payment[]) {
    let detail = await open();
    detail = await save(detail, {
      lines: [{ kind: 'product', itemId: productId, quantity: '1.0000', unitPrice: '10.0000' }],
      paymentMethodId: null,
      paymentInstallments: null,
      payments,
    });
    detail = await save(detail, { status: 'in_progress' });
    detail = await save(detail, { status: 'ready' });
    return save(detail, { status: 'delivered' });
  }

  async function bill(id: string, payments: Payment[]) {
    return app.inject({
      method: 'POST',
      url: `/service-orders/${id}/billings`,
      headers: headers(),
      payload: { payments },
    });
  }

  async function titlesOf(orderId: string) {
    return db
      .select({
        debtorId: receivables.debtorId,
        paymentMethodId: receivables.paymentMethodId,
        meansOfPaymentId: receivables.meansOfPaymentId,
        issueOn: receivables.issueOn,
        planAccountId: receivables.planAccountId,
        invoiceNumber: receivables.invoiceNumber,
        installmentAmount: receivables.installmentAmount,
      })
      .from(receivables)
      .innerJoin(
        serviceOrderBillings,
        and(
          eq(serviceOrderBillings.receivableId, receivables.id),
          eq(serviceOrderBillings.tenantId, receivables.tenantId),
        ),
      )
      .where(
        and(eq(serviceOrderBillings.tenantId, tenantId), eq(serviceOrderBillings.serviceOrderId, orderId)),
      );
  }

  const cashPayments: Payment[] = [];

  it('gera um título por parcela e mantém a ordem entregue', async () => {
    cashPayments.push(
      { paymentMethodId: cashMethodId, installmentCount: 1, dueOn: '2026-11-10', amount: 400 },
      { paymentMethodId: cashMethodId, installmentCount: 1, dueOn: '2026-12-10', amount: 600 },
    );
    billed = await deliver(cashPayments);
    assert.equal(billed.numberLabel, '000.001');

    const response = await bill(billed.id, cashPayments);
    assert.equal(response.statusCode, 200, response.body);
    const body = response.json() as { message: string; billings: BillingLine[] };
    assert.equal(body.message, 'Financeiro gerado.');
    assert.deepEqual(
      body.billings.map((line) => ({
        documentNumber: line.documentNumber,
        description: line.description,
        dueOn: line.dueOn,
        amount: line.amount,
        status: line.status,
      })),
      [
        {
          documentNumber: '000001-01',
          description: 'Ordem 000.001 · parcela 1',
          dueOn: '2026-11-10',
          amount: 400,
          status: 'pendente',
        },
        {
          documentNumber: '000001-02',
          description: 'Ordem 000.001 · parcela 2',
          dueOn: '2026-12-10',
          amount: 600,
          status: 'pendente',
        },
      ],
    );

    const titles = await titlesOf(billed.id);
    const today = await todayForTenant(tenantId);
    assert.equal(titles.length, 2);
    for (const title of titles) {
      assert.equal(title.debtorId, personId);
      assert.equal(title.paymentMethodId, cashMethodId);
      assert.ok(title.meansOfPaymentId);
      assert.equal(String(title.issueOn).slice(0, 10), today);
      assert.equal(title.planAccountId, null);
      assert.equal(title.invoiceNumber, null);
    }
    const read = await app.inject({
      method: 'GET',
      url: `/service-orders/${billed.id}`,
      headers: headers(),
    });
    assert.equal((read.json() as OrderDetail).status, 'delivered');
  });

  it('troca o plano pela forma confirmada e grava as datas enviadas', async () => {
    const detail = await deliver([
      { paymentMethodId: cashMethodId, installmentCount: 1, dueOn: '2026-11-10', amount: 1000 },
    ]);
    const payments: Payment[] = [
      { paymentMethodId: pixMethodId, installmentCount: 2, dueOn: '2026-11-10', amount: 500 },
      { paymentMethodId: pixMethodId, installmentCount: 2, dueOn: '2026-12-10', amount: 500 },
    ];
    const response = await bill(detail.id, payments);
    assert.equal(response.statusCode, 200, response.body);
    const body = response.json() as { billings: BillingLine[] };
    assert.deepEqual(
      body.billings.map((line) => ({ dueOn: line.dueOn, amount: line.amount })),
      [
        { dueOn: '2026-11-10', amount: 500 },
        { dueOn: '2026-12-10', amount: 500 },
      ],
    );
    const titles = await titlesOf(detail.id);
    assert.equal(titles.length, 2);
    assert.ok(titles.every((title) => title.paymentMethodId === pixMethodId));
    const lines = await db
      .select({ name: paymentPlanLines.methodName, amount: paymentPlanLines.amount })
      .from(paymentPlanLines)
      .innerJoin(serviceOrders, eq(serviceOrders.paymentPlanId, paymentPlanLines.planId))
      .where(eq(serviceOrders.id, detail.id));
    assert.deepEqual(
      lines.map((line) => ({ name: line.name, amount: line.amount })),
      [
        { name: 'PIX', amount: 500 },
        { name: 'PIX', amount: 500 },
      ],
    );
  });

  it('não cria outro título quando a cobrança já existe', async () => {
    const again = await bill(billed.id, [
      { paymentMethodId: pixMethodId, installmentCount: 2, dueOn: '2026-11-10', amount: 500 },
      { paymentMethodId: pixMethodId, installmentCount: 2, dueOn: '2026-12-10', amount: 500 },
    ]);
    assert.equal(again.statusCode, 409, again.body);
    const body = again.json() as { message: string; billings: BillingLine[] };
    assert.equal(body.message, 'O financeiro desta ordem já foi gerado.');
    assert.equal(body.billings[0]?.documentNumber, '000001-01');
    assert.equal((await titlesOf(billed.id)).length, 2);
    const read = await app.inject({
      method: 'GET',
      url: `/service-orders/${billed.id}`,
      headers: headers(),
    });
    const payments = (read.json() as OrderDetail).payments ?? [];
    assert.deepEqual(
      payments.map((line) => line.amount),
      [400, 600],
    );
  });

  it('não libera a parcela quando o título é cancelado no financeiro', async () => {
    await db
      .update(receivables)
      .set({ status: 'cancelado' })
      .where(
        and(eq(receivables.tenantId, tenantId), eq(receivables.documentNumber, '000001-01')),
      );
    const again = await bill(billed.id, cashPayments);
    assert.equal(again.statusCode, 409, again.body);
    const links = await db
      .select({ id: serviceOrderBillings.id })
      .from(serviceOrderBillings)
      .where(
        and(
          eq(serviceOrderBillings.tenantId, tenantId),
          eq(serviceOrderBillings.serviceOrderId, billed.id),
        ),
      );
    assert.equal(links.length, 2);
  });

  it('recusa ordem que não está entregue', async () => {
    let detail = await open();
    detail = await save(detail, {
      lines: [{ kind: 'product', itemId: productId, quantity: '1.0000', unitPrice: '10.0000' }],
      payments: [
        { paymentMethodId: cashMethodId, installmentCount: 1, dueOn: '2026-11-10', amount: 1000 },
      ],
    });
    detail = await save(detail, { status: 'in_progress' });
    detail = await save(detail, { status: 'ready' });
    const response = await bill(detail.id, [
      { paymentMethodId: cashMethodId, installmentCount: 1, dueOn: '2026-11-10', amount: 1000 },
    ]);
    assert.equal(response.statusCode, 400, response.body);
    assert.match(response.body, /A ordem precisa estar entregue para gerar o financeiro/);
    assert.equal((await titlesOf(detail.id)).length, 0);
  });

  it('recusa total zero', async () => {
    let detail = await open();
    detail = await save(detail, { status: 'in_progress' });
    detail = await save(detail, { status: 'ready' });
    detail = await save(detail, {
      status: 'delivered',
      paymentMethodId: cashMethodId,
      paymentInstallments: 1,
    });
    assert.equal(detail.totalAmount, 0);
    const response = await bill(detail.id, []);
    assert.equal(response.statusCode, 400, response.body);
    assert.match(response.body, /Ordem com total zero não gera financeiro/);
  });

  it('recusa soma diferente, parcela sem valor, forma indisponível e crédito em loja', async () => {
    const detail = await deliver([
      { paymentMethodId: cashMethodId, installmentCount: 1, dueOn: '2026-11-10', amount: 1000 },
    ]);
    const sum = await bill(detail.id, [
      { paymentMethodId: cashMethodId, installmentCount: 1, dueOn: '2026-11-10', amount: 900 },
    ]);
    assert.equal(sum.statusCode, 400, sum.body);
    assert.match(sum.body, /A soma das parcelas precisa ser igual ao total da ordem/);

    const empty = await bill(detail.id, [
      { paymentMethodId: cashMethodId, installmentCount: 1, dueOn: '2026-11-10', amount: 0 },
    ]);
    assert.equal(empty.statusCode, 400, empty.body);
    assert.match(empty.body, /A parcela precisa ter valor/);

    const blocked = await bill(detail.id, [
      { paymentMethodId: blockedMethodId, installmentCount: 1, dueOn: '2026-11-10', amount: 1000 },
    ]);
    assert.equal(blocked.statusCode, 400, blocked.body);
    assert.match(blocked.body, /A forma de pagamento não está disponível para a ordem/);

    const credit = await bill(detail.id, [
      { paymentMethodId: creditMethodId, installmentCount: 1, dueOn: '2026-11-10', amount: 1000 },
    ]);
    assert.equal(credit.statusCode, 400, credit.body);
    assert.match(credit.body, /Crédito em loja não entra na ordem/);

    assert.equal((await titlesOf(detail.id)).length, 0);
    const read = await app.inject({
      method: 'GET',
      url: `/service-orders/${detail.id}`,
      headers: headers(),
    });
    const payments = (read.json() as OrderDetail).payments ?? [];
    assert.deepEqual(
      payments.map((line) => ({ amount: line.amount, name: line.methodName })),
      [{ amount: 1000, name: 'Dinheiro' }],
    );
  });
});
