import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { contractCounters, contracts } from '@erp-360/mod-contracts';
import { meansOfPayment, paymentMethods } from '@erp-360/mod-financial';
import { persons } from '@erp-360/mod-persons';
import { addCivilDays, civilDate } from '@erp-360/shared';
import { eq } from 'drizzle-orm';

import { buildApp } from '../src/app.ts';
import { env } from '../src/config/index.ts';
import { db } from '../src/db/index.ts';
import { createCompany, removeCompany } from './fixtures.ts';

type ContractBody = {
  personId: string;
  title: string;
  startedOn: string;
  endedOn: string | null;
  billingKind: 'none' | 'monthly' | 'quarterly' | 'semiannual' | 'annual';
  billingCompetence: 'current' | 'previous' | null;
  periodAmount: number;
  dueDay: number | null;
  paymentMethodId: string | null;
  notes: string;
};

type ContractEvent = {
  kind: string;
  fromStatus: string | null;
  toStatus: string;
  billingKind: string;
  billingCompetence: string | null;
  periodAmount: number;
  dueDay: number | null;
  reason: string | null;
  actorName: string;
};

type ContractDetail = ContractBody & {
  id: string;
  number: number;
  numberLabel: string;
  status: string;
  customerName: string;
  suspensionReason: string | null;
  closedOn: string | null;
  termExpired: boolean;
  schedule: { competence: string; dueOn: string }[];
  events: ContractEvent[];
  orders: unknown[];
};

const monthlyDues = [
  '2026-11-20',
  '2026-12-20',
  '2027-01-20',
  '2027-02-20',
  '2027-03-20',
  '2027-04-20',
  '2027-05-20',
  '2027-06-20',
  '2027-07-20',
  '2027-08-20',
  '2027-09-20',
  '2027-10-20',
];

