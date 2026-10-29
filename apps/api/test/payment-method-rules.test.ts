import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  type MeansRuleContext,
  type PaymentMethodRuleInput,
  paymentMethodRuleMessage,
} from '../src/modules/payment-methods/rules.ts';

const today = '2026-10-28';

const money: MeansRuleContext = {
  fiscalGroup: 'none',
  isSelectable: true,
  startsOn: '2020-01-01',
  endsOn: null,
};

function input(patch: Partial<PaymentMethodRuleInput> = {}): PaymentMethodRuleInput {
  return {
    name: 'Dinheiro',
    receiptKind: 'cash',
    settlementDays: null,
    integrationType: null,
    acquirerId: null,
    cardBrandId: null,
    bankAccountId: null,
    useInQuote: true,
    useInSale: true,
    useInPos: true,
    useInServiceOrder: true,
    terms: [{ installmentCount: 1, interestType: 'none' }],
    ...patch,
  };
}

describe('regras da forma de pagamento', () => {
  it('aceita dinheiro à vista', () => {
    assert.equal(paymentMethodRuleMessage(input(), money, today), null);
  });

  it('recusa meio fora do select ou fora da vigência', () => {
    assert.match(
      paymentMethodRuleMessage(input(), { ...money, isSelectable: false }, today) ?? '',
      /não pode ser usado/,
    );
    assert.match(
      paymentMethodRuleMessage(input(), { ...money, startsOn: '2026-12-01' }, today) ?? '',
      /não pode ser usado/,
    );
  });

  it('exige integração e bandeira conforme o grupo fiscal', () => {
    const card: MeansRuleContext = { ...money, fiscalGroup: 'card' };
    assert.match(paymentMethodRuleMessage(input(), card, today) ?? '', /integrado/);
    assert.match(
      paymentMethodRuleMessage(
        input({ integrationType: 'not_integrated' }),
        card,
        today,
      ) ?? '',
      /bandeira/,
    );
    assert.equal(
      paymentMethodRuleMessage(
        input({ integrationType: 'not_integrated', cardBrandId: 'brand' }),
        card,
        today,
      ),
      null,
    );
    assert.match(
      paymentMethodRuleMessage(input(), { ...money, fiscalGroup: 'electronic' }, today) ??
        '',
      /integrado/,
    );
  });

  it('exige nome de 2 a 60 caracteres no meio Outros', () => {
    assert.match(
      paymentMethodRuleMessage(input({ name: 'X' }), { ...money, fiscalGroup: 'other' }, today) ??
        '',
      /2 a 60/,
    );
  });

  it('exige conta, credenciadora e prazo conforme o recebimento', () => {
    assert.match(paymentMethodRuleMessage(input({ receiptKind: 'bank' }), money, today) ?? '', /conta/);
    assert.match(
      paymentMethodRuleMessage(input({ receiptKind: 'acquirer_receivable' }), money, today) ?? '',
      /credenciadora/,
    );
    assert.match(
      paymentMethodRuleMessage(
        input({
          receiptKind: 'acquirer_receivable',
          acquirerId: 'acq',
          integrationType: 'integrated',
          terms: [{ installmentCount: 3, interestType: 'issuer' }],
        }),
        { ...money, fiscalGroup: 'card' },
        today,
      ) ?? '',
      /dias até o crédito/,
    );
    assert.match(
      paymentMethodRuleMessage(input({ settlementDays: 30 }), money, today) ?? '',
      /só vale para recebível/,
    );
  });

  it('exige condição única por quantidade', () => {
    assert.match(paymentMethodRuleMessage(input({ terms: [] }), money, today) ?? '', /condição/);
    assert.match(
      paymentMethodRuleMessage(
        input({
          terms: [
            { installmentCount: 2, interestType: 'none' },
            { installmentCount: 2, interestType: 'none' },
          ],
        }),
        money,
        today,
      ) ?? '',
      /uma vez/,
    );
  });
});
