import { pgTable, unique, uuid, varchar } from 'drizzle-orm/pg-core';

export const cardBrands = pgTable(
  'card_brands',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: varchar('code', { length: 2 }).notNull(),
    name: varchar('name', { length: 60 }).notNull(),
  },
  (table) => [
    unique('card_brands_code_unique').on(table.code),
    unique('card_brands_name_unique').on(table.name),
  ],
);
