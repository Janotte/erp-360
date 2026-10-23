import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { billingInstallments } from '../src/modules/inbound/nfe.ts';

describe('parcelas da NF-e', () => {
  it('usa as duplicatas quando a nota traz o vencimento', () => {
    const installments = billingInstallments(
      {
        fat: { nFat: '207', vOrig: '100.00', vDesc: '0.00', vLiq: '100.00' },
        dup: { nDup: '001', dVenc: '2026-11-23', vDup: '100.00' },
      },
      { detPag: { indPag: '1', tPag: '15', vPag: '100.00' } },
      '2026-10-23',
    );
    assert.deepEqual(installments, [
      { number: '001', dueOn: '2026-11-23', amount: 10000 },
    ]);
  });

  it('transforma a fatura em uma parcela quando não há duplicata', () => {
    const installments = billingInstallments(
      { fat: { nFat: '207', vOrig: '1358.10', vDesc: '0.00', vLiq: '1358.10' } },
      { detPag: { indPag: '1', tPag: '99', xPag: 'BOLETO', vPag: '1358.10' } },
      '2026-10-23',
    );
    assert.deepEqual(installments, [
      { number: '207', dueOn: '2026-10-23', amount: 135810 },
    ]);
  });

  it('usa o pagamento quando a nota não tem cobrança', () => {
    const installments = billingInstallments(
      null,
      { detPag: { indPag: '0', tPag: '01', vPag: '50.00' } },
      '2026-10-23',
    );
    assert.deepEqual(installments, [
      { number: '001', dueOn: '2026-10-23', amount: 5000 },
    ]);
  });
});
