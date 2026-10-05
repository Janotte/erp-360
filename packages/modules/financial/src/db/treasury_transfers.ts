import { tenantColumns } from '@erp-360/mod-core';
import { date, foreignKey, integer, pgTable, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';
import { bankAccounts } from './bank_accounts.ts';
import { treasuryKindEnum } from './settlements.ts';

export const treasuryTransfers = pgTable(
  'treasury_transfers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...tenantColumns,
    occurredOn: date('occurred_on').notNull(),
    amount: integer('amount').notNull(),
    fromTreasury: treasuryKindEnum('from_treasury').notNull(),
    fromBankAccountId: uuid('from_bank_account_id'),
    toTreasury: treasuryKindEnum('to_treasury').notNull(),
    toBankAccountId: uuid('to_bank_account_id'),
    description: varchar('description', { length: 255 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    unique('treasury_transfers_id_tenant_id_unique').on(table.id, table.tenantId),
    foreignKey({
      name: 'treasury_transfers_from_bank_account_tenant_fk',
      columns: [table.fromBankAccountId, table.tenantId],
      foreignColumns: [bankAccounts.id, bankAccounts.tenantId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'treasury_transfers_to_bank_account_tenant_fk',
      columns: [table.toBankAccountId, table.tenantId],
      foreignColumns: [bankAccounts.id, bankAccounts.tenantId],
    }).onDelete('restrict'),
  ],
);
