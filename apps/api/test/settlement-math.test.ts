import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  addDays,
  applyBps,
  computeDueAmount,
  computeSettlementGaps,
  daysBetween,
  settlementTreasuryLegs,
} from '../src/modules/titles/settlement-math.ts';

const originalAmount = 100_000;

describe('cálculo da liquidação', () => {
  it('conta dias civis e soma dias no calendário', () => {
    assert.equal(daysBetween('2026-10-01', '2026-10-01'), 0);
    assert.equal(daysBetween('2026-10-01', '2026-10-11'), 10);
    assert.equal(daysBetween('2026-10-11', '2026-10-01'), -10);
    assert.equal(addDays('2026-10-16', 30), '2026-11-15');
    assert.equal(addDays('2026-01-31', 1), '2026-02-01');
    assert.equal(addDays('2024-02-28', 1), '2024-02-29');
  });

  it('arredonda basis points para o centavo mais próximo', () => {
    assert.equal(applyBps(originalAmount, 200), 2_000);
    assert.equal(applyBps(originalAmount, 15), 150);
    assert.equal(applyBps(33_333, 200), 667);
  });

  it('não cobra multa nem juros de conta a pagar atrasada', () => {
    const due = computeDueAmount({
      kind: 'payable',
      originalAmount,
      dueOn: '2026-10-01',
      settledOn: '2026-10-11',
      lateFeeBps: 200,
      dailyInterestBps: 3,
      graceDays: 0,
      waiveCharges: false,
    });

    assert.deepEqual(due, {
      daysLate: 10,
      chargeableDays: 0,
      fineAmount: 0,
      interestAmount: 0,
      dueAmount: originalAmount,
    });
  });

  it('isenta o recebimento dentro da carência e cobra depois dela', () => {
    const withinGrace = computeDueAmount({
      kind: 'receivable',
      originalAmount,
      dueOn: '2026-10-01',
      settledOn: '2026-10-04',
      lateFeeBps: 200,
      dailyInterestBps: 3,
      graceDays: 5,
      waiveCharges: false,
    });
    assert.equal(withinGrace.daysLate, 3);
    assert.equal(withinGrace.chargeableDays, 0);
    assert.equal(withinGrace.fineAmount, 0);
    assert.equal(withinGrace.interestAmount, 0);
    assert.equal(withinGrace.dueAmount, originalAmount);

    const pastGrace = computeDueAmount({
      kind: 'receivable',
      originalAmount,
      dueOn: '2026-10-01',
      settledOn: '2026-10-11',
      lateFeeBps: 200,
      dailyInterestBps: 3,
      graceDays: 5,
      waiveCharges: false,
    });
    assert.equal(pastGrace.daysLate, 10);
    assert.equal(pastGrace.chargeableDays, 5);
    assert.equal(pastGrace.fineAmount, 2_000);
    assert.equal(pastGrace.interestAmount, 150);
    assert.equal(pastGrace.dueAmount, 102_150);
  });

  it('zera encargos quando o recebimento perdoa multa e juros', () => {
    const due = computeDueAmount({
      kind: 'receivable',
      originalAmount,
      dueOn: '2026-10-01',
      settledOn: '2026-10-11',
      lateFeeBps: 200,
      dailyInterestBps: 3,
      graceDays: 0,
      waiveCharges: true,
    });

    assert.equal(due.daysLate, 10);
    assert.equal(due.chargeableDays, 0);
    assert.equal(due.dueAmount, originalAmount);
  });

  it('separa restante e trata o excedente do recebimento atrasado sobre o valor original', () => {
    assert.deepEqual(
      computeSettlementGaps({
        kind: 'payable',
        originalAmount,
        dueAmount: originalAmount,
        settledAmount: 60_000,
        daysLate: 0,
        waiveCharges: false,
      }),
      { remainder: 40_000, extra: -40_000 },
    );

    assert.deepEqual(
      computeSettlementGaps({
        kind: 'receivable',
        originalAmount,
        dueAmount: 102_150,
        settledAmount: 102_150,
        daysLate: 10,
        waiveCharges: false,
      }),
      { remainder: 0, extra: 2_150 },
    );
  });

  it('monta os lançamentos de caixa do valor pago, da diferença e do excedente', () => {
    const plan = '11111111-1111-4111-8111-111111111111';
    const difference = '22222222-2222-4222-8222-222222222222';

    assert.deepEqual(
      settlementTreasuryLegs({
        kind: 'payable',
        settledAmount: 60_000,
        remainder: 0,
        extra: 0,
        remainderMode: 'none',
        titlePlanAccountId: plan,
        differencePlanAccountId: null,
        description: 'Aluguel',
      }),
      [
        {
          planAccountId: plan,
          description: 'Aluguel',
          inflowAmount: 0,
          outflowAmount: 60_000,
        },
      ],
    );

    assert.deepEqual(
      settlementTreasuryLegs({
        kind: 'receivable',
        settledAmount: 60_000,
        remainder: 40_000,
        extra: 0,
        remainderMode: 'plan_account',
        titlePlanAccountId: plan,
        differencePlanAccountId: difference,
        description: 'Mensalidade',
      }),
      [
        {
          planAccountId: plan,
          description: 'Mensalidade',
          inflowAmount: 100_000,
          outflowAmount: 0,
        },
        {
          planAccountId: difference,
          description: 'Mensalidade (diferença)',
          inflowAmount: 0,
          outflowAmount: 40_000,
        },
      ],
    );

    const longDescription = 'a'.repeat(300);
    const legs = settlementTreasuryLegs({
      kind: 'payable',
      settledAmount: 120_000,
      remainder: 0,
      extra: 20_000,
      remainderMode: 'none',
      titlePlanAccountId: plan,
      differencePlanAccountId: difference,
      description: longDescription,
    });
    assert.equal(legs[0]?.outflowAmount, 100_000);
    assert.equal(legs[1]?.outflowAmount, 20_000);
    assert.equal(legs[1]?.description.length, 255);
  });
});
