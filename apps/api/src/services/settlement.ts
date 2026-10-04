import {
  bankAccounts,
  bankEntries,
  cashEntries,
  payables,
  receivables,
  settlements,
} from '@erp-360/mod-financial';
import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { getOrCreateFinancialSettings } from './financial-settings.ts';
import { addDays, computeDueAmount } from './settlement-math.ts';

export class SettlementError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type RemainderMode = 'none' | 'new_title' | 'plan_account';
export type TreasuryKind = 'cash' | 'bank';

export interface SettleInput {
  kind: 'payable' | 'receivable';
  tenantId: string;
  titleId: string;
  settledOn: string;
  settledAmount: number;
  treasury: TreasuryKind;
  bankAccountId?: string | null;
  waiveCharges?: boolean;
  remainderMode?: RemainderMode;
  differencePlanAccountId?: string | null;
  remainderDueOn?: string | null;
  includeChargesOnNewTitle?: boolean;
}

export async function previewSettlement(params: {
  kind: 'payable' | 'receivable';
  tenantId: string;
  titleId: string;
  settledOn: string;
  waiveCharges?: boolean;
}) {
  const title = await loadTitle(params.kind, params.tenantId, params.titleId);
  if (title.status !== 'pendente') {
    throw new SettlementError(400, 'Somente contas pendentes podem ser liquidadas.');
  }
  const settings = await getOrCreateFinancialSettings(params.tenantId);
  const due = computeDueAmount({
    kind: params.kind,
    originalAmount: title.installmentAmount,
    dueOn: title.dueOn,
    settledOn: params.settledOn,
    lateFeeBps: settings.lateFeeBps,
    dailyInterestBps: settings.dailyInterestBps,
    graceDays: settings.graceDays,
    waiveCharges: Boolean(params.waiveCharges),
  });

  return {
    originalAmount: title.installmentAmount,
    dueOn: title.dueOn,
    ...due,
    settings: {
      lateFeeBps: settings.lateFeeBps,
      dailyInterestBps: settings.dailyInterestBps,
      graceDays: settings.graceDays,
      discountObtainedPlanAccountId: settings.discountObtainedPlanAccountId,
      discountGrantedPlanAccountId: settings.discountGrantedPlanAccountId,
      lateFeePaidPlanAccountId: settings.lateFeePaidPlanAccountId,
      lateFeeReceivedPlanAccountId: settings.lateFeeReceivedPlanAccountId,
    },
  };
}

