import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { grossMarginRangeMessage } from '../src/modules/catalog/items.ts';

describe('margem bruta do item', () => {
  it('recusa 100 e valor negativo', () => {
    assert.equal(
      grossMarginRangeMessage('100'),
      'Informe a margem bruta entre 0 e 100, sem incluir 100.',
    );
    assert.equal(
      grossMarginRangeMessage('-1'),
      'Informe a margem bruta entre 0 e 100, sem incluir 100.',
    );
  });

  it('aceita vazio e 45', () => {
    assert.equal(grossMarginRangeMessage(''), null);
    assert.equal(grossMarginRangeMessage('45.0000'), null);
    assert.equal(grossMarginRangeMessage(null), null);
    assert.equal(grossMarginRangeMessage('abc'), null);
  });
});
