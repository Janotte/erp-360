import { pgTable, unique, uuid, varchar } from 'drizzle-orm/pg-core';

export const countries = pgTable(
  'countries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 60 }).notNull(),
    code: varchar('code', { length: 4 }).notNull(),
  },
  (table) => [
    unique('countries_name_unique').on(table.name),
    unique('countries_code_unique').on(table.code),
  ],
);
