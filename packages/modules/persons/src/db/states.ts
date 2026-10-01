import { pgTable, unique, uuid, varchar } from 'drizzle-orm/pg-core';
import { countries } from './countries.ts';

export const states = pgTable(
  'states',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 60 }).notNull(),
    abbreviation: varchar('abbreviation', { length: 2 }).notNull(),
    code: varchar('code', { length: 2 }).notNull(),
    region: varchar('region', { length: 20 }).notNull(),
    countryId: uuid('country_id')
      .references(() => countries.id, {
        onDelete: 'restrict',
      })
      .notNull(),
  },
  (table) => [
    unique('states_country_name_unique').on(table.countryId, table.name),
    unique('states_country_code_unique').on(table.countryId, table.code),
    unique('states_country_abbreviation_unique').on(table.countryId, table.abbreviation),
  ],
);
