import {
  financialSettings,
  planAccounts,
} from '@erp-360/mod-financial';
import { and, eq, ilike, or } from 'drizzle-orm';
import { db } from '../db/index.ts';

export type FinancialSettingsRow = typeof financialSettings.$inferSelect;

async function findPlanAccountByNames(tenantId: string, names: string[]) {
  const conditions = names.map((name) => ilike(planAccounts.name, name));
  const [account] = await db
    .select({ id: planAccounts.id })
    .from(planAccounts)
    .where(and(eq(planAccounts.tenantId, tenantId), or(...conditions)))
    .limit(1);
  return account?.id ?? null;
}

export async function getOrCreateFinancialSettings(
  tenantId: string,
): Promise<FinancialSettingsRow> {
  const [existing] = await db
    .select()
    .from(financialSettings)
    .where(eq(financialSettings.tenantId, tenantId))
    .limit(1);

  if (existing) {
    return existing;
  }

  const cashPlanAccountId = await findPlanAccountByNames(tenantId, [
    'Caixa Operacional',
    'Caixas',
  ]);
  const discountObtainedPlanAccountId = await findPlanAccountByNames(tenantId, [
    'Descontos Obtidos',
  ]);
  const discountGrantedPlanAccountId = await findPlanAccountByNames(tenantId, [
    'Descontos Concedidos',
  ]);
  const lateFeePaidPlanAccountId = await findPlanAccountByNames(tenantId, [
    'Multas e Juros Pagos',
  ]);
  const lateFeeReceivedPlanAccountId = await findPlanAccountByNames(tenantId, [
    'Multas e Juros Recebidos',
  ]);

  const [created] = await db
    .insert(financialSettings)
    .values({
      tenantId,
      lateFeeBps: 200,
      dailyInterestBps: 3,
      graceDays: 0,
      cashPlanAccountId,
      discountObtainedPlanAccountId,
      discountGrantedPlanAccountId,
      lateFeePaidPlanAccountId,
      lateFeeReceivedPlanAccountId,
    })
    .returning();

  return created;
}
