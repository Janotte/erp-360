import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { contractBillingSchedule } from '@erp-360/shared';

import {
  assertBilling,
  assertMutable,
  assertTermKeepsBilledPeriods,
  assertTransition,
  formatContractNumber,
  termExpired,
  type ContractFields,
} from '../src/modules/contracts/rules.ts';

const monthlyCurrentDues = [
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

const monthlyPreviousDues = [
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
  '2027-11-20',
];

function refused(run: () => void, message?: string) {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal((error as Error & { status?: number }).status, 400);
    if (message) assert.equal(error.message, message);
    return true;
  });
}

function schedule(
  billingKind: 'monthly' | 'quarterly' | 'semiannual' | 'annual',
  billingCompetence: 'current' | 'previous',
) {
  return contractBillingSchedule({
    startedOn: '2026-11-01',
    endedOn: '2027-10-31',
    billingKind,
    billingCompetence,
    dueDay: 20,
  });
}

const stored: ContractFields = {
  personId: 'person-1',
  title: 'Manutenção',
  notes: '',
  startedOn: '2026-11-01',
  endedOn: '2027-10-31',
  billingKind: 'monthly',
  billingCompetence: 'current',
  periodAmount: 30_000,
  dueDay: 20,
  paymentMethodId: 'method-1',
  status: 'active',
};

describe('série de vencimentos', () => {
  it('monta os oito calendários de novembro de 2026 a outubro de 2027', () => {
    assert.deepEqual(
      schedule('monthly', 'current').map((row) => row.dueOn),
      monthlyCurrentDues,
    );
    assert.deepEqual(
      schedule('monthly', 'previous').map((row) => row.dueOn),
      monthlyPreviousDues,
    );
    assert.deepEqual(
      schedule('quarterly', 'current').map((row) => row.dueOn),
      ['2026-11-20', '2027-02-20', '2027-05-20', '2027-08-20'],
    );
    assert.deepEqual(
      schedule('quarterly', 'previous').map((row) => row.dueOn),
      ['2027-02-20', '2027-05-20', '2027-08-20', '2027-11-20'],
    );
    assert.deepEqual(
      schedule('semiannual', 'current').map((row) => row.dueOn),
      ['2026-11-20', '2027-05-20'],
    );
    assert.deepEqual(
      schedule('semiannual', 'previous').map((row) => row.dueOn),
      ['2027-05-20', '2027-11-20'],
    );
    assert.deepEqual(schedule('annual', 'current').map((row) => row.dueOn), ['2026-11-20']);
    assert.deepEqual(schedule('annual', 'previous').map((row) => row.dueOn), ['2027-11-20']);
  });

  it('marca a competência no dia 1 do mês inicial do período', () => {
    assert.equal(schedule('monthly', 'current')[0]?.competence, '2026-11-01');
    assert.equal(schedule('quarterly', 'current')[1]?.competence, '2027-02-01');
    assert.equal(schedule('annual', 'previous')[0]?.competence, '2026-11-01');
  });

  it('inclui o mês do fim mesmo quando a vigência começa no meio do mês', () => {
    const rows = contractBillingSchedule({
      startedOn: '2026-11-15',
      endedOn: '2026-11-20',
      billingKind: 'monthly',
      billingCompetence: 'current',
      dueDay: 20,
    });
    assert.deepEqual(rows, [{ competence: '2026-11-01', dueOn: '2026-11-20' }]);
    assert.deepEqual(
      contractBillingSchedule({
        startedOn: '2026-11-15',
        endedOn: '2026-11-20',
        billingKind: 'monthly',
        billingCompetence: 'previous',
        dueDay: 20,
      }),
      [{ competence: '2026-11-01', dueOn: '2026-12-20' }],
    );
  });
});

describe('número e situação do contrato', () => {
  it('agrupa o número de três em três, com pelo menos seis dígitos', () => {
    assert.equal(formatContractNumber(1), '000.001');
    assert.equal(formatContractNumber(1_000_000), '1.000.000');
  });

  it('segue o mapa de situações e recusa saída de encerrado e cancelado', () => {
    assert.doesNotThrow(() => assertTransition('draft', 'draft'));
    assert.doesNotThrow(() => assertTransition('draft', 'active'));
    assert.doesNotThrow(() => assertTransition('draft', 'cancelled'));
    assert.doesNotThrow(() => assertTransition('active', 'suspended'));
    assert.doesNotThrow(() => assertTransition('active', 'closed'));
    assert.doesNotThrow(() => assertTransition('suspended', 'active'));
    assert.doesNotThrow(() => assertTransition('suspended', 'closed'));
    refused(() => assertTransition('draft', 'suspended'));
    refused(() => assertTransition('draft', 'closed'));
    refused(() => assertTransition('active', 'cancelled'));
    refused(() => assertTransition('closed', 'active'));
    refused(() => assertTransition('cancelled', 'draft'));
  });
});

