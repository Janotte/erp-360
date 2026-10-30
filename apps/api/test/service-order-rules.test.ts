import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertLine,
  assertOrigin,
  assertRequiredFields,
  assertTotals,
  assertTransition,
  formatServiceOrderNumber,
  installmentsLabel,
  labelChangeSlots,
  lineAmountCents,
  type ServiceOrderStatus,
} from '../src/modules/service-orders/rules.ts';

const statuses: ServiceOrderStatus[] = [
  'open',
  'analyzing',
  'waiting_approval',
  'waiting_parts',
  'in_progress',
  'ready',
  'delivered',
  'cancelled',
];

function refused(run: () => void) {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal((error as Error & { status?: number }).status, 400);
    return true;
  });
}

describe('situação da ordem', () => {
  it('leva a aberta para análise, aprovação, peça, execução e cancelada', () => {
    for (const next of [
      'analyzing',
      'waiting_approval',
      'waiting_parts',
      'in_progress',
      'cancelled',
    ] as const) {
      assert.doesNotThrow(() => assertTransition('open', next));
    }
    refused(() => assertTransition('open', 'ready'));
    refused(() => assertTransition('open', 'delivered'));
  });

  it('leva a análise para pronta, a pronta para entregue ou execução, e recusa saída do encerramento', () => {
    assert.doesNotThrow(() => assertTransition('analyzing', 'ready'));
    refused(() => assertTransition('waiting_parts', 'ready'));
    assert.doesNotThrow(() => assertTransition('ready', 'delivered'));
    assert.doesNotThrow(() => assertTransition('ready', 'in_progress'));

    for (const current of ['delivered', 'cancelled'] as const) {
      for (const next of statuses) {
        if (next === current) continue;
        refused(() => assertTransition(current, next));
      }
    }
  });
});

describe('totais e número', () => {
  it('arredonda o meio centavo para cima', () => {
    assert.equal(lineAmountCents('1.0000', '10.0050'), 1001);
    assert.equal(lineAmountCents('1.0000', '10.0040'), 1000);
    assert.equal(lineAmountCents('1.0000', '0.0050'), 1);
  });

  it('recusa desconto acima da soma e aceita total zero', () => {
    refused(() =>
      assertTotals({
        productsAmount: 100,
        servicesAmount: 50,
        freightAmount: 20,
        discountAmount: 171,
        surchargeAmount: 0,
      }),
    );
    assert.doesNotThrow(() =>
      assertTotals({
        productsAmount: 100,
        servicesAmount: 50,
        freightAmount: 20,
        discountAmount: 170,
        surchargeAmount: 0,
      }),
    );
  });

  it('agrupa o número de três em três, com pelo menos nove dígitos', () => {
    assert.equal(formatServiceOrderNumber(1), '000.000.001');
    assert.equal(formatServiceOrderNumber(1_000_000_000), '1.000.000.000');
  });

  it('imprime à vista só com uma parcela e carência zero', () => {
    assert.equal(installmentsLabel(1, 0), 'À vista');
    assert.equal(installmentsLabel(3, 30), '3x');
    assert.equal(installmentsLabel(1, 30), '1x');
  });
});

describe('rótulo, origem, obrigatório e linha', () => {
  it('pede confirmação só quando o rótulo muda e há valor em ordem aberta', () => {
    const before = { field08: 'Problema reclamado' };
    const after = { field08: 'Reclamação do cliente / sintomas' };
    assert.deepEqual(labelChangeSlots(before, after, { field08: true }), ['field08']);
    assert.deepEqual(labelChangeSlots(before, before, { field08: true }), []);
    assert.deepEqual(labelChangeSlots(before, after, { field08: false }), []);
  });

  it('aceita garantia sem origem e recusa avulso com origem ou a própria ordem', () => {
    assert.doesNotThrow(() =>
      assertOrigin({ attendance: 'warranty', originOrderId: null, orderId: 'order-1' }),
    );
    refused(() =>
      assertOrigin({
        attendance: 'walk_in',
        originOrderId: 'order-2',
        orderId: 'order-1',
      }),
    );
    refused(() =>
      assertOrigin({
        attendance: 'warranty',
        originOrderId: 'order-1',
        orderId: 'order-1',
      }),
    );
  });

  it('exige o campo obrigatório só enquanto estiver ativo', () => {
    const field = { slot: 'field01', isActive: true, isRequired: true };
    refused(() => assertRequiredFields([field], { field01: '  ' }));
    assert.doesNotThrow(() =>
      assertRequiredFields([{ ...field, isActive: false }], { field01: '' }),
    );
  });

  it('recusa técnico em produto e item de produto em serviço', () => {
    refused(() =>
      assertLine({ kind: 'product', itemKind: 'product', technicianPersonId: 'tech-1' }),
    );
    refused(() =>
      assertLine({ kind: 'service', itemKind: 'product', technicianPersonId: null }),
    );
  });
});
