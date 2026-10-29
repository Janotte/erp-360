import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  type DocumentPaymentMethod,
  type DocumentPaymentTerm,
  planDocumentPayment,
} from '../src/modules/payment-methods/document-payment.ts';

const soldOn = '2026-10-28';

function method(patch: Partial<DocumentPaymentMethod> = {}): DocumentPaymentMethod {
  return {
    id: 'method',
    meansOfPaymentId: 'mean',
    isActive: true,
    receiptKind: 'customer_receivable',
    settlementDays: null,
    integrationType: null,
    acquirerId: null,
    cardBrandId: null,
    bankAccountId: null,
    useInQuote: true,
    useInSale: true,
    useInPos: true,
    useInServiceOrder: true,
    ...patch,
  };
}

function term(patch: Partial<DocumentPaymentTerm> = {}): DocumentPaymentTerm {
  return {
    installmentCount: 1,
    firstDueDays: 0,
    intervalDays: 0,
    interestType: 'none',
    interestRateBps: 0,
    administrativeFeeBps: 0,
    fixedFeeAmount: 0,
    ...patch,
  };
}

function plan(
  patch: {
    channel?: 'quote' | 'sale' | 'pos' | 'serviceOrder';
    principalAmount?: number;
    method?: Partial<DocumentPaymentMethod>;
    term?: Partial<DocumentPaymentTerm>;
    capture?: {
      transactionAuthorization?: string | null;
      transactionId?: string | null;
      cardBrandId?: string | null;
    };
  } = {},
) {
  return planDocumentPayment({
    channel: patch.channel ?? 'sale',
    principalAmount: patch.principalAmount ?? 100_000,
    soldOn,
    method: method(patch.method),
    term: term(patch.term),
    capture: patch.capture,
  });
}

