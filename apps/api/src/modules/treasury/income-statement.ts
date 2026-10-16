import { bankEntries, cashEntries, planAccounts } from '@erp-360/mod-financial';
import {
  type PlanAccountDreLine,
  planAccountDreLines,
  type PlanAccountNature,
} from '@erp-360/shared';
import { and, eq, gte, isNotNull, isNull, lte } from 'drizzle-orm';

import { db } from '../../db/index.ts';

type Movement = {
  dreLine: PlanAccountDreLine | null;
  nature: PlanAccountNature;
  accountCode: string;
  name: string;
  inflowAmount: number;
  outflowAmount: number;
};

function lineAmount(nature: PlanAccountNature, inflow: number, outflow: number) {
  return nature === 'revenue' ? inflow - outflow : outflow - inflow;
}

function amountOf(lines: Map<PlanAccountDreLine, number>, line: PlanAccountDreLine) {
  return lines.get(line) ?? 0;
}

export async function listIncomeStatement(tenantId: string, from: string, to: string) {
  const cashConditions = and(
    eq(cashEntries.tenantId, tenantId),
    gte(cashEntries.occurredOn, from),
    lte(cashEntries.occurredOn, to),
    eq(cashEntries.openingBalance, false),
    isNull(cashEntries.transferId),
    isNotNull(planAccounts.dreLine),
  );
  const bankConditions = and(
    eq(bankEntries.tenantId, tenantId),
    gte(bankEntries.occurredOn, from),
    lte(bankEntries.occurredOn, to),
    eq(bankEntries.openingBalance, false),
    isNull(bankEntries.transferId),
    isNotNull(planAccounts.dreLine),
  );
  const columns = {
    dreLine: planAccounts.dreLine,
    nature: planAccounts.nature,
    accountCode: planAccounts.accountCode,
    name: planAccounts.name,
  };

  const [cash, bank] = await Promise.all([
    db
      .select({
        ...columns,
        inflowAmount: cashEntries.inflowAmount,
        outflowAmount: cashEntries.outflowAmount,
      })
      .from(cashEntries)
      .innerJoin(
        planAccounts,
        and(
          eq(cashEntries.planAccountId, planAccounts.id),
          eq(cashEntries.tenantId, planAccounts.tenantId),
        ),
      )
      .where(cashConditions),
    db
      .select({
        ...columns,
        inflowAmount: bankEntries.inflowAmount,
        outflowAmount: bankEntries.outflowAmount,
      })
      .from(bankEntries)
      .innerJoin(
        planAccounts,
        and(
          eq(bankEntries.planAccountId, planAccounts.id),
          eq(bankEntries.tenantId, planAccounts.tenantId),
        ),
      )
      .where(bankConditions),
  ]);

  const accounts = new Map<PlanAccountDreLine, Map<string, Movement & { amount: number }>>();
  for (const movement of [...cash, ...bank]) {
    if (!movement.dreLine) continue;
    const amount = lineAmount(movement.nature, movement.inflowAmount, movement.outflowAmount);
    if (amount === 0) continue;
    const byAccount = accounts.get(movement.dreLine) ?? new Map();
    const current = byAccount.get(movement.accountCode);
    if (current) {
      current.amount += amount;
    } else {
      byAccount.set(movement.accountCode, { ...movement, amount });
    }
    accounts.set(movement.dreLine, byAccount);
  }

  const totals = new Map<PlanAccountDreLine, number>();
  const lines = planAccountDreLines.map((line) => {
    const grouped = [...(accounts.get(line)?.values() ?? [])]
      .filter((account) => account.amount !== 0)
      .sort((a, b) => a.accountCode.localeCompare(b.accountCode));
    const amount = grouped.reduce((sum, account) => sum + account.amount, 0);
    totals.set(line, amount);
    return {
      line,
      amount,
      accounts: grouped.map((account) => ({
        accountCode: account.accountCode,
        name: account.name,
        amount: account.amount,
      })),
    };
  });

  const netRevenue = amountOf(totals, 'gross_revenue') - amountOf(totals, 'deduction');
  const grossProfit = netRevenue - amountOf(totals, 'cost');
  const operatingResult = grossProfit - amountOf(totals, 'operating_expense');
  const financialResult =
    amountOf(totals, 'financial_income') - amountOf(totals, 'financial_expense');
  const netIncome =
    operatingResult +
    financialResult +
    amountOf(totals, 'other_income') -
    amountOf(totals, 'other_expense');

  return {
    from,
    to,
    lines,
    netRevenue,
    grossProfit,
    operatingResult,
    financialResult,
    netIncome,
  };
}
