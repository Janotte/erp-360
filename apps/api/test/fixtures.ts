import { randomInt, randomUUID } from 'node:crypto';

import { tenants, users } from '@erp-360/mod-core';
import {
  cashEntries,
  financialSettings,
  payables,
  receivables,
  settlements,
} from '@erp-360/mod-financial';
import { persons } from '@erp-360/mod-persons';
import { eq } from 'drizzle-orm';

import { db } from '../src/db/index.ts';

const amount = 150_000;
const dueOn = '2026-10-16';

export function settlementInput(kind: 'payable' | 'receivable', tenantId: string, titleId: string) {
  return {
    kind,
    tenantId,
    titleId,
    settledOn: dueOn,
    settledAmount: amount,
    treasury: 'cash' as const,
  };
}

function cnpj() {
  return Array.from({ length: 14 }, () => String(randomInt(0, 10))).join('');
}

export async function createCompany(label: string) {
  const [tenant] = await db
    .insert(tenants)
    .values({
      name: `${label} ${randomUUID()}`.slice(0, 60),
      tradeName: label.slice(0, 60),
      cnpj: cnpj(),
    })
    .returning({ id: tenants.id });
  const [user] = await db
    .insert(users)
    .values({
      tenantId: tenant.id,
      name: label,
      email: `${randomUUID()}@test.erp360`,
      passwordHash: 'not-used',
    })
    .returning({ id: users.id });
  const [person] = await db
    .insert(persons)
    .values({
      tenantId: tenant.id,
      name: label,
      isSupplier: true,
      isClient: true,
    })
    .returning({ id: persons.id });

  return { tenantId: tenant.id, userId: user.id, personId: person.id };
}

export async function createTitle(
  kind: 'payable' | 'receivable',
  tenantId: string,
  personId: string,
) {
  if (kind === 'payable') {
    const [title] = await db
      .insert(payables)
      .values({
        tenantId,
        creditorId: personId,
        description: 'Aluguel',
        issueOn: dueOn,
        installmentAmount: amount,
        dueOn,
        status: 'pendente',
      })
      .returning({ id: payables.id });
    return title.id;
  }

  const [title] = await db
    .insert(receivables)
    .values({
      tenantId,
      debtorId: personId,
      description: 'Mensalidade',
      issueOn: dueOn,
      installmentAmount: amount,
      dueOn,
      status: 'pendente',
    })
    .returning({ id: receivables.id });
  return title.id;
}

export async function ensureSettings(tenantId: string) {
  await db.insert(financialSettings).values({ tenantId }).onConflictDoNothing();
}

export async function removeCompany(tenantId: string) {
  await db.delete(cashEntries).where(eq(cashEntries.tenantId, tenantId));
  await db.delete(settlements).where(eq(settlements.tenantId, tenantId));
  await db.delete(payables).where(eq(payables.tenantId, tenantId));
  await db.delete(receivables).where(eq(receivables.tenantId, tenantId));
  await db.delete(persons).where(eq(persons.tenantId, tenantId));
  await db.delete(financialSettings).where(eq(financialSettings.tenantId, tenantId));
  await db.delete(users).where(eq(users.tenantId, tenantId));
  await db.delete(tenants).where(eq(tenants.id, tenantId));
}