export async function settleTitle(input: SettleInput) {
  return db.transaction(async (tx) => {
    const title = await loadTitle(input.kind, input.tenantId, input.titleId, tx);
    if (title.status !== 'pendente') {
      throw new SettlementError(400, 'Somente contas pendentes podem ser liquidadas.');
    }
    if (input.settledAmount <= 0) {
      throw new SettlementError(400, 'Informe um valor maior que zero.');
    }
    if (input.treasury === 'bank' && !input.bankAccountId) {
      throw new SettlementError(400, 'Selecione a conta bancária.');
    }

    const settings = await getOrCreateFinancialSettings(input.tenantId);
    const due = computeDueAmount({
      kind: input.kind,
      originalAmount: title.installmentAmount,
      dueOn: title.dueOn,
      settledOn: input.settledOn,
      lateFeeBps: settings.lateFeeBps,
      dailyInterestBps: settings.dailyInterestBps,
      graceDays: settings.graceDays,
      waiveCharges: Boolean(input.waiveCharges),
    });

    const remainder = due.dueAmount - input.settledAmount;
    const extra = input.settledAmount - due.dueAmount;
    let remainderMode: RemainderMode = input.remainderMode ?? 'none';

    if (remainder > 0) {
      if (remainderMode !== 'new_title' && remainderMode !== 'plan_account') {
        throw new SettlementError(
          400,
          'O valor é menor que o devido. Gere um novo título ou lance a diferença no plano de contas.',
        );
      }
      if (remainderMode === 'plan_account' && !input.differencePlanAccountId) {
        throw new SettlementError(400, 'Selecione a conta do plano para a diferença.');
      }
    } else if (extra > 0) {
      remainderMode = 'none';
      if (!input.differencePlanAccountId) {
        throw new SettlementError(
          400,
          'O valor é maior que o devido. Selecione a conta do plano para a diferença.',
        );
      }
    } else {
      remainderMode = 'none';
    }

    if (input.treasury === 'bank' && input.bankAccountId) {
      const [account] = await tx
        .select({ id: bankAccounts.id })
        .from(bankAccounts)
        .where(
          and(
            eq(bankAccounts.id, input.bankAccountId),
            eq(bankAccounts.tenantId, input.tenantId),
          ),
        )
        .limit(1);
      if (!account) {
        throw new SettlementError(400, 'Conta bancária não encontrada.');
      }
    }

    let createdTitleId: string | null = null;
    if (remainder > 0 && remainderMode === 'new_title') {
      const remainderAmount =
        input.kind === 'receivable' && input.includeChargesOnNewTitle
          ? remainder
          : Math.max(0, title.installmentAmount - input.settledAmount);
      createdTitleId = await insertRemainderTitle(tx, {
        kind: input.kind,
        tenantId: input.tenantId,
        original: title,
        amount: remainderAmount,
        dueOn: input.remainderDueOn || addDays(input.settledOn, 30),
      });
    }

    const [settlement] = await tx
      .insert(settlements)
      .values({
        tenantId: input.tenantId,
        kind: input.kind,
        titleId: input.titleId,
        settledOn: input.settledOn,
        treasury: input.treasury,
        bankAccountId: input.treasury === 'bank' ? input.bankAccountId : null,
        originalAmount: title.installmentAmount,
        fineAmount: due.fineAmount,
        interestAmount: due.interestAmount,
        dueAmount: due.dueAmount,
        settledAmount: input.settledAmount,
        waivedCharges: Boolean(input.waiveCharges),
        remainderMode,
        differencePlanAccountId: input.differencePlanAccountId || null,
        includeChargesOnNewTitle: Boolean(input.includeChargesOnNewTitle),
        createdTitleId,
      })
      .returning();

    const description = title.description;
    const planAccountId = title.planAccountId;
    if (input.treasury === 'cash') {
      await tx.insert(cashEntries).values({
        tenantId: input.tenantId,
        occurredOn: input.settledOn,
        planAccountId,
        description,
        inflowAmount: input.kind === 'receivable' ? input.settledAmount : 0,
        outflowAmount: input.kind === 'payable' ? input.settledAmount : 0,
        receivableId: input.kind === 'receivable' ? input.titleId : null,
        payableId: input.kind === 'payable' ? input.titleId : null,
        settlementId: settlement.id,
      });
      await recalcCashBalances(tx, input.tenantId);
    } else if (input.bankAccountId) {
      await tx.insert(bankEntries).values({
        tenantId: input.tenantId,
        bankAccountId: input.bankAccountId,
        occurredOn: input.settledOn,
        planAccountId,
        description,
        inflowAmount: input.kind === 'receivable' ? input.settledAmount : 0,
        outflowAmount: input.kind === 'payable' ? input.settledAmount : 0,
        receivableId: input.kind === 'receivable' ? input.titleId : null,
        payableId: input.kind === 'payable' ? input.titleId : null,
        settlementId: settlement.id,
      });
      await recalcBankBalances(tx, input.tenantId, input.bankAccountId);
    }

    if (input.kind === 'payable') {
      const [updated] = await tx
        .update(payables)
        .set({
          paidOn: input.settledOn,
          paidAmount: input.settledAmount,
          status: 'pago',
        })
        .where(and(eq(payables.id, input.titleId), eq(payables.tenantId, input.tenantId)))
        .returning();
      return { title: updated, settlement };
    }

    const [updated] = await tx
      .update(receivables)
      .set({
        receivedOn: input.settledOn,
        receivedAmount: input.settledAmount,
        status: 'recebido',
      })
      .where(
        and(eq(receivables.id, input.titleId), eq(receivables.tenantId, input.tenantId)),
      )
      .returning();
    return { title: updated, settlement };
  });
}

