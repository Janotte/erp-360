import { sql } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  integer,
  pgTable,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { states } from './states.ts';

export const cities = pgTable(
  'cities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 60 }).notNull(),
    code: varchar('code', { length: 7 }).notNull(),
    stateId: uuid('state_id')
      .references(() => states.id, {
        onDelete: 'restrict',
      })
      .notNull(),
    isCapital: boolean('is_capital').default(false).notNull(),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    population: integer('population'),
    timezone: varchar('timezone', { length: 70 }),
  },
  (table) => [
    unique('cities_state_name_unique').on(table.stateId, table.name),
    unique('cities_state_code_unique').on(table.stateId, table.code),
    uniqueIndex('cities_one_capital_per_state')
      .on(table.stateId)
      .where(sql`${table.isCapital} = true`),
  ],
);
