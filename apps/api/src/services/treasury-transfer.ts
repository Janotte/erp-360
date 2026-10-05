import { bankAccounts, bankEntries, cashEntries, treasuryTransfers } from '@erp-360/mod-financial';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { recalcBankBalances, recalcCashBalances } from './settlement.ts';

export class TransferError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type TreasurySideKind = 'cash' | 'bank';

export interface TransferInput {
  tenantId: string;
  occurredOn: string;
  amount: number;
  fromTreasury: TreasurySideKind;
  fromBankAccountId?: string | null;
  toTreasury: TreasurySideKind;
  toBankAccountId?: string | null;
  description?: string | null;
}

function sideKey(treasury: TreasurySideKind, bankAccountId?: string | null) {
  return treasury === 'cash' ? 'cash' : `bank:${bankAccountId}`;
}

export async function createTreasuryTransfer(input: TransferInput) {
  if (input.amount <= 0) {
    throw new TransferError(400, 'Informe um valor maior que zero.');
  }
  if (input.fromTreasury === 'bank' && !input.fromBankAccountId) {
    throw new TransferError(400, 'Selecione a conta de origem.');
  }
  if (input.toTreasury === 'bank' && !input.toBankAccountId) {
    throw new TransferError(400, 'Selecione a conta de destino.');
  }
  if (sideKey(input.fromTreasury, input.fromBankAccountId) === sideKey(input.toTreasury, input.toBankAccountId)) {
    throw new TransferError(400, 'Origem e destino precisam ser diferentes.');
  }

  return db.transaction(async (tx) => {
    const fromAccount =
      input.fromTreasury === 'bank' && input.fromBankAccountId
        ? await loadAccount(tx, input.tenantId, input.fromBankAccountId)
        : null;
    const toAccount =
      input.toTreasury === 'bank' && input.toBankAccountId
        ? await loadAccount(tx, input.tenantId, input.toBankAccountId)
        : null;

    const fromKind = fromAccount?.kind ?? 'operating';
    const toKind = toAccount?.kind ?? 'operating';
    if (fromKind === 'investment' && toKind === 'investment') {
      throw new TransferError(400, 'Não é possível transferir entre contas de investimento.');
    }
    if (
      (fromKind === 'investment' && toKind !== 'operating') ||
      (toKind === 'investment' && fromKind !== 'operating')
    ) {
      throw new TransferError(
        400,
        'Conta de investimento só transfere com caixa ou conta operacional.',
      );
    }

    const fromLabel = fromAccount?.name ?? 'Caixa';
    const toLabel = toAccount?.name ?? 'Caixa';
    const description =
      input.description?.trim() ||
      defaultTransferDescription({
        fromKind,
        toKind,
        fromLabel,
        toLabel,
      });

    const [transfer] = await tx
      .insert(treasuryTransfers)
      .values({
        tenantId: input.tenantId,
        occurredOn: input.occurredOn,
        amount: input.amount,
        fromTreasury: input.fromTreasury,
        fromBankAccountId: input.fromTreasury === 'bank' ? input.fromBankAccountId : null,
        toTreasury: input.toTreasury,
        toBankAccountId: input.toTreasury === 'bank' ? input.toBankAccountId : null,
        description,
      })
      .returning();

    if (input.fromTreasury === 'cash') {
      await tx.insert(cashEntries).values({
        tenantId: input.tenantId,
        occurredOn: input.occurredOn,
        description,
        inflowAmount: 0,
        outflowAmount: input.amount,
        transferId: transfer.id,
      });
      await recalcCashBalances(tx, input.tenantId);
    } else if (input.fromBankAccountId) {
      await tx.insert(bankEntries).values({
        tenantId: input.tenantId,
        bankAccountId: input.fromBankAccountId,
        occurredOn: input.occurredOn,
        description,
        inflowAmount: 0,
        outflowAmount: input.amount,
        transferId: transfer.id,
      });
      await recalcBankBalances(tx, input.tenantId, input.fromBankAccountId);
    }

    if (input.toTreasury === 'cash') {
      await tx.insert(cashEntries).values({
        tenantId: input.tenantId,
        occurredOn: input.occurredOn,
        description,
        inflowAmount: input.amount,
        outflowAmount: 0,
        transferId: transfer.id,
      });
      await recalcCashBalances(tx, input.tenantId);
    } else if (input.toBankAccountId) {
      await tx.insert(bankEntries).values({
        tenantId: input.tenantId,
        bankAccountId: input.toBankAccountId,
        occurredOn: input.occurredOn,
        description,
        inflowAmount: input.amount,
        outflowAmount: 0,
        transferId: transfer.id,
      });
      await recalcBankBalances(tx, input.tenantId, input.toBankAccountId);
    }

    return transfer;
  });
}

export async function reverseTreasuryTransfer(params: {
  tenantId: string;
  transferId: string;
}) {
  return db.transaction(async (tx) => {
    const [transfer] = await tx
      .select()
      .from(treasuryTransfers)
      .where(
        and(
          eq(treasuryTransfers.id, params.transferId),
          eq(treasuryTransfers.tenantId, params.tenantId),
        ),
      )
      .limit(1);

    if (!transfer) {
      throw new TransferError(404, 'Transferência não encontrada.');
    }

    const bankLines = await tx
      .select({
        bankAccountId: bankEntries.bankAccountId,
        reconciled: bankEntries.reconciled,
      })
      .from(bankEntries)
      .where(
        and(eq(bankEntries.transferId, transfer.id), eq(bankEntries.tenantId, params.tenantId)),
      );

    if (bankLines.some((line) => line.reconciled)) {
      throw new TransferError(
        400,
        'Não é possível estornar: um dos lançamentos já foi conciliado.',
      );
    }

    const cashLines = await tx
      .select({ id: cashEntries.id })
      .from(cashEntries)
      .where(
        and(eq(cashEntries.transferId, transfer.id), eq(cashEntries.tenantId, params.tenantId)),
      );

    const bankAccountIds = [...new Set(bankLines.map((line) => line.bankAccountId))];

    await tx
      .delete(treasuryTransfers)
      .where(
        and(eq(treasuryTransfers.id, transfer.id), eq(treasuryTransfers.tenantId, params.tenantId)),
      );

    if (cashLines.length) {
      await recalcCashBalances(tx, params.tenantId);
    }
    for (const bankAccountId of bankAccountIds) {
      await recalcBankBalances(tx, params.tenantId, bankAccountId);
    }

    return { id: transfer.id };
  });
}

function defaultTransferDescription(params: {
  fromKind: 'operating' | 'investment';
  toKind: 'operating' | 'investment';
  fromLabel: string;
  toLabel: string;
}) {
  if (params.toKind === 'investment') {
    return `Aplicação — ${params.fromLabel} → ${params.toLabel}`;
  }
  if (params.fromKind === 'investment') {
    return `Resgate — ${params.fromLabel} → ${params.toLabel}`;
  }
  return `Transferência — ${params.fromLabel} → ${params.toLabel}`;
}

type Queryable = typeof db;

async function loadAccount(client: Queryable, tenantId: string, id: string) {
  const [account] = await client
    .select({
      id: bankAccounts.id,
      name: bankAccounts.name,
      kind: bankAccounts.kind,
    })
    .from(bankAccounts)
    .where(and(eq(bankAccounts.id, id), eq(bankAccounts.tenantId, tenantId)))
    .limit(1);
  if (!account) {
    throw new TransferError(400, 'Conta bancária não encontrada.');
  }
  return account;
}
