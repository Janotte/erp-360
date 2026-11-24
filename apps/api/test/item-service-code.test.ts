import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { normalizeServiceItem } from '../src/modules/catalog/items.ts';

describe('código de serviço do item', () => {
  it('aceita serviço sem código e guarda a discriminação em maiúsculas', () => {
    assert.deepEqual(
      normalizeServiceItem({
        type: 'service',
        serviceDescription: '  suporte técnico  ',
      }),
      {
        nationalServiceCode: null,
        municipalServiceCode: null,
        issRate: null,
        serviceDescription: 'SUPORTE TÉCNICO',
      },
    );
  });

  it('guarda o código nacional, o municipal e a alíquota', () => {
    assert.deepEqual(
      normalizeServiceItem({
        type: 'service',
        nationalServiceCode: '01.07.01',
        municipalServiceCode: '001',
        issRate: '5,00',
      }),
      {
        nationalServiceCode: '010701',
        municipalServiceCode: '001',
        issRate: '5.00',
        serviceDescription: null,
      },
    );
  });

  it('recusa código incompleto, municipal curto e alíquota acima de 9,99', () => {
    assert.deepEqual(
      normalizeServiceItem({ type: 'service', nationalServiceCode: '0107' }),
      { message: 'O código de tributação nacional precisa ter 6 dígitos.' },
    );
    assert.deepEqual(
      normalizeServiceItem({ type: 'service', municipalServiceCode: '12' }),
      { message: 'O código tributário municipal precisa ter 3 dígitos.' },
    );
    assert.deepEqual(normalizeServiceItem({ type: 'service', issRate: '10' }), {
      message: 'Informe a alíquota do ISS entre 0 e 9,99.',
    });
  });

  it('apaga o código de serviço quando o item é produto', () => {
    assert.deepEqual(
      normalizeServiceItem({
        type: 'product',
        nationalServiceCode: '010701',
        municipalServiceCode: '001',
        issRate: '2.00',
        serviceDescription: 'SUPORTE',
      }),
      {
        nationalServiceCode: null,
        municipalServiceCode: null,
        issRate: null,
        serviceDescription: null,
      },
    );
  });
});
