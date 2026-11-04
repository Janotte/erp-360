import { companyCards } from '@erp-360/mod-financial';
import { and, eq } from 'drizzle-orm';

import { db } from '../../db/index.ts';
import { InboundError } from './errors.ts';

export type FinancialStatus = 'pending' | 'classified' | 'waived';
export type PaymentKind = 'supplier' | 'card';

export interface FinanceInput {
  financialStatus: FinancialStatus;
  paymentKind: PaymentKind | null;
  companyCardId: string | null;
  waiverReason: string | null;
}

export interface FinanceInstallment {
  number: string;
  dueOn: string;
  amount: number;
}

/** Parcela do XML sugere prazo do fornecedor. Na conferência dá para trocar para cartão. */
export function initialInboundFinance(input: {
  installments: unknown[];
  totalAmount: number;
}) {
  if (input.installments.length > 0 || input.totalAmount === 0) {
    return {
      financialStatus: 'classified' as const,
      paymentKind: 'supplier' as const,
      companyCardId: null,
      waiverReason: null,
    };
  }
  return {
    financialStatus: 'pending' as const,
    paymentKind: null,
    companyCardId: null,
    waiverReason: null,
  };
}

export async function normalizeInboundFinance(
  tenantId: string,
  finance: FinanceInput,
  installments: FinanceInstallment[],
  totalAmount: number,
) {
  const reason = finance.waiverReason?.trim() || null;
  if (finance.financialStatus === 'pending') {
    return {
      financialStatus: 'pending' as const,
      paymentKind: null,
      companyCardId: null,
      waiverReason: null,
      installments: [] as FinanceInstallment[],
    };
  }
  if (finance.financialStatus === 'waived') {
    if (!reason || reason.length < 3) {
      throw new InboundError(400, 'Informe o motivo para dispensar o financeiro.');
    }
    return {
      financialStatus: 'waived' as const,
      paymentKind: null,
      companyCardId: null,
      waiverReason: reason.slice(0, 255),
      installments: [] as FinanceInstallment[],
    };
  }
  if (finance.paymentKind !== 'supplier' && finance.paymentKind !== 'card') {
    throw new InboundError(400, 'Classifique o pagamento.');
  }
  if (totalAmount > 0 && installments.length === 0) {
    throw new InboundError(400, 'Informe as parcelas do pagamento.');
  }
  const sum = installments.reduce((total, row) => total + row.amount, 0);
  if (totalAmount > 0 && Math.abs(sum - totalAmount) > 1) {
    throw new InboundError(400, 'A soma das parcelas não fecha com o total da nota.');
  }
  let companyCardId: string | null = null;
  if (finance.paymentKind === 'card') {
    if (!finance.companyCardId) throw new InboundError(400, 'Informe o cartão.');
    const [card] = await db
      .select({ id: companyCards.id })
      .from(companyCards)
      .where(
        and(
          eq(companyCards.id, finance.companyCardId),
          eq(companyCards.tenantId, tenantId),
          eq(companyCards.isActive, true),
        ),
      )
      .limit(1);
    if (!card) {
      throw new InboundError(400, 'O cartão informado não existe ou está inativo.');
    }
    companyCardId = card.id;
  }
  return {
    financialStatus: 'classified' as const,
    paymentKind: finance.paymentKind,
    companyCardId,
    waiverReason: null,
    installments,
  };
}
