import {
  bankAccounts,
  bankEntries,
  cashEntries,
  payables,
  planAccounts,
  receivables,
  settlements,
} from '@erp-360/mod-financial';
import { and, eq, sql } from 'drizzle-orm';

import { db, type DbClient } from '../../db/index.ts';
import { getOrCreateFinancialSettings } from '../treasury/financial-settings.ts';
import { compareStatementChronological } from '../treasury/statement-order.ts';
import {
  addDays,
  computeDueAmount,
  computeSettlementGaps,
  settlementTreasuryLegs,
} from './settlement-math.ts';

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
    const title = await loadTitle(input.kind, input.tenantId, input.titleId, tx, true);
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

    const { remainder, extra } = computeSettlementGaps({
      kind: input.kind,
      originalAmount: title.installmentAmount,
      dueAmount: due.dueAmount,
      settledAmount: input.settledAmount,
      daysLate: due.daysLate,
      waiveCharges: Boolean(input.waiveCharges),
    });
    let remainderMode: RemainderMode = input.remainderMode ?? 'none';

    if (remainder > 0) {
      if (remainderMode !== 'new_title' && remainderMode !== 'plan_account') {
        throw new SettlementError(
          400,
          'O valor é menor que o devido. Gere um novo título ou lance a diferença no plano de contas.',
        );
      }
      if (
        remainderMode === 'plan_account' &&
        extra <= 0 &&
        !input.differencePlanAccountId
      ) {
        throw new SettlementError(400, 'Selecione a conta do plano para a diferença.');
      }
    } else {
      remainderMode = 'none';
    }

    if (extra > 0 && !input.differencePlanAccountId) {
      throw new SettlementError(
        400,
        input.kind === 'receivable' && due.daysLate > 0 && !input.waiveCharges
          ? 'Lance a diferença em relação ao valor original em uma conta de receita.'
          : 'O valor é maior que o devido. Selecione a conta do plano para a diferença.',
      );
    }

    if (input.treasury === 'bank' && input.bankAccountId) {
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
      if (!account) {
        throw new SettlementError(400, 'Conta bancária não encontrada.');
      }
      if (account.kind === 'investment') {
        throw new SettlementError(
          400,
          'Não é possível liquidar título em conta de investimento. Use caixa ou conta operacional.',
        );
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

    const allocatesDifference =
      (remainder > 0 && remainderMode === 'plan_account') ||
      (extra > 0 && remainder <= 0);
    if (allocatesDifference && !title.planAccountId) {
      throw new SettlementError(
        400,
        'Informe o plano de contas do título para lançar a diferença.',
      );
    }
    if (allocatesDifference && input.differencePlanAccountId) {
      await assertDifferenceAccount(tx, {
        tenantId: input.tenantId,
        planAccountId: input.differencePlanAccountId,
        nature: expectedDifferenceNature(input.kind, remainder, extra, remainderMode),
      });
    }

    const description = title.description;
    const legs = settlementTreasuryLegs({
      kind: input.kind,
      settledAmount: input.settledAmount,
      remainder,
      extra,
      remainderMode,
      titlePlanAccountId: title.planAccountId,
      differencePlanAccountId: input.differencePlanAccountId || null,
      description,
    });
    const entryBase = {
      tenantId: input.tenantId,
      occurredOn: input.settledOn,
      receivableId: input.kind === 'receivable' ? input.titleId : null,
      payableId: input.kind === 'payable' ? input.titleId : null,
      settlementId: settlement.id,
    };
    if (input.treasury === 'cash') {
      await tx.insert(cashEntries).values(legs.map((leg) => ({ ...entryBase, ...leg })));
      await recalcCashBalances(tx, input.tenantId);
    } else if (input.bankAccountId) {
      const bankAccountId = input.bankAccountId;
      await tx.insert(bankEntries).values(
        legs.map((leg) => ({
          ...entryBase,
          ...leg,
          bankAccountId,
        })),
      );
      await recalcBankBalances(tx, input.tenantId, bankAccountId);
    }

    if (input.kind === 'payable') {
      const [updated] = await tx
        .update(payables)
        .set({
          paidOn: input.settledOn,
          paidAmount: input.settledAmount,
          status: 'pago',
        })
        .where(
          and(
            eq(payables.id, input.titleId),
            eq(payables.tenantId, input.tenantId),
            eq(payables.status, 'pendente'),
          ),
        )
        .returning();
      if (!updated) {
        throw new SettlementError(409, 'Este título já foi liquidado.');
      }
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
        and(
          eq(receivables.id, input.titleId),
          eq(receivables.tenantId, input.tenantId),
          eq(receivables.status, 'pendente'),
        ),
      )
      .returning();
    if (!updated) {
      throw new SettlementError(409, 'Este título já foi liquidado.');
    }
    return { title: updated, settlement };
  });
}

