import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  installmentDueDates,
  splitInstallmentAmounts,
  statementDueDates,
} from './paymentPlan.ts';

describe('plano de pagamento', () => {
  it('deixa o resto nas primeiras parcelas', () => {
    assert.deepEqual(splitInstallmentAmounts(100_000, 3), [33_334, 33_333, 33_333]);
    assert.deepEqual(splitInstallmentAmounts(300, 1), [300]);
  });

  it('conta o vencimento a partir do dia em que o plano é montado', () => {
    assert.deepEqual(installmentDueDates('2026-10-31', 0, 0, 1), ['2026-10-31']);
    assert.deepEqual(installmentDueDates('2026-10-31', 30, 30, 3), [
      '2026-11-30',
      '2026-12-30',
      '2027-01-29',
    ]);
    assert.deepEqual(installmentDueDates('2026-10-31', 8, 30, 2), [
      '2026-11-08',
      '2026-12-08',
    ]);
  });

  it('manda a compra posterior ao fechamento para a fatura seguinte', () => {
    assert.deepEqual(statementDueDates('2026-09-29', 28, 13, 1), ['2026-11-13']);
    assert.deepEqual(statementDueDates('2026-09-28', 28, 13, 1), ['2026-10-13']);
    assert.deepEqual(statementDueDates('2026-09-15', 28, 13, 2), [
      '2026-10-13',
      '2026-11-13',
    ]);
    assert.deepEqual(statementDueDates('2026-09-03', 5, 13, 1), ['2026-09-13']);
    assert.deepEqual(statementDueDates('2026-09-06', 5, 13, 1), ['2026-10-13']);
    assert.deepEqual(statementDueDates('2026-12-29', 28, 13, 2), [
      '2027-02-13',
      '2027-03-13',
    ]);
  });
});