export async function reverseSettlement(params: {
  kind: 'payable' | 'receivable';
  tenantId: string;
  titleId: string;
}) {
  return db.transaction(async (tx) => {
    const title = await loadTitle(params.kind, params.tenantId, params.titleId, tx);
    const expected = params.kind === 'payable' ? 'pago' : 'recebido';
    if (title.status !== expected) {
      throw new SettlementError(400, 'Somente títulos liquidados podem ser estornados.');
    }

    const [settlement] = await tx
      .select()
      .from(settlements)
      .where(
        and(
          eq(settlements.tenantId, params.tenantId),
          eq(settlements.kind, params.kind),
          eq(settlements.titleId, params.titleId),
        ),
      )
      .limit(1);

    if (settlement?.createdTitleId) {
      if (params.kind === 'payable') {
        const [child] = await tx
          .select({ status: payables.status, id: payables.id })
          .from(payables)
          .where(
            and(
              eq(payables.id, settlement.createdTitleId),
              eq(payables.tenantId, params.tenantId),
            ),
          )
          .limit(1);
        if (child && child.status !== 'pendente') {
          throw new SettlementError(
            400,
            'Não é possível estornar porque o título restante já foi liquidado.',
          );
        }
        if (child) {
          await tx
            .delete(payables)
            .where(
              and(eq(payables.id, child.id), eq(payables.tenantId, params.tenantId)),
            );
        }
      } else {
        const [child] = await tx
          .select({ status: receivables.status, id: receivables.id })
          .from(receivables)
          .where(
            and(
              eq(receivables.id, settlement.createdTitleId),
              eq(receivables.tenantId, params.tenantId),
            ),
          )
          .limit(1);
        if (child && child.status !== 'pendente') {
          throw new SettlementError(
            400,
            'Não é possível estornar porque o título restante já foi liquidado.',
          );
        }
        if (child) {
          await tx
            .delete(receivables)
            .where(
              and(
                eq(receivables.id, child.id),
                eq(receivables.tenantId, params.tenantId),
              ),
            );
        }
      }
    }

    const bankAccountId = settlement?.bankAccountId;
    if (settlement) {
      await tx.delete(cashEntries).where(eq(cashEntries.settlementId, settlement.id));
      await tx.delete(bankEntries).where(eq(bankEntries.settlementId, settlement.id));
      await tx.delete(settlements).where(eq(settlements.id, settlement.id));
    }

    await recalcCashBalances(tx, params.tenantId);
    if (bankAccountId) {
      await recalcBankBalances(tx, params.tenantId, bankAccountId);
    }

    if (params.kind === 'payable') {
      const [updated] = await tx
        .update(payables)
        .set({ paidOn: null, paidAmount: null, status: 'pendente' })
        .where(
          and(eq(payables.id, params.titleId), eq(payables.tenantId, params.tenantId)),
        )
        .returning();
      return updated;
    }

    const [updated] = await tx
      .update(receivables)
      .set({ receivedOn: null, receivedAmount: null, status: 'pendente' })
      .where(
        and(
          eq(receivables.id, params.titleId),
          eq(receivables.tenantId, params.tenantId),
        ),
      )
      .returning();
    return updated;
  });
}

type Queryable = typeof db;

async function loadTitle(
  kind: 'payable' | 'receivable',
  tenantId: string,
  titleId: string,
  client: Queryable = db,
) {
  if (kind === 'payable') {
    const [row] = await client
      .select()
      .from(payables)
      .where(and(eq(payables.id, titleId), eq(payables.tenantId, tenantId)))
      .limit(1);
    if (!row) throw new SettlementError(404, 'Conta a pagar não encontrada.');
    return {
      id: row.id,
      status: row.status,
      installmentAmount: row.installmentAmount,
      dueOn: row.dueOn,
      description: row.description,
      documentNumber: row.documentNumber,
      planAccountId: row.planAccountId,
      personId: row.creditorId,
      issueOn: row.issueOn,
    };
  }

  const [row] = await client
    .select()
    .from(receivables)
    .where(and(eq(receivables.id, titleId), eq(receivables.tenantId, tenantId)))
    .limit(1);
  if (!row) throw new SettlementError(404, 'Conta a receber não encontrada.');
  return {
    id: row.id,
    status: row.status,
    installmentAmount: row.installmentAmount,
    dueOn: row.dueOn,
    description: row.description,
    documentNumber: row.documentNumber,
    planAccountId: row.planAccountId,
    personId: row.debtorId,
    issueOn: row.issueOn,
  };
}

