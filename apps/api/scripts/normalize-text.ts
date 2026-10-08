/**
 * Aplica Title Case pt-BR nos textos já cadastrados.
 * Uso: pnpm --filter @erp-360/api exec tsx scripts/normalize-text.ts
 */

import { config } from 'dotenv';
import { eq } from 'drizzle-orm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { toTitleCasePtBr } from '@erp-360/shared';

const scriptDir = dirname(fileURLToPath(import.meta.url));
config({ path: join(scriptDir, '..', '.env') });

const { db } = await import('../src/db/index.ts');
const { tenants, users } = await import('@erp-360/mod-core');
const { personAddresses, personContacts, persons } = await import('@erp-360/mod-persons');

function changed(current: string | null | undefined, next: string | null) {
  return (current ?? null) !== next;
}

const personRows = await db.select().from(persons);
for (const row of personRows) {
  if (row.preserveNameCasing) continue;
  const name = toTitleCasePtBr(row.name);
  if (!changed(row.name, name)) continue;
  await db.update(persons).set({ name }).where(eq(persons.id, row.id));
}

const contactRows = await db.select().from(personContacts);
for (const row of contactRows) {
  const name = toTitleCasePtBr(row.name);
  const relationship = row.relationship ? toTitleCasePtBr(row.relationship) : null;
  if (!changed(row.name, name) && !changed(row.relationship, relationship)) continue;
  await db
    .update(personContacts)
    .set({ name, relationship })
    .where(eq(personContacts.id, row.id));
}

const addressRows = await db.select().from(personAddresses);
for (const row of addressRows) {
  const street = row.street ? toTitleCasePtBr(row.street) : null;
  const complement = row.complement ? toTitleCasePtBr(row.complement) : null;
  const neighborhood = row.neighborhood ? toTitleCasePtBr(row.neighborhood) : null;
  if (
    !changed(row.street, street) &&
    !changed(row.complement, complement) &&
    !changed(row.neighborhood, neighborhood)
  ) {
    continue;
  }
  await db
    .update(personAddresses)
    .set({ street, complement, neighborhood })
    .where(eq(personAddresses.id, row.id));
}

const tenantRows = await db.select().from(tenants);
for (const row of tenantRows) {
  const name = toTitleCasePtBr(row.name);
  if (!changed(row.name, name)) continue;
  await db.update(tenants).set({ name }).where(eq(tenants.id, row.id));
}

const userRows = await db.select().from(users);
for (const row of userRows) {
  const name = toTitleCasePtBr(row.name);
  if (!changed(row.name, name)) continue;
  await db.update(users).set({ name }).where(eq(users.id, row.id));
}

console.log(
  `Textos normalizados: ${personRows.length} pessoas, ${contactRows.length} contatos, ${addressRows.length} endereços.`,
);
process.exit(0);
