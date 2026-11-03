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

  it('joga a primeira fatura para o vencimento seguinte quando a compra passa do dia', () => {
    assert.deepEqual(statementDueDates('2026-09-15', 10, 3), [
      '2026-10-10',
      '2026-11-10',
      '2026-12-10',
    ]);
    assert.deepEqual(statementDueDates('2026-09-05', 10, 1), ['2026-09-10']);
    assert.deepEqual(statementDueDates('2026-12-15', 10, 2), [
      '2027-01-10',
      '2027-02-10',
    ]);
  });
});
