export const paymentReceiptKinds = [
  'cash',
  'bank',
  'customer_receivable',
  'acquirer_receivable',
  'store_credit',
] as const;

export const paymentIntegrationTypes = ['integrated', 'not_integrated'] as const;

export const paymentInterestTypes = [
  'none',
  'simple',
  'price',
  'flat',
  'issuer',
] as const;

export const paymentChannels = ['quote', 'sale', 'pos', 'serviceOrder'] as const;

export type PaymentReceiptKind = (typeof paymentReceiptKinds)[number];
export type PaymentIntegrationType = (typeof paymentIntegrationTypes)[number];
export type PaymentInterestType = (typeof paymentInterestTypes)[number];
export type PaymentChannel = (typeof paymentChannels)[number];
export type MeansFiscalGroup = 'none' | 'card' | 'electronic' | 'other';

export type PaymentTermInput = {
  installmentCount: number;
  interestType: PaymentInterestType;
};

export type PaymentMethodRuleInput = {
  name: string;
  receiptKind: PaymentReceiptKind;
  settlementDays: number | null;
  integrationType: PaymentIntegrationType | null;
  acquirerId: string | null;
  cardBrandId: string | null;
  bankAccountId: string | null;
  useInQuote: boolean;
  useInSale: boolean;
  useInPos: boolean;
  useInServiceOrder: boolean;
  terms: PaymentTermInput[];
};

export type MeansRuleContext = {
  fiscalGroup: MeansFiscalGroup;
  isSelectable: boolean;
  startsOn: string;
  endsOn: string | null;
};

export function paymentMethodRuleMessage(
  input: PaymentMethodRuleInput,
  mean: MeansRuleContext,
  today: string,
): string | null {
  if (
    !mean.isSelectable ||
    mean.startsOn > today ||
    (mean.endsOn !== null && mean.endsOn < today)
  ) {
    return 'Este meio de pagamento não pode ser usado numa forma.';
  }
  if (
    !input.useInQuote &&
    !input.useInSale &&
    !input.useInPos &&
    !input.useInServiceOrder
  ) {
    return 'Marque ao menos um uso: orçamento, venda, PDV ou ordem de serviço.';
  }
  if (input.terms.length === 0) return 'Informe ao menos uma condição.';
  const counts = new Set(input.terms.map((term) => term.installmentCount));
  if (counts.size !== input.terms.length) {
    return 'Cada quantidade de parcelas só pode aparecer uma vez.';
  }
  if (mean.fiscalGroup === 'card' || mean.fiscalGroup === 'electronic') {
    if (!input.integrationType) return 'Informe se o pagamento é integrado.';
  }
  if (
    mean.fiscalGroup === 'card' &&
    input.integrationType === 'not_integrated' &&
    !input.cardBrandId
  ) {
    return 'No cartão não integrado, informe a bandeira.';
  }
  if (mean.fiscalGroup === 'other' && (input.name.length < 2 || input.name.length > 60)) {
    return 'No meio Outros, o nome precisa ter de 2 a 60 caracteres.';
  }
  if (input.receiptKind === 'bank' && !input.bankAccountId) {
    return 'Informe a conta bancária.';
  }
  if (input.receiptKind === 'acquirer_receivable' && !input.acquirerId) {
    return 'Informe a credenciadora.';
  }
  if (input.integrationType === 'integrated' && !input.acquirerId) {
    return 'O pagamento integrado exige a credenciadora.';
  }
  if (input.receiptKind !== 'acquirer_receivable' && input.settlementDays !== null) {
    return 'O prazo de crédito da credenciadora só vale para recebível da adquirente.';
  }
  const issuer = input.terms.some((term) => term.interestType === 'issuer');
  if (
    input.receiptKind === 'acquirer_receivable' &&
    issuer &&
    input.settlementDays === null
  ) {
    return 'Informe os dias até o crédito da credenciadora.';
  }
  return null;
}
