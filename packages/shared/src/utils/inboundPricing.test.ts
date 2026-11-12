import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  editPricingMargin,
  editPricingPrice,
  entryUnitCost,
  type PricingContext,
  type PricingFields,
  type PricingItemInfo,
  type PricingLine,
  type PricingOverrides,
  pricingPriceMessage,
  projectedAverageForItem,
  recomputePricing,
} from './inboundPricing.ts';
import type { CostFlags } from './pricing.ts';

const noFlags: CostFlags = {
  freightInCost: false,
  insuranceInCost: false,
  otherInCost: false,
  discountInCost: false,
  ipiInCost: false,
  stInCost: false,
  icmsInCost: false,
};

const itemId = 'item-1';
const info: PricingItemInfo = {
  itemId,
  code: '1',
  name: 'Item',
  quantity: 10,
  averageCost: 50,
  grossMargin: '30.0000',
};
const infos = { [itemId]: info };
const lines: PricingLine[] = [{ lineNumber: 1, itemId, commercialQty: 20, factor: 1 }];

function context(flags: CostFlags, stAmount: number): PricingContext {
  return {
    flags,
    docLines: new Map([
      [
        1,
        {
          lineAmount: 130000,
          freightAmount: 0,
          insuranceAmount: 0,
          otherAmount: 0,
          discountAmount: 0,
          ipiAmount: 0,
          stAmount,
          icmsAmount: 0,
        },
      ],
    ]),
  };
}

describe('custo projetado do vínculo', () => {
  it('soma o ST ao custo da entrada quando a natureza leva o ST ao custo', () => {
    const withSt = context({ ...noFlags, stInCost: true }, 20000);
    const ignoring = context(noFlags, 20000);
    const line = lines[0];
    assert.equal(entryUnitCost(ignoring, line), 65);
    assert.equal(entryUnitCost(withSt, line), 75);
    assert.equal(projectedAverageForItem(ignoring, itemId, lines, info), 60);
    assert.equal(projectedAverageForItem(withSt, itemId, lines, info), 66.6667);
  });

  it('usa a quantidade vezes o fator na nota', () => {
    const doubled: PricingLine[] = [{ ...lines[0], factor: 2 }];
    const ctx = context(noFlags, 0);
    assert.equal(entryUnitCost(ctx, doubled[0]), 32.5);
  });
});

describe('preço e margem do vínculo', () => {
  const ctx = context(noFlags, 0);
  const initial = recomputePricing(ctx, [itemId], lines, {}, {}, infos);

  it('começa pela margem do cadastro sem gravá-la como override', () => {
    assert.equal(initial.fields[itemId].margin, '30,00');
    assert.equal(initial.fields[itemId].price, '85,7143');
    assert.deepEqual(initial.overrides, {});
  });

  it('grava a margem derivada ao editar o preço', () => {
    const edited = editPricingPrice(
      ctx,
      itemId,
      '1200000',
      lines,
      initial.overrides,
      initial.fields,
      infos,
    );
    assert.equal(edited.fields[itemId].price, '120,0000');
    assert.equal(edited.fields[itemId].edited, 'price');
    assert.equal(edited.overrides[itemId], '50.0000');
  });

  it('não troca o override anterior quando o preço fica abaixo do custo médio', () => {
    const previous: PricingOverrides = { [itemId]: '40.0000' };
    const below = editPricingPrice(
      ctx,
      itemId,
      '500000',
      lines,
      previous,
      initial.fields,
      infos,
    );
    assert.equal(below.fields[itemId].error, pricingPriceMessage);
    assert.deepEqual(below.overrides, previous);
  });

  it('grava margem vazia como nulo e margem preenchida com 4 casas', () => {
    const typed = editPricingMargin(
      ctx,
      itemId,
      '4500',
      lines,
      initial.overrides,
      initial.fields,
      infos,
    );
    assert.equal(typed.overrides[itemId], '45.0000');
    const cleared = editPricingMargin(
      ctx,
      itemId,
      '',
      lines,
      typed.overrides,
      typed.fields,
      infos,
    );
    assert.equal(cleared.overrides[itemId], null);
  });

  it('recalcula o preço editado quando o fator muda e regrava a margem derivada', () => {
    const edited = editPricingPrice(
      ctx,
      itemId,
      '1200000',
      lines,
      initial.overrides,
      initial.fields,
      infos,
    );
    const doubled: PricingLine[] = [{ ...lines[0], factor: 2 }];
    const next = recomputePricing(
      ctx,
      [itemId],
      doubled,
      edited.overrides,
      edited.fields as Record<string, PricingFields>,
      infos,
    );
    assert.equal(next.fields[itemId].price, '120,0000');
    assert.notEqual(next.overrides[itemId], '50.0000');
  });
});
