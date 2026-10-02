import * as coreSchema from '@erp-360/mod-core';
import * as personsSchema from '@erp-360/mod-persons';
import * as financialSchema from '@erp-360/mod-financial';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, types } from 'pg';
import { env } from '../config/index.ts';

// node-pg devolve smallint (INT2) como string; o front precisa de número 1 | 2 | 9
types.setTypeParser(21, (value) => (value == null ? null : Number.parseInt(value, 10)));

const schema = {
  ...coreSchema,
  ...personsSchema,
  ...financialSchema,
};

const pool = new Pool({
  host: env.database.host,
  port: env.database.port,
  database: env.database.name,
  user: env.database.user,
  password: env.database.password,
});

export const db = drizzle(pool, { schema });
