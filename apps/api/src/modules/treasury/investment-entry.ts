import { bankAccounts, bankEntries, planAccounts } from '@erp-360/mod-financial';
import { and, eq } from 'drizzle-orm';

import { db } from '../../db/index.ts';
import { recalcBankBalances } from '../titles/settlement.ts';

export class InvestmentEntryError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function createInvestmentEntry(input: {
  tenantId: string;
  bankAccountId: string;
  occurredOn: string;
  description: string;
  direction: 'in' | 'out';
  amount: number;
  planAccountId: string;
}) {
  const description = input.description.trim();
  if (!description) throw new InvestmentEntryError(400, 'Informe o histórico.');
  if (input.amount <= 0) {
    throw new InvestmentEntryError(400, 'Informe um valor maior que zero.');
  }

  return db.transaction(async (tx) => {
    const [account] = await tx
      .select({ id: bankAccounts.id, kind: bankAccounts.kind })
      .from(bankAccounts)
      .where(
        and(
          eq(bankAccounts.id, input.bankAccountId),
          eq(bankAccounts.tenantId, input.tenantId),
        ),
      )
      .limit(1);
    if (!account) throw new InvestmentEntryError(404, 'Conta bancária não encontrada.');
    if (account.kind !== 'investment') {
      throw new InvestmentEntryError(
        400,
        'Lançamento avulso só é permitido em conta de investimento.',
      );
    }

    const [plan] = await tx
      .select({
        id: planAccounts.id,
        acceptsEntries: planAccounts.acceptsEntries,
        isTreasury: planAccounts.isTreasury,
        isActive: planAccounts.isActive,
      })
      .from(planAccounts)
      .where(
        and(eq(planAccounts.id, input.planAccountId), eq(planAccounts.tenantId, input.tenantId)),
      )
      .limit(1);
    if (!plan || !plan.isActive) {
      throw new InvestmentEntryError(400, 'Conta do plano não encontrada.');
    }
    if (!plan.acceptsEntries) {
      throw new InvestmentEntryError(400, 'A conta do plano precisa receber lançamento.');
    }
    if (plan.isTreasury) {
      throw new InvestmentEntryError(
        400,
        'Use uma conta de resultado ou patrimonial, não a conta de tesouraria.',
      );
    }

    const [entry] = await tx
      .insert(bankEntries)
      .values({
        tenantId: input.tenantId,
        bankAccountId: input.bankAccountId,
        occurredOn: input.occurredOn,
        planAccountId: input.planAccountId,
        description,
        inflowAmount: input.direction === 'in' ? input.amount : 0,
        outflowAmount: input.direction === 'out' ? input.amount : 0,
      })
      .returning();

    await recalcBankBalances(tx, input.tenantId, input.bankAccountId);
    return entry;
  });
}

export async function deleteInvestmentEntry(params: { tenantId: string; entryId: string }) {
  return db.transaction(async (tx) => {
    const [entry] = await tx
      .select()
      .from(bankEntries)
      .where(and(eq(bankEntries.id, params.entryId), eq(bankEntries.tenantId, params.tenantId)))
      .limit(1);
    if (!entry) throw new InvestmentEntryError(404, 'Lançamento não encontrado.');
    if (
      entry.openingBalance ||
      entry.transferId ||
      entry.settlementId ||
      entry.receivableId ||
      entry.payableId
    ) {
      throw new InvestmentEntryError(400, 'Este lançamento não pode ser excluído por aqui.');
    }
    if (entry.reconciled) {
      throw new InvestmentEntryError(
        400,
        'Desmarque a conciliação antes de excluir o lançamento.',
      );
    }

    const [account] = await tx
      .select({ kind: bankAccounts.kind })
      .from(bankAccounts)
      .where(
        and(eq(bankAccounts.id, entry.bankAccountId), eq(bankAccounts.tenantId, params.tenantId)),
      )
      .limit(1);
    if (account?.kind !== 'investment') {
      throw new InvestmentEntryError(
        400,
        'Só é possível excluir lançamento avulso de conta de investimento.',
      );
    }

    await tx.delete(bankEntries).where(eq(bankEntries.id, entry.id));
    await recalcBankBalances(tx, params.tenantId, entry.bankAccountId);
    return { id: entry.id };
  });
}
