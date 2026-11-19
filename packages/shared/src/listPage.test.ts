import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { listPageMeta } from './listPage.ts';

describe('metadados da página', () => {
  it('mostra a lista inteira quando a quantidade não vem', () => {
    assert.deepEqual(listPageMeta(12, 3), {
      total: 12,
      page: 1,
      limit: 12,
      totalPages: 1,
    });
  });

  it('calcula as páginas depois do filtro', () => {
    assert.deepEqual(listPageMeta(12, 2, 5), {
      total: 12,
      page: 2,
      limit: 5,
      totalPages: 3,
    });
  });

  it('não inventa página quando não há registro', () => {
    assert.deepEqual(listPageMeta(0, 1, 10), {
      total: 0,
      page: 1,
      limit: 10,
      totalPages: 0,
    });
  });
});