describe('cópia do pagamento no documento', () => {
  it('copia a condição à vista e não gera título em dinheiro', () => {
    const payment = plan({
      method: { receiptKind: 'cash', cardBrandId: 'brand' },
      term: { administrativeFeeBps: 250, fixedFeeAmount: 50 },
      capture: { transactionAuthorization: '  ABC  ', transactionId: '' },
    });

    assert.equal(payment.paymentMethodId, 'method');
    assert.equal(payment.meansOfPaymentId, 'mean');
    assert.equal(payment.installmentCount, 1);
    assert.equal(payment.interestType, 'none');
    assert.equal(payment.administrativeFeeBps, 250);
    assert.equal(payment.fixedFeeAmount, 50);
    assert.equal(payment.cardBrandId, 'brand');
    assert.equal(payment.transactionAuthorization, 'ABC');
    assert.equal(payment.transactionId, null);
    assert.equal(payment.principalAmount, 100_000);
    assert.equal(payment.customerAmount, 100_000);
    assert.equal(payment.indPag, 0);
    assert.deepEqual(payment.titles, []);
  });

  it('gera um título por parcela no crediário, com o resto nos primeiros', () => {
    const payment = plan({
      principalAmount: 100,
      term: { installmentCount: 3, firstDueDays: 30, intervalDays: 30 },
    });

    assert.equal(payment.indPag, 1);
    assert.deepEqual(
      payment.titles.map((title) => title.amount),
      [34, 33, 33],
    );
    assert.deepEqual(
      payment.titles.map((title) => title.dueOn),
      ['2026-11-27', '2026-12-27', '2027-01-26'],
    );
    assert.equal(
      payment.titles.every((title) => title.debtor === 'customer'),
      true,
    );
  });

  it('soma o juros simples e o flat ao total do cliente', () => {
    const simple = plan({
      term: {
        installmentCount: 10,
        firstDueDays: 30,
        intervalDays: 30,
        interestType: 'simple',
        interestRateBps: 199,
      },
    });
    assert.equal(simple.customerAmount, 119_900);
    assert.equal(
      simple.titles.reduce((sum, title) => sum + title.amount, 0),
      119_900,
    );

    const flat = plan({
      term: {
        installmentCount: 10,
        firstDueDays: 30,
        intervalDays: 30,
        interestType: 'flat',
        interestRateBps: 199,
      },
    });
    assert.equal(flat.customerAmount, 101_990);
  });

  it('parcela o crediário pela Tabela Price em prestações iguais', () => {
    const payment = plan({
      term: {
        installmentCount: 10,
        firstDueDays: 30,
        intervalDays: 30,
        interestType: 'price',
        interestRateBps: 199,
      },
    });

    assert.equal(payment.customerAmount, 111_270);
    assert.deepEqual(
      payment.titles.map((title) => title.amount),
      Array.from({ length: 10 }, () => 11_127),
    );
    assert.equal(payment.titles[0]?.dueOn, '2026-11-27');
    assert.equal(payment.titles[9]?.dueOn, '2027-08-24');
  });

  it('gera um único título da credenciadora no juros do emissor', () => {
    const payment = plan({
      method: {
        receiptKind: 'acquirer_receivable',
        settlementDays: 30,
        integrationType: 'integrated',
        acquirerId: 'stone',
        cardBrandId: 'visa',
      },
      term: {
        installmentCount: 10,
        firstDueDays: 30,
        intervalDays: 30,
        interestType: 'issuer',
      },
      capture: { cardBrandId: 'master', transactionAuthorization: 'CAUT1' },
    });

    assert.equal(payment.customerAmount, 100_000);
    assert.equal(payment.installmentCount, 10);
    assert.equal(payment.indPag, 1);
    assert.equal(payment.cardBrandId, 'master');
    assert.equal(payment.acquirerId, 'stone');
    assert.deepEqual(payment.titles, [
      {
        installmentNumber: 1,
        installmentCount: 1,
        dueOn: '2026-11-27',
        amount: 100_000,
        debtor: 'acquirer',
      },
    ]);
  });

  it('mantém o cartão em 1x à vista mesmo com crédito em D+30', () => {
    const payment = plan({
      method: {
        receiptKind: 'acquirer_receivable',
        settlementDays: 30,
        acquirerId: 'stone',
      },
      term: { interestType: 'issuer' },
    });

    assert.equal(payment.indPag, 0);
    assert.equal(payment.titles[0]?.dueOn, '2026-11-27');
    assert.equal(payment.titles[0]?.amount, 100_000);
  });

  it('parcela o recebível da credenciadora quando o juros não é do emissor', () => {
    const payment = plan({
      principalAmount: 1_000,
      method: {
        receiptKind: 'acquirer_receivable',
        acquirerId: 'stone',
        settlementDays: null,
      },
      term: { installmentCount: 3, firstDueDays: 0, intervalDays: 30 },
    });

    assert.equal(payment.indPag, 1);
    assert.deepEqual(
      payment.titles.map((title) => [title.amount, title.debtor, title.dueOn]),
      [
        [334, 'acquirer', '2026-10-28'],
        [333, 'acquirer', '2026-11-27'],
        [333, 'acquirer', '2026-12-27'],
      ],
    );
  });

  it('recusa forma inativa, canal desligado, crédito em loja e valor inválido', () => {
    assert.throws(() => plan({ method: { isActive: false } }), /inativa/);
    assert.throws(
      () => plan({ channel: 'pos', method: { useInPos: false } }),
      /não está disponível/,
    );
    assert.throws(
      () => plan({ method: { receiptKind: 'store_credit' } }),
      /Crédito em loja/,
    );
    assert.throws(() => plan({ principalAmount: 0 }), /valor do pagamento/);
    assert.throws(
      () =>
        plan({
          channel: 'pos',
          method: { receiptKind: 'bank', bankAccountId: null },
        }),
      /conta bancária/,
    );
    assert.throws(
      () =>
        plan({
          method: {
            receiptKind: 'acquirer_receivable',
            settlementDays: null,
            acquirerId: 'stone',
          },
          term: { interestType: 'issuer' },
        }),
      /credenciadora/,
    );
  });
});
