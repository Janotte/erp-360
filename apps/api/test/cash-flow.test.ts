import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildCashFlow } from '../src/modules/treasury/cash-flow.ts';

const receivable = {
  id: 'r1',
  documentNumber: '17614',
  personName: 'Catarinense',
  description: 'NF-e 17614',
  amount: 285533,
  dueOn: '2026-10-23',
  phone: '4734246752',
  bearerName: 'Sicredi',
};

describe('fluxo de caixa', () => {
  it('projeta o saldo do dia sem misturar títulos atrasados', () => {
    const report = buildCashFlow({
      today: '2026-10-23',
      days: 3,
      cashBalance: 135608,
      banks: [
        { name: 'Banco Inter', balance: 1702926 },
        { name: 'Sicredi', balance: 4118948 },
      ],
      receivables: [
        receivable,
        { ...receivable, id: 'late', dueOn: '2026-10-22', amount: 10000 },
        { ...receivable, id: 'later', dueOn: '2026-10-26', amount: 5000 },
      ],
      payables: [
        {
          id: 'p1',
          documentNumber: '99',
          personName: 'Fornecedor',
          description: 'Aluguel',
          amount: 49200,
          dueOn: '2026-10-24',
          phone: null,
          bearerName: null,
        },
      ],
    });

    assert.equal(report.openingBalance, 135608 + 1702926 + 4118948);
    assert.equal(report.from, '2026-10-23');
    assert.equal(report.to, '2026-10-25');
    assert.equal(report.overdueReceivables.length, 1);
    assert.equal(report.overdueReceivables[0]?.id, 'late');
    assert.equal(report.days.length, 3);

    const [friday, saturday, sunday] = report.days;
    assert.equal(friday?.weekday, 5);
    assert.equal(friday?.inflows, 285533);
    assert.equal(friday?.outflows, 0);
    assert.equal(friday?.difference, 285533);
    assert.equal(friday?.balance, report.openingBalance + 285533);
    assert.equal(friday?.receivables.length, 1);

    assert.equal(saturday?.weekday, 6);
    assert.equal(saturday?.outflows, 49200);
    assert.equal(saturday?.difference, -49200);
    assert.equal(saturday?.balance, friday!.balance - 49200);

    assert.equal(sunday?.inflows, 0);
    assert.equal(sunday?.balance, saturday?.balance);
    assert.deepEqual(report.totals, {
      inflows: 285533,
      outflows: 49200,
      difference: 236333,
    });
  });
});
