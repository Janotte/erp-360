import { isValidCnpj, onlyDigits } from '@erp-360/shared';

import { type MeansFiscalGroup, type PaymentIntegrationType } from './rules.ts';

export type FiscalPaymentSource = {
  code: string;
  fiscalGroup: MeansFiscalGroup;
  methodName: string;
  indPag: 0 | 1;
  customerAmount: number;
  integrationType: PaymentIntegrationType | null;
  acquirerTaxId?: string | null;
  cardBrandCode?: string | null;
  transactionAuthorization?: string | null;
  transactionId?: string | null;
};

export type FiscalCardGroup = {
  tpIntegra: '1' | '2';
  CNPJ?: string;
  tBand?: string;
  cAut?: string;
};

export type FiscalDetPag = {
  indPag?: '0' | '1';
  tPag: string;
  xPag?: string;
  vPag: string;
  card?: FiscalCardGroup;
};

export type FiscalPag = {
  detPag: FiscalDetPag[];
  vTroco?: string;
};

function reject(message: string): never {
  const error = new Error(message) as Error & { status: number };
  error.status = 400;
  throw error;
}

function captured(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function centsToNfeAmount(cents: number): string {
  const whole = Math.floor(cents / 100);
  const fraction = String(cents % 100).padStart(2, '0');
  return `${whole}.${fraction}`;
}

function acquirerCnpj(
  taxId: string | null | undefined,
  integrated: boolean,
): string | undefined {
  const digits = taxId ? onlyDigits(taxId) : '';
  if (!digits) {
    if (integrated) reject('A credenciadora integrada precisa ter CNPJ válido.');
    return undefined;
  }
  if (!isValidCnpj(digits)) {
    reject(
      integrated
        ? 'A credenciadora integrada precisa ter CNPJ válido.'
        : 'A credenciadora precisa ter CNPJ válido.',
    );
  }
  return digits;
}

function bounded(value: string | null, tooLong: string): string | undefined {
  if (!value) return undefined;
  if (value.length > 128) reject(tooLong);
  return value;
}

function cardGroup(input: FiscalPaymentSource): FiscalCardGroup | undefined {
  if (input.fiscalGroup !== 'card' && input.fiscalGroup !== 'electronic')
    return undefined;
  if (!input.integrationType) reject('Informe se o pagamento é integrado.');

  const integrated = input.integrationType === 'integrated';
  const group: FiscalCardGroup = { tpIntegra: integrated ? '1' : '2' };
  const cnpj = acquirerCnpj(input.acquirerTaxId, integrated);
  if (cnpj) group.CNPJ = cnpj;

  if (input.fiscalGroup === 'card') {
    const brand = input.cardBrandCode?.trim() ?? '';
    if (!/^\d{2}$/.test(brand)) reject('Informe a bandeira.');
    group.tBand = brand;
    const caut = bounded(
      captured(input.transactionAuthorization),
      'A autorização da transação passa de 128 caracteres.',
    );
    if (integrated && !caut) reject('Informe a autorização da transação.');
    if (caut) group.cAut = caut;
    return group;
  }

  const transaction =
    captured(input.transactionId) ?? captured(input.transactionAuthorization);
  const caut = bounded(
    transaction,
    'O identificador da transação passa de 128 caracteres.',
  );
  if (integrated && !caut) reject('Informe o identificador da transação.');
  if (caut) group.cAut = caut;
  return group;
}

export function fiscalDetPag(input: FiscalPaymentSource): FiscalDetPag {
  if (!/^\d{2}$/.test(input.code)) reject('O meio de pagamento é inválido.');
  if (!Number.isInteger(input.customerAmount) || input.customerAmount < 0) {
    reject('Informe o valor do pagamento.');
  }
  if (input.code === '90') {
    if (input.customerAmount !== 0) reject('O meio Sem Pagamento não leva valor.');
    return { tPag: '90', vPag: '0.00' };
  }
  if (input.customerAmount <= 0) reject('Informe o valor do pagamento.');

  const payment: FiscalDetPag = {
    indPag: input.indPag === 0 ? '0' : '1',
    tPag: input.code,
    vPag: centsToNfeAmount(input.customerAmount),
  };
  if (input.fiscalGroup === 'other') {
    const name = input.methodName.trim();
    if (name.length < 2 || name.length > 60) {
      reject('No meio Outros, o nome precisa ter de 2 a 60 caracteres.');
    }
    payment.xPag = name;
  }
  const card = cardGroup(input);
  if (card) payment.card = card;
  return payment;
}

export function fiscalPag(input: {
  payments: FiscalPaymentSource[];
  changeAmount?: number;
}): FiscalPag {
  if (input.payments.length === 0) reject('Informe o pagamento da nota.');
  const detPag = input.payments.map(fiscalDetPag);
  const change = input.changeAmount ?? 0;
  if (!Number.isInteger(change) || change < 0) reject('Informe o troco.');
  if (change === 0) return { detPag };

  const cash = input.payments
    .filter((payment) => payment.code === '01')
    .reduce((sum, payment) => sum + payment.customerAmount, 0);
  if (cash <= 0) reject('O troco só existe no pagamento em dinheiro.');
  if (change > cash) reject('O troco não pode passar do valor em dinheiro.');
  return { detPag, vTroco: centsToNfeAmount(change) };
}
