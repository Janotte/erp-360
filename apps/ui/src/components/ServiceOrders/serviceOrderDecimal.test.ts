import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  commitDecimal,
  decimalToApi,
  decimalToCents,
  formatApiDecimal,
  scale4,
  typeDecimal,
} from './serviceOrderDecimal.ts';

describe('digitação de quantidade e valor', () => {
  it('aceita inteiro e inteiro com fração sem empurrar casas', () => {
    assert.equal(typeDecimal('10', 2), '10');
    assert.equal(typeDecimal('10,5', 2), '10,5');
    assert.equal(typeDecimal('10,5', 4), '10,5');
    assert.equal(typeDecimal('10,', 4), '10,');
    assert.equal(typeDecimal('007', 2), '7');
    assert.equal(typeDecimal('0,50', 2), '0,50');
  });

  it('limita a fração ao número de casas do campo', () => {
    assert.equal(typeDecimal('10,567', 2), '10,56');
    assert.equal(typeDecimal('10,56789', 4), '10,5678');
  });

  it('completa as casas ao confirmar com Enter ou ao sair do campo', () => {
    assert.equal(commitDecimal('10', 2), '10,00');
    assert.equal(commitDecimal('10,5', 2), '10,50');
    assert.equal(commitDecimal('10,', 2), '10,00');
    assert.equal(commitDecimal('10', 4), '10,0000');
    assert.equal(commitDecimal('10,5', 4), '10,5000');
    assert.equal(commitDecimal('1234,5', 2), '1.234,50');
    assert.equal(commitDecimal('1.234,50', 2), '1.234,50');
    assert.equal(commitDecimal('', 2), '');
    assert.equal(commitDecimal(',', 2), '');
  });

  it('lê inteiro como reais e a vírgula como fração', () => {
    assert.equal(decimalToCents('10'), 1000);
    assert.equal(decimalToCents('10,5'), 1050);
    assert.equal(decimalToCents('10,50'), 1050);
    assert.equal(decimalToCents('1.234,56'), 123456);
    assert.equal(decimalToCents('0,10'), 10);
    assert.equal(decimalToCents(''), 0);
  });

  it('grava quantidade e preço na escala da API', () => {
    assert.equal(decimalToApi('10', 4), '10.0000');
    assert.equal(decimalToApi('10,5', 4), '10.5000');
    assert.equal(decimalToApi('1.234,5', 4), '1234.5000');
    assert.equal(decimalToApi('', 4), '0.0000');
  });

  it('mostra o valor gravado com vírgula', () => {
    assert.equal(formatApiDecimal('1.0000', 4), '1,0000');
    assert.equal(formatApiDecimal('10.5', 4), '10,5000');
    assert.equal(formatApiDecimal('1000.5', 4), '1.000,5000');
    assert.equal(formatApiDecimal('0', 4), '0,0000');
  });

  it('calcula a linha enquanto o número ainda está incompleto', () => {
    assert.equal(scale4('10'), 100_000n);
    assert.equal(scale4('10,5'), 105_000n);
    assert.equal(scale4('10,'), 100_000n);
    assert.equal(scale4('1.234,0000'), 12_340_000n);
    assert.equal(scale4('1.0000'), 10_000n);
    assert.equal(scale4(''), null);
    assert.equal(scale4('abc'), null);
  });
});