async function insertRemainderTitle(
  tx: Queryable,
  params: {
    kind: 'payable' | 'receivable';
    tenantId: string;
    original: Awaited<ReturnType<typeof loadTitle>>;
    amount: number;
    dueOn: string;
  },
) {
  if (params.amount <= 0) {
    throw new SettlementError(400, 'O restante do título precisa ser maior que zero.');
  }

  const description = `${params.original.description} (restante)`;
  if (params.kind === 'payable') {
    const [created] = await tx
      .insert(payables)
      .values({
        tenantId: params.tenantId,
        creditorId: params.original.personId,
        documentNumber: params.original.documentNumber,
        description,
        issueOn: params.original.issueOn,
        installmentAmount: params.amount,
        dueOn: params.dueOn,
        planAccountId: params.original.planAccountId,
        originalTitleId: params.original.id,
        status: 'pendente',
      })
      .returning({ id: payables.id });
    return created.id;
  }

  const [created] = await tx
    .insert(receivables)
    .values({
      tenantId: params.tenantId,
      debtorId: params.original.personId,
      documentNumber: params.original.documentNumber,
      description,
      issueOn: params.original.issueOn,
      installmentAmount: params.amount,
      dueOn: params.dueOn,
      planAccountId: params.original.planAccountId,
      originalTitleId: params.original.id,
      status: 'pendente',
    })
    .returning({ id: receivables.id });
  return created.id;
}

async function recalcCashBalances(tx: Queryable, tenantId: string) {
  const rows = await tx
    .select({
      id: cashEntries.id,
      inflowAmount: cashEntries.inflowAmount,
      outflowAmount: cashEntries.outflowAmount,
    })
    .from(cashEntries)
    .where(eq(cashEntries.tenantId, tenantId))
    .orderBy(asc(cashEntries.occurredOn), asc(cashEntries.createdAt));

  let balance = 0;
  for (const row of rows) {
    balance += row.inflowAmount - row.outflowAmount;
    await tx.update(cashEntries).set({ balance }).where(eq(cashEntries.id, row.id));
  }
}

async function recalcBankBalances(tx: Queryable, tenantId: string, bankAccountId: string) {
  const rows = await tx
    .select({
      id: bankEntries.id,
      inflowAmount: bankEntries.inflowAmount,
      outflowAmount: bankEntries.outflowAmount,
    })
    .from(bankEntries)
    .where(
      and(eq(bankEntries.tenantId, tenantId), eq(bankEntries.bankAccountId, bankAccountId)),
    )
    .orderBy(asc(bankEntries.occurredOn), asc(bankEntries.createdAt));

  let balance = 0;
  for (const row of rows) {
    balance += row.inflowAmount - row.outflowAmount;
    await tx.update(bankEntries).set({ balance }).where(eq(bankEntries.id, row.id));
  }

  await tx
    .update(bankAccounts)
    .set({ balance })
    .where(and(eq(bankAccounts.id, bankAccountId), eq(bankAccounts.tenantId, tenantId)));
}

export async function listCashFlow(tenantId: string, days = 60) {
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const endIso = addDays(todayIso, days - 1);

  const [cash] = await db
    .select({
      balance: sql<number>`coalesce(max(${cashEntries.balance}), 0)`,
    })
    .from(cashEntries)
    .where(eq(cashEntries.tenantId, tenantId));

  const [banks] = await db
    .select({
      balance: sql<number>`coalesce(sum(${bankAccounts.balance}), 0)`,
    })
    .from(bankAccounts)
    .where(eq(bankAccounts.tenantId, tenantId));

  const openingBalance = Number(cash?.balance ?? 0) + Number(banks?.balance ?? 0);

  const pendingPayables = await db
    .select({
      id: payables.id,
      description: payables.description,
      dueOn: payables.dueOn,
      installmentAmount: payables.installmentAmount,
    })
    .from(payables)
    .where(and(eq(payables.tenantId, tenantId), eq(payables.status, 'pendente')));

  const pendingReceivables = await db
    .select({
      id: receivables.id,
      description: receivables.description,
      dueOn: receivables.dueOn,
      installmentAmount: receivables.installmentAmount,
    })
    .from(receivables)
    .where(and(eq(receivables.tenantId, tenantId), eq(receivables.status, 'pendente')));

  const series: Array<{
    date: string;
    inflows: number;
    outflows: number;
    balance: number;
  }> = [];

  let running = openingBalance;
  for (let i = 0; i < days; i += 1) {
    const date = addDays(todayIso, i);
    const inflows = pendingReceivables
      .filter((item) => (i === 0 ? item.dueOn <= todayIso : item.dueOn === date))
      .reduce((sum, item) => sum + item.installmentAmount, 0);
    const outflows = pendingPayables
      .filter((item) => (i === 0 ? item.dueOn <= todayIso : item.dueOn === date))
      .reduce((sum, item) => sum + item.installmentAmount, 0);
    running += inflows - outflows;
    series.push({ date, inflows, outflows, balance: running });
  }

  return { openingBalance, from: todayIso, to: endIso, days: series };
}
