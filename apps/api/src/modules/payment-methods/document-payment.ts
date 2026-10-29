import { addDays, applyBps } from '../titles/settlement-math.ts';
import {
  type PaymentChannel,
  type PaymentIntegrationType,
  type PaymentInterestType,
  type PaymentReceiptKind,
} from './rules.ts';

export type DocumentPaymentMethod = {
  id: string;
  meansOfPaymentId: string;
  isActive: boolean;
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
};

export type DocumentPaymentTerm = {
  installmentCount: number;
  firstDueDays: number;
  intervalDays: number;
  interestType: PaymentInterestType;
  interestRateBps: number;
  administrativeFeeBps: number;
  fixedFeeAmount: number;
};

export type DocumentPaymentCapture = {
  transactionAuthorization?: string | null;
  transactionId?: string | null;
  cardBrandId?: string | null;
};

export type PlannedReceivable = {
  installmentNumber: number;
  installmentCount: number;
  dueOn: string;
  amount: number;
  debtor: 'customer' | 'acquirer';
};

export type DocumentPaymentPlan = {
  paymentMethodId: string;
  meansOfPaymentId: string;
  installmentCount: number;
  interestType: PaymentInterestType;
  interestRateBps: number;
  administrativeFeeBps: number;
  fixedFeeAmount: number;
  firstDueDays: number;
  intervalDays: number;
  receiptKind: PaymentReceiptKind;
  integrationType: PaymentIntegrationType | null;
  acquirerId: string | null;
  cardBrandId: string | null;
  transactionAuthorization: string | null;
  transactionId: string | null;
  principalAmount: number;
  customerAmount: number;
  indPag: 0 | 1;
  titles: PlannedReceivable[];
};

const channelEnabled: Record<PaymentChannel, keyof DocumentPaymentMethod> = {
  quote: 'useInQuote',
  sale: 'useInSale',
  pos: 'useInPos',
  serviceOrder: 'useInServiceOrder',
};

function reject(message: string): never {
  const error = new Error(message) as Error & { status: number };
  error.status = 400;
  throw error;
}

function capturedText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function priceInstallment(principal: number, rateBps: number, count: number): number {
  const monthly = rateBps / 10_000;
  const growth = (1 + monthly) ** count;
  return Math.round((principal * monthly * growth) / (growth - 1));
}

function customerAmount(principal: number, term: DocumentPaymentTerm): number {
  if (term.interestType === 'simple') {
    return principal + applyBps(principal, term.interestRateBps * term.installmentCount);
  }
  if (term.interestType === 'flat') {
    return principal + applyBps(principal, term.interestRateBps);
  }
  if (term.interestType === 'price') {
    return (
      priceInstallment(principal, term.interestRateBps, term.installmentCount) *
      term.installmentCount
    );
  }
  return principal;
}

function splitAmount(total: number, count: number): number[] {
  const base = Math.floor(total / count);
  let remainder = total - base * count;
  return Array.from({ length: count }, () => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    return base + extra;
  });
}

function plannedTitles(
  soldOn: string,
  principal: number,
  total: number,
  method: DocumentPaymentMethod,
  term: DocumentPaymentTerm,
): PlannedReceivable[] {
  if (method.receiptKind === 'cash' || method.receiptKind === 'bank') return [];
  if (method.receiptKind === 'acquirer_receivable' && term.interestType === 'issuer') {
    return [
      {
        installmentNumber: 1,
        installmentCount: 1,
        dueOn: addDays(soldOn, method.settlementDays ?? 0),
        amount: principal,
        debtor: 'acquirer',
      },
    ];
  }

  const debtor = method.receiptKind === 'acquirer_receivable' ? 'acquirer' : 'customer';
  return splitAmount(total, term.installmentCount).map((amount, index) => ({
    installmentNumber: index + 1,
    installmentCount: term.installmentCount,
    dueOn: addDays(soldOn, term.firstDueDays + index * term.intervalDays),
    amount,
    debtor,
  }));
}

export function planDocumentPayment(input: {
  channel: PaymentChannel;
  principalAmount: number;
  soldOn: string;
  method: DocumentPaymentMethod;
  term: DocumentPaymentTerm;
  capture?: DocumentPaymentCapture;
}): DocumentPaymentPlan {
  const { method, term } = input;
  if (!method.isActive) reject('Esta forma de pagamento está inativa.');
  if (!method[channelEnabled[input.channel]]) {
    reject('Esta forma de pagamento não está disponível neste documento.');
  }
  if (method.receiptKind === 'store_credit') {
    reject('Crédito em loja ainda não pode ser confirmado.');
  }
  if (input.channel === 'pos' && method.receiptKind === 'bank' && !method.bankAccountId) {
    reject('Informe a conta bancária desta forma antes de usá-la no PDV.');
  }
  if (!Number.isInteger(input.principalAmount) || input.principalAmount <= 0) {
    reject('Informe o valor do pagamento.');
  }
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input.soldOn) ||
    addDays(input.soldOn, 0) !== input.soldOn
  ) {
    reject('Informe a data da venda.');
  }
  if (
    !Number.isInteger(term.installmentCount) ||
    term.installmentCount < 1 ||
    term.installmentCount > 48
  ) {
    reject('Condição de pagamento inválida.');
  }
  if (
    method.receiptKind === 'acquirer_receivable' &&
    term.interestType === 'issuer' &&
    method.settlementDays === null
  ) {
    reject('Informe os dias até o crédito da credenciadora.');
  }

  const total = customerAmount(input.principalAmount, term);
  const captureBrand = capturedText(input.capture?.cardBrandId);
  return {
    paymentMethodId: method.id,
    meansOfPaymentId: method.meansOfPaymentId,
    installmentCount: term.installmentCount,
    interestType: term.interestType,
    interestRateBps: term.interestRateBps,
    administrativeFeeBps: term.administrativeFeeBps,
    fixedFeeAmount: term.fixedFeeAmount,
    firstDueDays: term.firstDueDays,
    intervalDays: term.intervalDays,
    receiptKind: method.receiptKind,
    integrationType: method.integrationType,
    acquirerId: method.acquirerId,
    cardBrandId: captureBrand ?? method.cardBrandId,
    transactionAuthorization: capturedText(input.capture?.transactionAuthorization),
    transactionId: capturedText(input.capture?.transactionId),
    principalAmount: input.principalAmount,
    customerAmount: total,
    indPag: term.installmentCount === 1 && term.firstDueDays === 0 ? 0 : 1,
    titles: plannedTitles(input.soldOn, input.principalAmount, total, method, term),
  };
}