export async function reverseSettlement(params: {
  kind: 'payable' | 'receivable';
  tenantId: string;
  titleId: string;
}) {
  return db.transaction(async (tx) => {
    const title = await loadTitle(params.kind, params.tenantId, params.titleId, tx, true);
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
          .limit(1)
          .for('update');
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
          .limit(1)
          .for('update');
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
          and(
            eq(payables.id, params.titleId),
            eq(payables.tenantId, params.tenantId),
            eq(payables.status, 'pago'),
          ),
        )
        .returning();
      if (!updated) {
        throw new SettlementError(409, 'Este título já foi estornado.');
      }
      return updated;
    }

    const [updated] = await tx
      .update(receivables)
      .set({ receivedOn: null, receivedAmount: null, status: 'pendente' })
      .where(
        and(
          eq(receivables.id, params.titleId),
          eq(receivables.tenantId, params.tenantId),
          eq(receivables.status, 'recebido'),
        ),
      )
      .returning();
    if (!updated) {
      throw new SettlementError(409, 'Este título já foi estornado.');
    }
    return updated;
  });
}

type Queryable = DbClient;

function expectedDifferenceNature(
  kind: 'payable' | 'receivable',
  remainder: number,
  extra: number,
  remainderMode: RemainderMode,
) {
  if (remainder > 0 && remainderMode === 'plan_account') {
    return kind === 'receivable' ? 'expense' : 'revenue';
  }
  return kind === 'receivable' ? 'revenue' : 'expense';
}

async function assertDifferenceAccount(
  tx: Queryable,
  params: {
    tenantId: string;
    planAccountId: string;
    nature: 'revenue' | 'expense';
  },
) {
  const [account] = await tx
    .select({
      nature: planAccounts.nature,
      acceptsEntries: planAccounts.acceptsEntries,
      isActive: planAccounts.isActive,
    })
    .from(planAccounts)
    .where(
      and(
        eq(planAccounts.id, params.planAccountId),
        eq(planAccounts.tenantId, params.tenantId),
      ),
    )
    .limit(1);

  if (!account || !account.isActive) {
    throw new SettlementError(400, 'Conta do plano para a diferença não encontrada.');
  }
  if (!account.acceptsEntries) {
    throw new SettlementError(400, 'A conta da diferença precisa receber lançamento.');
  }
  if (account.nature !== params.nature) {
    throw new SettlementError(
      400,
      params.nature === 'expense'
        ? 'A diferença entra numa conta de despesa.'
        : 'A diferença entra numa conta de receita.',
    );
  }
}

async function loadTitle(
  kind: 'payable' | 'receivable',
  tenantId: string,
  titleId: string,
  client: Queryable = db,
  lock = false,
) {
  if (kind === 'payable') {
    const query = client
      .select()
      .from(payables)
      .where(and(eq(payables.id, titleId), eq(payables.tenantId, tenantId)))
      .limit(1);
    const [row] = await (lock ? query.for('update') : query);
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

  const query = client
    .select()
    .from(receivables)
    .where(and(eq(receivables.id, titleId), eq(receivables.tenantId, tenantId)))
    .limit(1);
  const [row] = await (lock ? query.for('update') : query);
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

async function lockTenantLedger(tx: Queryable, tenantId: string) {
  // Uma trava por empresa cobre caixa e banco e evita deadlock entre os dois recálculos.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${tenantId}, 0))`);
}

export async function recalcCashBalances(tx: Queryable, tenantId: string) {
  await lockTenantLedger(tx, tenantId);
  const rows = await tx
    .select({
      id: cashEntries.id,
      occurredOn: cashEntries.occurredOn,
      openingBalance: cashEntries.openingBalance,
      createdAt: cashEntries.createdAt,
      description: cashEntries.description,
      inflowAmount: cashEntries.inflowAmount,
      outflowAmount: cashEntries.outflowAmount,
    })
    .from(cashEntries)
    .where(eq(cashEntries.tenantId, tenantId));
  rows.sort(compareStatementChronological);

  let balance = 0;
  for (const row of rows) {
    balance += row.inflowAmount - row.outflowAmount;
    await tx.update(cashEntries).set({ balance }).where(eq(cashEntries.id, row.id));
  }
}

export async function recalcBankBalances(
  tx: Queryable,
  tenantId: string,
  bankAccountId: string,
) {
  await lockTenantLedger(tx, tenantId);
  const rows = await tx
    .select({
      id: bankEntries.id,
      occurredOn: bankEntries.occurredOn,
      openingBalance: bankEntries.openingBalance,
      createdAt: bankEntries.createdAt,
      description: bankEntries.description,
      inflowAmount: bankEntries.inflowAmount,
      outflowAmount: bankEntries.outflowAmount,
    })
    .from(bankEntries)
    .where(
      and(
        eq(bankEntries.tenantId, tenantId),
        eq(bankEntries.bankAccountId, bankAccountId),
      ),
    );
  rows.sort(compareStatementChronological);

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
