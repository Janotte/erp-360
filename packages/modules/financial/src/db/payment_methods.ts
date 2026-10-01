import { pgTable, unique, uuid, varchar } from 'drizzle-orm/pg-core';

export const paymentMethods = pgTable(
  'payment_methods',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    paymentTypeCode: varchar('payment_type_code', { length: 2 }).notNull(),
    description: varchar('description', { length: 60 }).notNull(),
  },
  (table) => [unique('payment_methods_type_code_unique').on(table.paymentTypeCode)],
);