describe('cobrança do contrato', () => {
  it('aceita sem cobrança e a recorrente completa', () => {
    assert.doesNotThrow(() =>
      assertBilling({
        startedOn: '2026-11-01',
        endedOn: null,
        billingKind: 'none',
        billingCompetence: null,
        periodAmount: 0,
        dueDay: null,
      }),
    );
    assert.doesNotThrow(() =>
      assertBilling({
        startedOn: '2026-11-01',
        endedOn: '2027-10-31',
        billingKind: 'monthly',
        billingCompetence: 'current',
        periodAmount: 30_000,
        dueDay: 20,
      }),
    );
  });

  it('recusa recorrente incompleta, dia 29, valor zero e sem cobrança com valor', () => {
    const monthly = {
      startedOn: '2026-11-01',
      endedOn: '2027-10-31' as string | null,
      billingKind: 'monthly' as const,
      billingCompetence: 'current' as const | null,
      periodAmount: 30_000,
      dueDay: 20 as number | null,
    };
    refused(
      () => assertBilling({ ...monthly, dueDay: null }),
      'A cobrança recorrente precisa de valor, dia, competência e fim da vigência.',
    );
    refused(() => assertBilling({ ...monthly, endedOn: null }));
    refused(() => assertBilling({ ...monthly, billingCompetence: null }));
    refused(
      () => assertBilling({ ...monthly, dueDay: 29 }),
      'O dia de vencimento vai de 1 a 28.',
    );
    refused(() => assertBilling({ ...monthly, periodAmount: 0 }));
    refused(
      () =>
        assertBilling({
          startedOn: '2026-11-01',
          endedOn: null,
          billingKind: 'none',
          billingCompetence: null,
          periodAmount: 100,
          dueDay: null,
        }),
      'Contrato sem cobrança não leva valor, dia nem competência.',
    );
    refused(
      () => assertBilling({ ...monthly, startedOn: '2027-11-01' }),
      'O fim da vigência não pode ser anterior ao início.',
    );
  });

  it('recusa encurtar a vigência até deixar um período já cobrado de fora', () => {
    refused(() => assertTermKeepsBilledPeriods('2026-10-31', ['2026-11-01']));
    assert.doesNotThrow(() => assertTermKeepsBilledPeriods('2026-11-30', ['2026-11-01']));
    refused(() => assertTermKeepsBilledPeriods(null, ['2026-11-01']));
    assert.doesNotThrow(() => assertTermKeepsBilledPeriods(null, []));
    assert.doesNotThrow(() => assertTermKeepsBilledPeriods('2026-11-30', []));
  });

  it('avisa vigência vencida só em vigente ou suspenso', () => {
    assert.equal(termExpired('active', '2026-10-31', '2026-11-07'), true);
    assert.equal(termExpired('suspended', '2026-10-31', '2026-11-07'), true);
    assert.equal(termExpired('active', '2026-11-07', '2026-11-07'), false);
    assert.equal(termExpired('active', '2026-12-01', '2026-11-07'), false);
    assert.equal(termExpired('active', null, '2026-11-07'), false);
    assert.equal(termExpired('closed', '2026-10-31', '2026-11-07'), false);
  });

  it('congela cliente, início, periodicidade, competência e forma depois do rascunho', () => {
    assert.doesNotThrow(() =>
      assertMutable(stored, {
        ...stored,
        title: 'Manutenção predial',
        notes: 'Portaria',
        endedOn: '2027-12-31',
        periodAmount: 35_000,
        dueDay: 10,
      }),
    );
    refused(() => assertMutable(stored, { ...stored, personId: 'person-2' }));
    refused(() => assertMutable(stored, { ...stored, startedOn: '2026-12-01' }));
    refused(() => assertMutable(stored, { ...stored, billingKind: 'quarterly' }));
    refused(() => assertMutable(stored, { ...stored, billingCompetence: 'previous' }));
    refused(() => assertMutable(stored, { ...stored, paymentMethodId: null }));
  });

  it('recusa edição de encerrado e cancelado e aceita o mesmo corpo', () => {
    const closed = { ...stored, status: 'closed' as const };
    refused(() => assertMutable(closed, { ...closed, title: 'Outro' }));
    assert.doesNotThrow(() => assertMutable(closed, closed));
    const cancelled = { ...stored, status: 'cancelled' as const };
    refused(
      () => assertMutable(cancelled, { ...cancelled, periodAmount: 1 }),
      'Contrato encerrado ou cancelado não pode ser alterado.',
    );
  });
});
