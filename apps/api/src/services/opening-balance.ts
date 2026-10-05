import { bankAccounts, bankEntries, cashEntries } from '@erp-360/mod-financial';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { recalcBankBalances, recalcCashBalances } from './settlement.ts';

const OPENING_DESCRIPTION = 'Saldo inicial';

export function openingMovement(amount: number) {
  return {
    inflowAmount: amount > 0 ? amount : 0,
    outflowAmount: amount < 0 ? Math.abs(amount) : 0,
  };
}

export async function syncCashOpening(
  tenantId: string,
  openingOn: string | null,
  openingAmount: number,
) {
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: cashEntries.id })
      .from(cashEntries)
      .where(and(eq(cashEntries.tenantId, tenantId), eq(cashEntries.openingBalance, true)))
      .limit(1);

    if (!openingOn || openingAmount === 0) {
      if (existing) {
        await tx.delete(cashEntries).where(eq(cashEntries.id, existing.id));
      }
      await recalcCashBalances(tx, tenantId);
      return;
    }

    const movement = openingMovement(openingAmount);
    const values = {
      occurredOn: openingOn,
      description: OPENING_DESCRIPTION,
      inflowAmount: movement.inflowAmount,
      outflowAmount: movement.outflowAmount,
      openingBalance: true,
    };

    if (existing) {
      await tx.update(cashEntries).set(values).where(eq(cashEntries.id, existing.id));
    } else {
      await tx.insert(cashEntries).values({ tenantId, ...values });
    }
    await recalcCashBalances(tx, tenantId);
  });
}

export async function syncBankOpening(
  tenantId: string,
  bankAccountId: string,
  openingOn: string | null,
  openingAmount: number,
) {
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: bankEntries.id })
      .from(bankEntries)
      .where(
        and(
          eq(bankEntries.tenantId, tenantId),
          eq(bankEntries.bankAccountId, bankAccountId),
          eq(bankEntries.openingBalance, true),
        ),
      )
      .limit(1);

    if (!openingOn || openingAmount === 0) {
      if (existing) {
        await tx.delete(bankEntries).where(eq(bankEntries.id, existing.id));
      }
      await recalcBankBalances(tx, tenantId, bankAccountId);
      return;
    }

    const movement = openingMovement(openingAmount);
    const values = {
      occurredOn: openingOn,
      description: OPENING_DESCRIPTION,
      inflowAmount: movement.inflowAmount,
      outflowAmount: movement.outflowAmount,
      openingBalance: true,
      reconciled: true,
    };

    if (existing) {
      await tx.update(bankEntries).set(values).where(eq(bankEntries.id, existing.id));
    } else {
      await tx.insert(bankEntries).values({
        tenantId,
        bankAccountId,
        ...values,
      });
    }
    await recalcBankBalances(tx, tenantId, bankAccountId);
  });
}

export async function loadBankAccount(tenantId: string, id: string) {
  const [account] = await db
    .select()
    .from(bankAccounts)
    .where(and(eq(bankAccounts.id, id), eq(bankAccounts.tenantId, tenantId)))
    .limit(1);
  return account ?? null;
}