describe('cadastro do contrato', { concurrency: false }, () => {
  const app = buildApp({ logger: false });
  let token = '';
  let tenantId = '';
  let personId = '';
  let otherTenantId = '';
  let paymentMethodId = '';

  before(async () => {
    assert.equal(env.database.name, 'erp360_test', 'Os testes só rodam no banco erp360_test.');
    await app.ready();
    const company = await createCompany('Contrato');
    tenantId = company.tenantId;
    personId = company.personId;
    token = app.jwt.sign({ userId: company.userId, tenantId });

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
  });

  after(async () => {
    if (tenantId) {
      await db.delete(contracts).where(eq(contracts.tenantId, tenantId));
      await db.delete(contractCounters).where(eq(contractCounters.tenantId, tenantId));
      await db.delete(paymentMethods).where(eq(paymentMethods.tenantId, tenantId));
      await removeCompany(tenantId);
    }
    if (otherTenantId) await removeCompany(otherTenantId);
    await app.close();
  });

  function headers() {
    return { authorization: `Bearer ${token}` };
  }

  function noneBody(overrides: Partial<ContractBody> = {}): ContractBody {
    return {
      personId,
      title: 'Sem cobrança',
      startedOn: '2026-11-01',
      endedOn: null,
      billingKind: 'none',
      billingCompetence: null,
      periodAmount: 0,
      dueDay: null,
      paymentMethodId: null,
      notes: '',
      ...overrides,
    };
  }

  function monthlyBody(overrides: Partial<ContractBody> = {}): ContractBody {
    return {
      personId,
      title: 'Mensal',
      startedOn: '2026-11-01',
      endedOn: '2027-10-31',
      billingKind: 'monthly',
      billingCompetence: 'current',
      periodAmount: 30_000,
      dueDay: 20,
      paymentMethodId: null,
      notes: '',
      ...overrides,
    };
  }

  async function create(body: ContractBody) {
    return app.inject({
      method: 'POST',
      url: '/contracts',
      headers: headers(),
      payload: body,
    });
  }

  async function update(
    id: string,
    body: ContractBody & { status: string; suspensionReason: string | null },
  ) {
    return app.inject({
      method: 'PUT',
      url: `/contracts/${id}`,
      headers: headers(),
      payload: body,
    });
  }

  async function open(body: ContractBody) {
    const response = await create(body);
    assert.equal(response.statusCode, 201, response.body);
    return response.json() as ContractDetail;
  }

  it('não reaproveita o número de um contrato cancelado', async () => {
    const first = await open(noneBody({ title: 'Portaria norte' }));
    const second = await open(noneBody({ title: 'Portaria sul' }));
    assert.equal(first.numberLabel, '000.001');
    assert.equal(second.numberLabel, '000.002');
    assert.equal(first.status, 'draft');
    assert.equal(first.events[0]?.fromStatus, null);
    assert.equal(first.events[0]?.toStatus, 'draft');
    assert.equal(first.events[0]?.kind, 'status');
    assert.equal(first.events[0]?.actorName, 'Contrato');

    const cancelled = await update(first.id, {
      ...noneBody({ title: 'Portaria norte' }),
      status: 'cancelled',
      suspensionReason: null,
    });
    assert.equal(cancelled.statusCode, 200, cancelled.body);
    const third = await open(noneBody());
    assert.equal(third.numberLabel, '000.003');
  });

  it('recusa cliente inativo, sem papel de cliente ou de outra empresa', async () => {
    await db.update(persons).set({ isActive: false }).where(eq(persons.id, personId));
    try {
      const inactive = await create(noneBody());
      assert.equal(inactive.statusCode, 400);
    } finally {
      await db.update(persons).set({ isActive: true }).where(eq(persons.id, personId));
    }

    const [otherRole] = await db
      .insert(persons)
      .values({ tenantId, name: 'Fornecedor só', isClient: false, isSupplier: true })
      .returning({ id: persons.id });
    const refusedRole = await create(noneBody({ personId: otherRole.id }));
    assert.equal(refusedRole.statusCode, 400);

    const other = await createCompany('Outra');
    otherTenantId = other.tenantId;
    const foreign = await create(noneBody({ personId: other.personId }));
    assert.equal(foreign.statusCode, 400);
  });

  it('recusa mensal sem fim e sem cobrança com valor', async () => {
    const missingEnd = await create(monthlyBody({ endedOn: null }));
    assert.equal(missingEnd.statusCode, 400);
    const priced = await create(noneBody({ periodAmount: 100 }));
    assert.equal(priced.statusCode, 400);
    const openEnded = await open(noneBody());
    assert.equal(openEnded.endedOn, null);
    assert.deepEqual(openEnded.schedule, []);
  });

  it('ativa o mensal e mostra os doze vencimentos', async () => {
    const draft = await open(monthlyBody({ paymentMethodId }));
    const response = await update(draft.id, {
      ...monthlyBody({ paymentMethodId }),
      status: 'active',
      suspensionReason: null,
    });
    assert.equal(response.statusCode, 200, response.body);
    const active = response.json() as ContractDetail;
    assert.equal(active.status, 'active');
    assert.equal(active.schedule.length, 12);
    assert.equal(active.schedule[0]?.dueOn, '2026-11-20');
    assert.equal(active.schedule[11]?.dueOn, '2027-10-20');
    assert.deepEqual(
      active.schedule.map((row) => row.dueOn),
      monthlyDues,
    );
  });

  it('grava a troca de periodicidade no rascunho', async () => {
    const draft = await open(monthlyBody({ title: 'Troca de período' }));
    const response = await update(draft.id, {
      ...monthlyBody({
        title: 'Troca de período',
        billingKind: 'quarterly',
        billingCompetence: 'previous',
      }),
      status: 'draft',
      suspensionReason: null,
    });
    assert.equal(response.statusCode, 200, response.body);
    const saved = response.json() as ContractDetail;
    assert.equal(saved.events[0]?.kind, 'billing');
    assert.equal(saved.events[0]?.billingKind, 'quarterly');
    assert.equal(saved.events[0]?.billingCompetence, 'previous');
    assert.deepEqual(
      saved.schedule.map((row) => row.dueOn),
      ['2027-02-20', '2027-05-20', '2027-08-20', '2027-11-20'],
    );
  });

  it('congela o núcleo depois da ativação e guarda o valor anterior', async () => {
    const draft = await open(monthlyBody({ title: 'Valor', periodAmount: 30_000 }));
    const activated = await update(draft.id, {
      ...monthlyBody({ title: 'Valor', periodAmount: 30_000 }),
      status: 'active',
      suspensionReason: null,
    });
    assert.equal(activated.statusCode, 200, activated.body);
    const active = activated.json() as ContractDetail;

    const [other] = await db
      .insert(persons)
      .values({ tenantId, name: 'Outro cliente', isClient: true })
      .returning({ id: persons.id });
    for (const body of [
      monthlyBody({ title: 'Valor', personId: other.id }),
      monthlyBody({ title: 'Valor', startedOn: '2026-12-01' }),
      monthlyBody({ title: 'Valor', billingKind: 'annual' }),
      monthlyBody({ title: 'Valor', billingCompetence: 'previous' }),
      monthlyBody({ title: 'Valor', paymentMethodId }),
    ]) {
      const refused = await update(active.id, { ...body, status: 'active', suspensionReason: null });
      assert.equal(refused.statusCode, 400, refused.body);
    }

    const saved = await update(active.id, {
      ...monthlyBody({ title: 'Valor novo', notes: 'Portaria', periodAmount: 35_000, dueDay: 10 }),
      status: 'active',
      suspensionReason: null,
    });
    assert.equal(saved.statusCode, 200, saved.body);
    const detail = saved.json() as ContractDetail;
    assert.equal(detail.events[0]?.kind, 'billing');
    assert.equal(detail.events[0]?.periodAmount, 35_000);
    const activation = detail.events.find((event) => event.toStatus === 'active' && event.kind === 'status');
    assert.equal(activation?.periodAmount, 30_000);
  });

  it('suspende com motivo, retoma e encerrar preenche as datas', async () => {
    const draft = await open(monthlyBody({ title: 'Suspensão', endedOn: '2027-12-31' }));
    const active = await update(draft.id, {
      ...monthlyBody({ title: 'Suspensão', endedOn: '2027-12-31' }),
      status: 'active',
      suspensionReason: null,
    });
    assert.equal(active.statusCode, 200, active.body);
    const id = (active.json() as ContractDetail).id;

    const missing = await update(id, {
      ...monthlyBody({ title: 'Suspensão', endedOn: '2027-12-31' }),
      status: 'suspended',
      suspensionReason: null,
    });
    assert.equal(missing.statusCode, 400);
    assert.equal((missing.json() as { message: string }).message, 'Informe o motivo da suspensão.');

    const suspended = await update(id, {
      ...monthlyBody({ title: 'Suspensão', endedOn: '2027-12-31' }),
      status: 'suspended',
      suspensionReason: 'Obra parada',
    });
    assert.equal(suspended.statusCode, 200, suspended.body);
    const paused = suspended.json() as ContractDetail;
    assert.equal(paused.suspensionReason, 'Obra parada');
    assert.equal(paused.events[0]?.kind, 'status');
    assert.equal(paused.events[0]?.reason, 'Obra parada');

    const resumed = await update(id, {
      ...monthlyBody({ title: 'Suspensão', endedOn: '2027-12-31' }),
      status: 'active',
      suspensionReason: null,
    });
    assert.equal(resumed.statusCode, 200, resumed.body);
    assert.equal((resumed.json() as ContractDetail).suspensionReason, null);

    const closed = await update(id, {
      ...monthlyBody({ title: 'Suspensão', endedOn: '2027-12-31' }),
      status: 'closed',
      suspensionReason: null,
    });
    assert.equal(closed.statusCode, 200, closed.body);
    const finished = closed.json() as ContractDetail;
    assert.equal(finished.status, 'closed');
    assert.equal(finished.endedOn, '2027-12-31');
    assert.equal(finished.closedOn, civilDate());

    const renamed = await update(id, {
      ...monthlyBody({ title: 'Outro', endedOn: '2027-12-31' }),
      status: 'closed',
      suspensionReason: null,
    });
    assert.equal(renamed.statusCode, 400);

    const openEnded = await open(noneBody({ title: 'Prazo aberto' }));
    const activatedOpen = await update(openEnded.id, {
      ...noneBody({ title: 'Prazo aberto' }),
      status: 'active',
      suspensionReason: null,
    });
    assert.equal(activatedOpen.statusCode, 200, activatedOpen.body);
    const closedOpen = await update(openEnded.id, {
      ...noneBody({ title: 'Prazo aberto' }),
      status: 'closed',
      suspensionReason: null,
    });
    assert.equal(closedOpen.statusCode, 200, closedOpen.body);
    const finishedOpen = closedOpen.json() as ContractDetail;
    assert.equal(finishedOpen.endedOn, civilDate());
    assert.equal(finishedOpen.closedOn, civilDate());
  });

  it('marca vigência vencida sem mudar a situação', async () => {
    const today = civilDate();
    const endedOn = addCivilDays(today, -1);
    const startedOn = addCivilDays(endedOn, -40);
    const draft = await open(
      monthlyBody({ title: 'Vencido', startedOn, endedOn, billingCompetence: 'current' }),
    );
    const response = await update(draft.id, {
      ...monthlyBody({ title: 'Vencido', startedOn, endedOn }),
      status: 'active',
      suspensionReason: null,
    });
    assert.equal(response.statusCode, 200, response.body);
    const detail = response.json() as ContractDetail;
    assert.equal(detail.status, 'active');
    assert.equal(detail.termExpired, true);
  });

  it('encontra pelo número, pelo título, pelo cliente e pelos filtros', async () => {
    const byMask = await app.inject({
      method: 'GET',
      url: '/contracts?q=000.001',
      headers: headers(),
    });
    assert.equal(byMask.statusCode, 200, byMask.body);
    const masked = byMask.json() as { data: { numberLabel: string; title: string }[] };
    assert.equal(masked.data.some((row) => row.numberLabel === '000.001'), true);

    const byDigit = await app.inject({
      method: 'GET',
      url: '/contracts?q=1',
      headers: headers(),
    });
    const digits = byDigit.json() as { data: { number: number }[] };
    assert.equal(digits.data.some((row) => row.number === 1), true);

    const byTitle = await app.inject({
      method: 'GET',
      url: '/contracts?q=Portaria%20norte',
      headers: headers(),
    });
    const titles = byTitle.json() as { data: { title: string }[] };
    assert.equal(titles.data.length, 1);
    assert.equal(titles.data[0]?.title, 'Portaria norte');

    const byCustomer = await app.inject({
      method: 'GET',
      url: '/contracts?q=Contrato',
      headers: headers(),
    });
    const customers = byCustomer.json() as { data: { customerName: string }[] };
    assert.equal(customers.data.every((row) => row.customerName === 'Contrato'), true);
    assert.equal(customers.data.length > 0, true);

    const [second] = await db
      .insert(persons)
      .values({ tenantId, name: 'Cliente filtro', isClient: true })
      .returning({ id: persons.id });
    await open(noneBody({ personId: second.id, title: 'Do outro cliente' }));

    const byPerson = await app.inject({
      method: 'GET',
      url: `/contracts?personId=${second.id}`,
      headers: headers(),
    });
    const people = byPerson.json() as { data: { personId: string }[] };
    assert.equal(people.data.length, 1);
    assert.equal(people.data[0]?.personId, second.id);

    const byStatus = await app.inject({
      method: 'GET',
      url: '/contracts?status=cancelled',
      headers: headers(),
    });
    const cancelled = byStatus.json() as { data: { status: string; numberLabel: string }[] };
    assert.equal(cancelled.data.every((row) => row.status === 'cancelled'), true);
    assert.equal(cancelled.data.some((row) => row.numberLabel === '000.001'), true);
  });

  it('recusa forma inativa, fora da ordem e crédito em loja', async () => {
    const [cash] = await db
      .select({ id: meansOfPayment.id })
      .from(meansOfPayment)
      .where(eq(meansOfPayment.code, '01'))
      .limit(1);
    const [inactive] = await db
      .insert(paymentMethods)
      .values({
        tenantId,
        code: 'OFF',
        name: 'Inativa',
        meansOfPaymentId: cash.id,
        receiptKind: 'cash',
        isActive: false,
        useInServiceOrder: true,
      })
      .returning({ id: paymentMethods.id });
    const [otherChannel] = await db
      .insert(paymentMethods)
      .values({
        tenantId,
        code: 'VENDA',
        name: 'Só venda',
        meansOfPaymentId: cash.id,
        receiptKind: 'cash',
        useInServiceOrder: false,
      })
      .returning({ id: paymentMethods.id });
    const [credit] = await db
      .insert(paymentMethods)
      .values({
        tenantId,
        code: 'LOJA',
        name: 'Crédito',
        meansOfPaymentId: cash.id,
        receiptKind: 'store_credit',
        useInServiceOrder: true,
      })
      .returning({ id: paymentMethods.id });

    assert.equal((await create(noneBody({ paymentMethodId: inactive.id }))).statusCode, 400);
    assert.equal((await create(noneBody({ paymentMethodId: otherChannel.id }))).statusCode, 400);
    const storeCredit = await create(noneBody({ paymentMethodId: credit.id }));
    assert.equal(storeCredit.statusCode, 400);
    assert.equal(
      (storeCredit.json() as { message: string }).message,
      'Crédito em loja não entra no contrato.',
    );
  });

  it('devolve o histórico do mais recente para o mais antigo', async () => {
    const byMask = await app.inject({
      method: 'GET',
      url: '/contracts?q=000.001',
      headers: headers(),
    });
    const listed = byMask.json() as { data: { id: string }[] };
    const response = await app.inject({
      method: 'GET',
      url: `/contracts/${listed.data[0]?.id}`,
      headers: headers(),
    });
    assert.equal(response.statusCode, 200, response.body);
    const detail = response.json() as ContractDetail;
    const instants = detail.events.map((event) => event);
    assert.equal(instants.length >= 1, true);
    assert.equal(instants[instants.length - 1]?.toStatus, 'draft');
    assert.equal(instants[instants.length - 1]?.fromStatus, null);
    assert.deepEqual(detail.orders, []);
  });
});
