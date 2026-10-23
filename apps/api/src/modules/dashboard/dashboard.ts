import '../../types/fastify.ts';

import {
  bankAccounts,
  cashEntries,
  payables,
  paymentMethods,
  receivables,
} from '@erp-360/mod-financial';
import { civilDate, dashboardSchema } from '@erp-360/shared';
import { and, asc, desc, eq, gte, isNull, lte, ne, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { db } from '../../db/index.ts';

export function dashboardPeriod(today: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) {
    throw new Error('Data inválida.');
  }
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const lastDay = new Date(year, month, 0).getDate();
  return {
    today,
    monthFrom: `${today.slice(0, 7)}-01`,
    monthTo: `${today.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`,
  };
}

function cents(value: unknown) {
  return Number(value ?? 0);
}

function slices(
  rows: Array<{
    paymentMethodId: string | null;
    description: string | null;
    amount: unknown;
  }>,
) {
  return rows
    .map((row) => ({
      paymentMethodId: row.paymentMethodId,
      description: row.description || 'Sem forma de pagamento',
      amount: cents(row.amount),
    }))
    .filter((row) => row.amount > 0)
    .sort((left, right) => right.amount - left.amount);
}

export async function loadDashboard(tenantId: string, today = civilDate()) {
  const period = dashboardPeriod(today);

  const receivableFilters = {
    dayTotal: sql<string>`coalesce(sum(${receivables.installmentAmount}) filter (where ${receivables.dueOn} = cast(${period.today} as date) and ${receivables.status} <> 'cancelado'), 0)`,
    daySettled: sql<string>`coalesce(sum(${receivables.receivedAmount}) filter (where ${receivables.dueOn} = cast(${period.today} as date) and ${receivables.status} = 'recebido'), 0)`,
    monthTotal: sql<string>`coalesce(sum(${receivables.installmentAmount}) filter (where ${receivables.dueOn} >= cast(${period.monthFrom} as date) and ${receivables.dueOn} <= cast(${period.monthTo} as date) and ${receivables.status} <> 'cancelado'), 0)`,
    monthSettled: sql<string>`coalesce(sum(${receivables.receivedAmount}) filter (where ${receivables.dueOn} >= cast(${period.monthFrom} as date) and ${receivables.dueOn} <= cast(${period.monthTo} as date) and ${receivables.status} = 'recebido'), 0)`,
    monthOverdue: sql<string>`coalesce(sum(${receivables.installmentAmount}) filter (where ${receivables.status} = 'pendente' and ${receivables.dueOn} >= cast(${period.monthFrom} as date) and ${receivables.dueOn} < cast(${period.today} as date)), 0)`,
    delinquency: sql<string>`coalesce(sum(${receivables.installmentAmount}) filter (where ${receivables.status} = 'pendente' and ${receivables.dueOn} < cast(${period.today} as date)), 0)`,
    salesDay: sql<string>`coalesce(sum(${receivables.installmentAmount}) filter (where ${receivables.issueOn} = cast(${period.today} as date) and ${receivables.originalTitleId} is null and ${receivables.status} <> 'cancelado'), 0)`,
    salesMonth: sql<string>`coalesce(sum(${receivables.installmentAmount}) filter (where ${receivables.issueOn} >= cast(${period.monthFrom} as date) and ${receivables.issueOn} <= cast(${period.monthTo} as date) and ${receivables.originalTitleId} is null and ${receivables.status} <> 'cancelado'), 0)`,
  };

  const payableFilters = {
    dayTotal: sql<string>`coalesce(sum(${payables.installmentAmount}) filter (where ${payables.dueOn} = cast(${period.today} as date) and ${payables.status} <> 'cancelado'), 0)`,
    daySettled: sql<string>`coalesce(sum(${payables.paidAmount}) filter (where ${payables.dueOn} = cast(${period.today} as date) and ${payables.status} = 'pago'), 0)`,
    monthTotal: sql<string>`coalesce(sum(${payables.installmentAmount}) filter (where ${payables.dueOn} >= cast(${period.monthFrom} as date) and ${payables.dueOn} <= cast(${period.monthTo} as date) and ${payables.status} <> 'cancelado'), 0)`,
    monthSettled: sql<string>`coalesce(sum(${payables.paidAmount}) filter (where ${payables.dueOn} >= cast(${period.monthFrom} as date) and ${payables.dueOn} <= cast(${period.monthTo} as date) and ${payables.status} = 'pago'), 0)`,
    monthOverdue: sql<string>`coalesce(sum(${payables.installmentAmount}) filter (where ${payables.status} = 'pendente' and ${payables.dueOn} >= cast(${period.monthFrom} as date) and ${payables.dueOn} < cast(${period.today} as date)), 0)`,
    delinquency: sql<string>`coalesce(sum(${payables.installmentAmount}) filter (where ${payables.status} = 'pendente' and ${payables.dueOn} < cast(${period.today} as date)), 0)`,
  };

  const [receivableRow, payableRow, paymentRows, cashRow, banks] = await Promise.all([
    db
      .select(receivableFilters)
      .from(receivables)
      .where(eq(receivables.tenantId, tenantId))
      .then((rows) => rows[0]),
    db
      .select(payableFilters)
      .from(payables)
      .where(eq(payables.tenantId, tenantId))
      .then((rows) => rows[0]),
    db
      .select({
        paymentMethodId: receivables.paymentMethodId,
        description: paymentMethods.description,
        dayAmount: sql<string>`coalesce(sum(${receivables.installmentAmount}) filter (where ${receivables.issueOn} = cast(${period.today} as date)), 0)`,
        monthAmount: sql<string>`coalesce(sum(${receivables.installmentAmount}) filter (where ${receivables.issueOn} >= cast(${period.monthFrom} as date) and ${receivables.issueOn} <= cast(${period.monthTo} as date)), 0)`,
      })
      .from(receivables)
      .leftJoin(paymentMethods, eq(receivables.paymentMethodId, paymentMethods.id))
      .where(
        and(
          eq(receivables.tenantId, tenantId),
          ne(receivables.status, 'cancelado'),
          isNull(receivables.originalTitleId),
          gte(receivables.issueOn, period.monthFrom),
          lte(receivables.issueOn, period.monthTo),
        ),
      )
      .groupBy(receivables.paymentMethodId, paymentMethods.description),
    db
      .select({ balance: cashEntries.balance })
      .from(cashEntries)
      .where(eq(cashEntries.tenantId, tenantId))
      .orderBy(
        desc(cashEntries.occurredOn),
        asc(cashEntries.openingBalance),
        desc(cashEntries.createdAt),
        desc(cashEntries.description),
        desc(cashEntries.id),
      )
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select({
        id: bankAccounts.id,
        name: bankAccounts.name,
        kind: bankAccounts.kind,
        balance: bankAccounts.balance,
      })
      .from(bankAccounts)
      .where(eq(bankAccounts.tenantId, tenantId))
      .orderBy(asc(bankAccounts.name)),
  ]);

  const summary = {
    asOf: period.today,
    monthFrom: period.monthFrom,
    monthTo: period.monthTo,
    receivables: {
      day: {
        total: cents(receivableRow?.dayTotal),
        settled: cents(receivableRow?.daySettled),
      },
      month: {
        total: cents(receivableRow?.monthTotal),
        settled: cents(receivableRow?.monthSettled),
        overdue: cents(receivableRow?.monthOverdue),
      },
      delinquency: cents(receivableRow?.delinquency),
    },
    payables: {
      day: {
        total: cents(payableRow?.dayTotal),
        settled: cents(payableRow?.daySettled),
      },
      month: {
        total: cents(payableRow?.monthTotal),
        settled: cents(payableRow?.monthSettled),
        overdue: cents(payableRow?.monthOverdue),
      },
      delinquency: cents(payableRow?.delinquency),
    },
    sales: {
      day: cents(receivableRow?.salesDay),
      month: cents(receivableRow?.salesMonth),
      byPaymentMethod: {
        day: slices(
          paymentRows.map((row) => ({
            paymentMethodId: row.paymentMethodId,
            description: row.description,
            amount: row.dayAmount,
          })),
        ),
        month: slices(
          paymentRows.map((row) => ({
            paymentMethodId: row.paymentMethodId,
            description: row.description,
            amount: row.monthAmount,
          })),
        ),
      },
    },
    treasury: {
      cashBalance: cents(cashRow?.balance),
      operating: banks
        .filter((account) => account.kind !== 'investment')
        .map((account) => ({
          id: account.id,
          name: account.name,
          balance: account.balance,
        })),
      investments: banks
        .filter((account) => account.kind === 'investment')
        .map((account) => ({
          id: account.id,
          name: account.name,
          balance: account.balance,
        })),
    },
  };

  return dashboardSchema.parse(summary);
}

export const dashboardRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('preHandler', fastify.autenticarETenant);

  fastify.get(
    '/',
    {
      schema: {
        response: { 200: dashboardSchema },
      },
    },
    async (request) => loadDashboard(request.user.tenantId),
  );
};
