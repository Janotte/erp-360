import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  isValidNfeAccessKey,
  lineUnitCost,
  payableDocumentNumber,
  nextAverage,
  nfeAccessKeyCheckDigit,
  reversedBalance,
} from '../src/modules/inbound/cost.ts';

const flags = {
  freightInCost: true,
  insuranceInCost: true,
  otherInCost: true,
  discountInCost: true,
  ipiInCost: true,
  stInCost: true,
  icmsInCost: false,
};

describe('custo da entrada', () => {
  it('compõe o custo unitário com os marcadores da natureza', () => {
    const cost = lineUnitCost(
      {
        lineAmountCents: 10000,
        freightCents: 500,
        insuranceCents: 0,
        otherCents: 0,
        discountCents: 200,
        ipiCents: 1000,
        stCents: 300,
        icmsCents: 1800,
        stockQty: 10,
      },
      flags,
    );
    assert.equal(cost, 11.6);
  });

  it('assume o custo da nota quando o estoque está zerado', () => {
    assert.equal(nextAverage(0, 8, 4, 10), 10);
    assert.equal(nextAverage(4, 10, 4, 14), 12);
  });

  it('devolve a quantidade sem deixar saldo negativo', () => {
    assert.deepEqual(reversedBalance(10, 12, 4, 14), { quantity: 6, averageCost: 10.6667 });
    assert.equal(reversedBalance(4, 10, 5, 10), null);
  });

  it('monta o documento do pagar com número e série', () => {
    assert.equal(payableDocumentNumber('14263', '4'), '000014263004');
    assert.equal(payableDocumentNumber('000014263', '004'), '000014263004');
  });

  it('confere o dígito da chave da NF-e', () => {
    const base = '3526061122233300018155001000000001100000001';
    const key = `${base}${nfeAccessKeyCheckDigit(base)}`;
    assert.equal(key.length, 44);
    assert.equal(isValidNfeAccessKey(key), true);
    assert.equal(isValidNfeAccessKey(`${key.slice(0, 43)}0`), key.endsWith('0'));
  });
});
