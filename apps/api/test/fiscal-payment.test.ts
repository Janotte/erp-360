import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  fiscalPag,
  type FiscalPaymentSource,
} from '../src/modules/payment-methods/fiscal-payment.ts';

const cnpj = '11.222.333/0001-81';

function source(patch: Partial<FiscalPaymentSource> = {}): FiscalPaymentSource {
  return {
    code: '01',
    fiscalGroup: 'none',
    methodName: 'Dinheiro',
    indPag: 0,
    customerAmount: 1_000,
    integrationType: null,
    ...patch,
  };
}

describe('grupo de pagamento da NF-e', () => {
  it('emite dinheiro à vista e o troco só nesse meio', () => {
    const pag = fiscalPag({
      payments: [source({ customerAmount: 1_500 })],
      changeAmount: 500,
    });
    assert.deepEqual(pag, {
      detPag: [{ indPag: '0', tPag: '01', vPag: '15.00' }],
      vTroco: '5.00',
    });
  });

  it('recusa troco sem dinheiro ou maior que o dinheiro', () => {
    assert.throws(
      () =>
        fiscalPag({
          payments: [
            source({
              code: '17',
              fiscalGroup: 'electronic',
              integrationType: 'not_integrated',
              customerAmount: 1_000,
            }),
          ],
          changeAmount: 100,
        }),
      /dinheiro/,
    );
    assert.throws(
      () =>
        fiscalPag({ payments: [source({ customerAmount: 1_000 })], changeAmount: 1_001 }),
      /não pode passar/,
    );
  });

  it('emite boleto a prazo só com o tPag', () => {
    const pag = fiscalPag({
      payments: [
        source({ code: '15', methodName: 'Boleto', indPag: 1, customerAmount: 100_000 }),
      ],
    });
    assert.deepEqual(pag, {
      detPag: [{ indPag: '1', tPag: '15', vPag: '1000.00' }],
    });
  });

  it('copia o nome da forma para o xPag do meio Outros', () => {
    const pag = fiscalPag({
      payments: [
        source({
          code: '99',
          fiscalGroup: 'other',
          methodName: '  Crediário da loja  ',
          indPag: 1,
          customerAmount: 111_270,
        }),
      ],
    });
    assert.equal(pag.detPag[0]?.xPag, 'Crediário da loja');
    assert.equal(pag.detPag[0]?.vPag, '1112.70');
    assert.equal(pag.detPag[0]?.card, undefined);
    assert.throws(
      () =>
        fiscalPag({
          payments: [source({ code: '99', fiscalGroup: 'other', methodName: 'X' })],
        }),
      /2 a 60/,
    );
  });

  it('monta o grupo do cartão integrado com CNPJ, bandeira e autorização', () => {
    const pag = fiscalPag({
      payments: [
        source({
          code: '03',
          fiscalGroup: 'card',
          methodName: 'Crédito Stone',
          indPag: 0,
          customerAmount: 10_050,
          integrationType: 'integrated',
          acquirerTaxId: cnpj,
          cardBrandCode: '01',
          transactionAuthorization: ' ABC123 ',
        }),
      ],
    });
    assert.deepEqual(pag.detPag[0]?.card, {
      tpIntegra: '1',
      CNPJ: '11222333000181',
      tBand: '01',
      cAut: 'ABC123',
    });
    assert.equal(pag.detPag[0]?.vPag, '100.50');
  });

  it('omite CNPJ e autorização no cartão não integrado', () => {
    const pag = fiscalPag({
      payments: [
        source({
          code: '04',
          fiscalGroup: 'card',
          methodName: 'Débito',
          integrationType: 'not_integrated',
          cardBrandCode: '02',
        }),
      ],
    });
    assert.deepEqual(pag.detPag[0]?.card, { tpIntegra: '2', tBand: '02' });
  });

  it('exige integração, bandeira, CNPJ e autorização no cartão integrado', () => {
    const card = {
      code: '03',
      fiscalGroup: 'card' as const,
      integrationType: 'integrated' as const,
      customerAmount: 100,
    };
    assert.throws(() => fiscalPag({ payments: [source(card)] }), /CNPJ válido/);
    assert.throws(
      () => fiscalPag({ payments: [source({ ...card, acquirerTaxId: cnpj })] }),
      /bandeira/,
    );
    assert.throws(
      () =>
        fiscalPag({
          payments: [source({ ...card, acquirerTaxId: cnpj, cardBrandCode: '01' })],
        }),
      /autorização/,
    );
    assert.throws(
      () =>
        fiscalPag({
          payments: [source({ ...card, integrationType: null, cardBrandCode: '01' })],
        }),
      /integrado/,
    );
  });

  it('emite o PIX estático sem bandeira e o dinâmico com o identificador', () => {
    const counter = fiscalPag({
      payments: [
        source({
          code: '20',
          fiscalGroup: 'electronic',
          methodName: 'PIX balcão',
          integrationType: 'not_integrated',
          cardBrandCode: '01',
        }),
      ],
    });
    assert.deepEqual(counter.detPag[0]?.card, { tpIntegra: '2' });

    const dynamic = fiscalPag({
      payments: [
        source({
          code: '17',
          fiscalGroup: 'electronic',
          methodName: 'PIX',
          indPag: 0,
          integrationType: 'integrated',
          acquirerTaxId: cnpj,
          transactionId: 'E2E123',
          transactionAuthorization: 'NAO-USAR',
        }),
      ],
    });
    assert.deepEqual(dynamic.detPag[0]?.card, {
      tpIntegra: '1',
      CNPJ: '11222333000181',
      cAut: 'E2E123',
    });
    assert.throws(
      () =>
        fiscalPag({
          payments: [
            source({
              code: '17',
              fiscalGroup: 'electronic',
              integrationType: 'integrated',
              acquirerTaxId: cnpj,
            }),
          ],
        }),
      /identificador/,
    );
  });

  it('emite Sem Pagamento sem indPag e sem valor', () => {
    const pag = fiscalPag({
      payments: [source({ code: '90', customerAmount: 0, indPag: 1 })],
    });
    assert.deepEqual(pag, { detPag: [{ tPag: '90', vPag: '0.00' }] });
    assert.throws(
      () => fiscalPag({ payments: [source({ code: '90', customerAmount: 1 })] }),
      /Sem Pagamento/,
    );
  });

  it('junta dinheiro e cartão no mesmo grupo', () => {
    const pag = fiscalPag({
      payments: [
        source({ customerAmount: 2_000 }),
        source({
          code: '03',
          fiscalGroup: 'card',
          methodName: 'Crédito',
          indPag: 1,
          customerAmount: 8_000,
          integrationType: 'not_integrated',
          cardBrandCode: '01',
        }),
      ],
      changeAmount: 0,
    });
    assert.equal(pag.detPag.length, 2);
    assert.equal(pag.vTroco, undefined);
    assert.equal(pag.detPag[1]?.indPag, '1');
  });
});
