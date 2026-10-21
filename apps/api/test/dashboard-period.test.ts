import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { dashboardPeriod } from '../src/modules/dashboard/dashboard.ts';

describe('período do dashboard', () => {
  it('abre o mês civil da data de referência', () => {
    assert.deepEqual(dashboardPeriod('2026-10-20'), {
      today: '2026-10-20',
      monthFrom: '2026-10-01',
      monthTo: '2026-10-31',
    });
    assert.deepEqual(dashboardPeriod('2026-02-10'), {
      today: '2026-02-10',
      monthFrom: '2026-02-01',
      monthTo: '2026-02-28',
    });
    assert.equal(dashboardPeriod('2024-02-10').monthTo, '2024-02-29');
    assert.equal(dashboardPeriod('2026-12-01').monthTo, '2026-12-31');
  });
});
