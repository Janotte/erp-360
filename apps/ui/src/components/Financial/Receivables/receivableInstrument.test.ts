import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  instrumentProfile,
  visibleInstrumentFields,
} from './receivableInstrument.ts';

describe('perfil do instrumento no recebível', () => {
  it('omite instrumento quando não há meio', () => {
    assert.deepEqual(instrumentProfile(undefined).fields, []);
    assert.equal(instrumentProfile(undefined).requiresPaymentMethod, false);
  });

  it('omite instrumento em dinheiro, crediário, vales, duplicata, fidelidade, crédito em loja e pagamento posterior', () => {
    for (const code of ['01', '05', '10', '11', '12', '13', '14', '19', '21', '91']) {
      assert.deepEqual(instrumentProfile(code).fields, [], code);
    }
  });

  it('pede instituição no cheque, no depósito e no TED', () => {
    for (const code of ['02', '16', '18']) {
      assert.deepEqual(instrumentProfile(code).fields, ['financialInstitution'], code);
    }
  });

  it('pede instituição, bandeira e autorização no cartão', () => {
    for (const code of ['03', '04']) {
      const profile = instrumentProfile(code);
      assert.deepEqual(profile.fields, [
        'financialInstitution',
        'cardBrand',
        'transactionAuthorization',
      ]);
      assert.equal(profile.cardBrandRequiredWhenNotIntegrated, true);
    }
  });

  it('pede os dados do boleto sem torná-los obrigatórios no perfil', () => {
    assert.deepEqual(instrumentProfile('15').fields, [
      'financialInstitution',
      'bearerName',
      'bankSlipOurNumber',
      'barcode',
    ]);
    assert.equal(instrumentProfile('15').cardBrandRequiredWhenNotIntegrated, false);
  });

  it('pede instituição e autorização no PIX dinâmico, no automático e no TEF', () => {
    for (const code of ['17', '23', '24']) {
      assert.deepEqual(instrumentProfile(code).fields, [
        'financialInstitution',
        'transactionAuthorization',
      ]);
    }
  });

  it('pede instituição e autorização no PIX estático', () => {
    assert.deepEqual(instrumentProfile('20').fields, [
      'financialInstitution',
      'transactionAuthorization',
    ]);
    assert.equal(instrumentProfile('20').cardBrandRequiredWhenNotIntegrated, false);
  });

  it('exige forma em Outros e não pede instrumento', () => {
    const profile = instrumentProfile('99');
    assert.deepEqual(profile.fields, []);
    assert.equal(profile.requiresPaymentMethod, true);
  });

  it('mantém campo já gravado enquanto o meio não muda', () => {
    const visible = visibleInstrumentFields({
      code: '01',
      meansUnchanged: true,
      retained: { barcode: '123' },
    });
    assert.deepEqual(visible, ['barcode']);
  });

  it('esconde o campo gravado quando o meio muda', () => {
    const visible = visibleInstrumentFields({
      code: '01',
      meansUnchanged: false,
      retained: { barcode: '123' },
    });
    assert.deepEqual(visible, []);
  });
});
