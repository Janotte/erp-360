import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compareStatementNewestFirst } from '../src/modules/treasury/statement-order.ts';

const sameInstant = new Date('2026-10-23T15:00:00.000Z');
const earlierInstant = new Date('2026-10-23T14:00:00.000Z');

describe('ordem do extrato', () => {
  it('coloca o saldo final no topo e a diferença acima do principal no mesmo instante', () => {
    const entries = [
      {
        id: 'principal-17602',
        occurredOn: '2026-10-23',
        openingBalance: false,
        createdAt: sameInstant,
        description: 'NF-e: 000017602',
      },
      {
        id: 'diferenca-17602',
        occurredOn: '2026-10-23',
        openingBalance: false,
        createdAt: sameInstant,
        description: 'NF-e: 000017602 (diferença)',
      },
      {
        id: 'diferenca-17603',
        occurredOn: '2026-10-23',
        openingBalance: false,
        createdAt: earlierInstant,
        description: 'NF-e: 000017603 (diferença)',
      },
      {
        id: 'principal-17603',
        occurredOn: '2026-10-23',
        openingBalance: false,
        createdAt: earlierInstant,
        description: 'NF-e: 000017603',
      },
    ];

    const ordered = [...entries]
      .sort(compareStatementNewestFirst)
      .map((entry) => entry.id);
    assert.deepEqual(ordered, [
      'diferenca-17602',
      'principal-17602',
      'diferenca-17603',
      'principal-17603',
    ]);
  });
});
