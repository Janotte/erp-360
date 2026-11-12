import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  listPriceFromMargin,
  marginFromListPrice,
  projectedAverage,
  syncPricing,
} from './pricing.ts';

describe('preço de lista pela margem sobre a venda', () => {
  it('projeta o custo médio do exemplo', () => {
    assert.equal(projectedAverage(10, 50, [{ quantity: 20, unitCost: 65 }]), 60);
  });

  it('calcula 45% de 60 como 109,0909 e o caminho de volta', () => {
    assert.equal(listPriceFromMargin(60, 45), 109.0909);
    assert.equal(marginFromListPrice(60, 109.0909), 45);
  });

  it('não recupera 569,0000 com o custo 390,99 da licença', () => {
    const margin = marginFromListPrice(390.99, 569);
    assert.equal(margin, 31.2847);
    assert.equal(listPriceFromMargin(390.99, margin), 568.9999);
  });

  it('recusa margem de 100% e preço abaixo do custo', () => {
    assert.equal(listPriceFromMargin(60, 100), null);
    assert.equal(marginFromListPrice(60, 59.99), null);
  });

  it('deriva o preço quando a margem é a fonte', () => {
    assert.deepEqual(
      syncPricing({
        average: 60,
        marginPercent: 45,
        price: null,
        edited: 'none',
        emptyPriceWithoutCost: true,
      }),
      { marginPercent: 45, price: 109.0909 },
    );
  });

  it('sem custo médio na nota, informar margem deixa o preço vazio', () => {
    assert.deepEqual(
      syncPricing({
        average: 0,
        marginPercent: 45,
        price: 10,
        edited: 'margin',
        emptyPriceWithoutCost: true,
      }),
      { marginPercent: 45, price: null },
    );
  });

  it('sem custo médio no cadastro, os campos não se recalculam', () => {
    assert.deepEqual(
      syncPricing({
        average: 0,
        marginPercent: 45,
        price: 10,
        edited: 'margin',
        emptyPriceWithoutCost: false,
      }),
      { marginPercent: 45, price: 10 },
    );
  });
});
