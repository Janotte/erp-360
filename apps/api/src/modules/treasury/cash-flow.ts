import { bankAccounts, cashEntries, payables, receivables } from '@erp-360/mod-financial';
import { personContacts, persons } from '@erp-360/mod-persons';
import { civilDate } from '@erp-360/shared';
import { and, asc, desc, eq } from 'drizzle-orm';

import { db } from '../../db/index.ts';
import { addDays } from '../titles/settlement-math.ts';

export interface CashFlowAccount {
  name: string;
  balance: number;
}

export interface CashFlowMovement {
  id: string;
  documentNumber: string | null;
  personName: string;
  description: string;
  amount: number;
  phone: string | null;
  bearerName: string | null;
}

export interface CashFlowDay {
  date: string;
  weekday: number;
  inflows: number;
  outflows: number;
  difference: number;
  balance: number;
  receivables: CashFlowMovement[];
  payables: CashFlowMovement[];
}

export interface CashFlowReport {
  today: string;
  from: string;
  to: string;
  cashBalance: number;
  banks: CashFlowAccount[];
  openingBalance: number;
  overdueReceivables: CashFlowMovement[];
  overduePayables: CashFlowMovement[];
  days: CashFlowDay[];
  totals: { inflows: number; outflows: number; difference: number };
}

interface DatedMovement extends CashFlowMovement {
  dueOn: string;
}

export function weekdayIndex(isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function byPerson(a: CashFlowMovement, b: CashFlowMovement): number {
  const byName = a.personName.localeCompare(b.personName, 'pt-BR');
  if (byName !== 0) return byName;
  return (a.documentNumber ?? '').localeCompare(b.documentNumber ?? '', 'pt-BR');
}

function withoutDue(item: DatedMovement): CashFlowMovement {
  return {
    id: item.id,
    documentNumber: item.documentNumber,
    personName: item.personName,
    description: item.description,
    amount: item.amount,
    phone: item.phone,
    bearerName: item.bearerName,
  };
}

export function buildCashFlow(input: {
  today: string;
  days: number;
  cashBalance: number;
  banks: CashFlowAccount[];
  receivables: DatedMovement[];
  payables: DatedMovement[];
}): CashFlowReport {
  const from = input.today;
  const to = addDays(input.today, input.days - 1);
  const openingBalance =
    input.cashBalance + input.banks.reduce((sum, account) => sum + account.balance, 0);

  const overdueReceivables = input.receivables
    .filter((item) => item.dueOn < input.today)
    .map(withoutDue)
    .sort(byPerson);
  const overduePayables = input.payables
    .filter((item) => item.dueOn < input.today)
    .map(withoutDue)
    .sort(byPerson);

  const days: CashFlowDay[] = [];
  let balance = openingBalance;
  let inflows = 0;
  let outflows = 0;

  for (let offset = 0; offset < input.days; offset += 1) {
    const date = addDays(input.today, offset);
    const receivables = input.receivables
      .filter((item) => item.dueOn === date)
      .map(withoutDue)
      .sort(byPerson);
    const payables = input.payables
      .filter((item) => item.dueOn === date)
      .map(withoutDue)
      .sort(byPerson);
    const dayIn = receivables.reduce((sum, item) => sum + item.amount, 0);
    const dayOut = payables.reduce((sum, item) => sum + item.amount, 0);
    const difference = dayIn - dayOut;
    balance += difference;
    inflows += dayIn;
    outflows += dayOut;
    days.push({
      date,
      weekday: weekdayIndex(date),
      inflows: dayIn,
      outflows: dayOut,
      difference,
      balance,
      receivables,
      payables,
    });
  }

  return {
    today: input.today,
    from,
    to,
    cashBalance: input.cashBalance,
    banks: input.banks,
    openingBalance,
    overdueReceivables,
    overduePayables,
    days,
    totals: { inflows, outflows, difference: inflows - outflows },
  };
}

function phoneOf(row: {
  phone: string | null;
  mobilePhone: string | null;
  whatsapp: string | null;
}): string | null {
  return row.mobilePhone || row.phone || row.whatsapp || null;
}

export async function loadCashFlow(
  tenantId: string,
  days = 61,
  today = civilDate(),
): Promise<CashFlowReport> {
  const [cash] = await db
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
    .limit(1);

  const banks = await db
    .select({ name: bankAccounts.name, balance: bankAccounts.balance })
    .from(bankAccounts)
    .where(and(eq(bankAccounts.tenantId, tenantId), eq(bankAccounts.kind, 'operating')))
    .orderBy(asc(bankAccounts.name));

  const receivableRows = await db
    .select({
      id: receivables.id,
      documentNumber: receivables.documentNumber,
      description: receivables.description,
      dueOn: receivables.dueOn,
      amount: receivables.installmentAmount,
      personName: persons.name,
      bearerName: receivables.bearerName,
      phone: personContacts.phone,
      mobilePhone: personContacts.mobilePhone,
      whatsapp: personContacts.whatsapp,
    })
    .from(receivables)
    .innerJoin(
      persons,
      and(
        eq(persons.id, receivables.debtorId),
        eq(persons.tenantId, receivables.tenantId),
      ),
    )
    .leftJoin(
      personContacts,
      and(
        eq(personContacts.personId, persons.id),
        eq(personContacts.tenantId, persons.tenantId),
        eq(personContacts.type, 'Principal'),
      ),
    )
    .where(and(eq(receivables.tenantId, tenantId), eq(receivables.status, 'pendente')));

  const payableRows = await db
    .select({
      id: payables.id,
      documentNumber: payables.documentNumber,
      description: payables.description,
      dueOn: payables.dueOn,
      amount: payables.installmentAmount,
      personName: persons.name,
      phone: personContacts.phone,
      mobilePhone: personContacts.mobilePhone,
      whatsapp: personContacts.whatsapp,
    })
    .from(payables)
    .innerJoin(
      persons,
      and(eq(persons.id, payables.creditorId), eq(persons.tenantId, payables.tenantId)),
    )
    .leftJoin(
      personContacts,
      and(
        eq(personContacts.personId, persons.id),
        eq(personContacts.tenantId, persons.tenantId),
        eq(personContacts.type, 'Principal'),
      ),
    )
    .where(and(eq(payables.tenantId, tenantId), eq(payables.status, 'pendente')));

  return buildCashFlow({
    today,
    days,
    cashBalance: cash?.balance ?? 0,
    banks,
    receivables: receivableRows.map((row) => ({
      id: row.id,
      documentNumber: row.documentNumber,
      personName: row.personName,
      description: row.description,
      amount: row.amount,
      dueOn: row.dueOn,
      phone: phoneOf(row),
      bearerName: row.bearerName,
    })),
    payables: payableRows.map((row) => ({
      id: row.id,
      documentNumber: row.documentNumber,
      personName: row.personName,
      description: row.description,
      amount: row.amount,
      dueOn: row.dueOn,
      phone: phoneOf(row),
      bearerName: null,
    })),
  });
}
