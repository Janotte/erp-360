import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { titleListStatus } from '../src/modules/titles/listStatus.ts';

describe('filtro de status da listagem', () => {
  it('não restringe status quando o filtro está vazio', () => {
    assert.equal(titleListStatus(undefined, '2026-10-23'), undefined);
  });

  it('repassa os status gravados sem mexer no vencimento', () => {
    assert.deepEqual(titleListStatus('pendente', '2026-10-23'), { status: 'pendente' });
    assert.deepEqual(titleListStatus('pago', '2026-10-23'), { status: 'pago' });
    assert.deepEqual(titleListStatus('recebido', '2026-10-23'), { status: 'recebido' });
    assert.deepEqual(titleListStatus('cancelado', '2026-10-23'), { status: 'cancelado' });
  });

  it('trata atrasado como pendente com vencimento anterior a hoje', () => {
    assert.deepEqual(titleListStatus('atrasado', '2026-10-23'), {
      status: 'pendente',
      dueBefore: '2026-10-23',
    });
  });
});
