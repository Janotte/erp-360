import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  cardStatement,
  type CardChargeInput,
} from '../src/modules/treasury/card-statement.ts';

function charge(
  partial: Partial<CardChargeInput> & Pick<CardChargeInput, 'id'>,
): CardChargeInput {
  return {
    issueOn: '2026-11-01',
    dueOn: '2026-12-10',
    description: 'Compra',
    supplierName: null,
    documentNumber: null,
    documentSeries: null,
    installmentNumber: null,
    documentId: null,
    amount: 1000,
    status: 'pendente',
    ...partial,
  };
}

describe('extrato do cartão', () => {
  it('nomeia a nota, o fornecedor e a parcela', () => {
    const statement = cardStatement([
      charge({
        id: 'b',
        supplierName: 'Papelaria',
        documentNumber: '000014263',
        documentSeries: '004',
        installmentNumber: '02',
        documentId: 'doc',
      }),
    ]);
    assert.equal(statement.entries[0]?.description, 'NF 14263/4 · Papelaria · parcela 2');
    assert.equal(statement.entries[0]?.documentId, 'doc');
  });

  it('soma só o que ainda está em aberto e mostra o mais recente primeiro', () => {
    const statement = cardStatement([
      charge({ id: 'pago', issueOn: '2026-11-03', amount: 300, status: 'pago' }),
      charge({ id: 'novo', issueOn: '2026-11-05', amount: 500, status: 'pendente' }),
      charge({ id: 'antigo', issueOn: '2026-11-01', amount: 200, status: 'pendente' }),
      charge({
        id: 'cancelado',
        issueOn: '2026-11-04',
        amount: 900,
        status: 'cancelado',
      }),
    ]);
    assert.equal(statement.openBalance, 700);
    assert.deepEqual(
      statement.entries.map((entry) => [entry.id, entry.balance]),
      [
        ['novo', 700],
        ['cancelado', 200],
        ['pago', 200],
        ['antigo', 200],
      ],
    );
  });
});
