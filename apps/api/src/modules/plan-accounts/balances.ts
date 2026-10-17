import { bankEntries, cashEntries, planAccounts } from '@erp-360/mod-financial';
import type { PlanAccountNature } from '@erp-360/shared';
import { and, eq, gte, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';

import { db } from '../../db/index.ts';

const resultNatures = ['revenue', 'expense'] as const;
const balanceSheetNatures = ['asset', 'liability', 'equity'] as const;

function isoDate(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function currentMonthBounds() {
  const today = new Date();
  return {
    from: isoDate(new Date(today.getFullYear(), today.getMonth(), 1)),
    to: isoDate(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
  };
}

function signedBalance(nature: PlanAccountNature, inflow: number, outflow: number) {
  if (nature === 'expense' || nature === 'asset') return outflow - inflow;
  return inflow - outflow;
}

function movementTotals(table: typeof cashEntries | typeof bankEntries, tenantId: string, from: string, to: string) {
  return db
    .select({
      planAccountId: table.planAccountId,
      inflow: sql<number>`coalesce(sum(${table.inflowAmount}), 0)::int`,
      outflow: sql<number>`coalesce(sum(${table.outflowAmount}), 0)::int`,
    })
    .from(table)
    .innerJoin(
      planAccounts,
      and(eq(table.planAccountId, planAccounts.id), eq(table.tenantId, planAccounts.tenantId)),
    )
    .where(
      and(
        eq(table.tenantId, tenantId),
        isNotNull(table.planAccountId),
        eq(table.openingBalance, false),
        isNull(table.transferId),
        or(
          and(
            inArray(planAccounts.nature, [...resultNatures]),
            gte(table.occurredOn, from),
            lte(table.occurredOn, to),
          ),
          inArray(planAccounts.nature, [...balanceSheetNatures]),
        ),
      ),
    )
    .groupBy(table.planAccountId);
}

export async function planAccountBalances(tenantId: string) {
  const period = currentMonthBounds();
  const [accounts, cash, bank] = await Promise.all([
    db
      .select({
        id: planAccounts.id,
        accountCode: planAccounts.accountCode,
        parentAccountCode: planAccounts.parentAccountCode,
        nature: planAccounts.nature,
      })
      .from(planAccounts)
      .where(eq(planAccounts.tenantId, tenantId)),
    movementTotals(cashEntries, tenantId, period.from, period.to),
    movementTotals(bankEntries, tenantId, period.from, period.to),
  ]);

  const byId = new Map(accounts.map((account) => [account.id, account]));
  const own = new Map<string, number>();
  for (const row of [...cash, ...bank]) {
    if (!row.planAccountId) continue;
    const account = byId.get(row.planAccountId);
    if (!account) continue;
    const amount = signedBalance(account.nature, Number(row.inflow), Number(row.outflow));
    own.set(account.id, (own.get(account.id) ?? 0) + amount);
  }

  const byCode = new Map(accounts.map((account) => [account.accountCode, account]));
  const children = new Map<string, string[]>();
  for (const account of accounts) {
    if (!account.parentAccountCode) continue;
    const list = children.get(account.parentAccountCode) ?? [];
    list.push(account.accountCode);
    children.set(account.parentAccountCode, list);
  }

  const rolled = new Map<string, number>();
  function total(code: string, stack: Set<string>): number {
    const account = byCode.get(code);
    if (!account) return 0;
    const cached = rolled.get(account.id);
    if (cached != null) return cached;
    if (stack.has(code)) return own.get(account.id) ?? 0;
    stack.add(code);
    let sum = own.get(account.id) ?? 0;
    for (const childCode of children.get(code) ?? []) {
      const child = byCode.get(childCode);
      if (!child || child.nature !== account.nature) continue;
      sum += total(childCode, stack);
    }
    stack.delete(code);
    rolled.set(account.id, sum);
    return sum;
  }

  const balances = new Map<string, number>();
  for (const account of accounts) {
    balances.set(account.id, total(account.accountCode, new Set()));
  }

  return { balances, from: period.from, to: period.to };
}
