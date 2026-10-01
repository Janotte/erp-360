import * as coreSchema from '@erp-360/mod-core';
import * as personsSchema from '@erp-360/mod-persons';
import * as financialSchema from '@erp-360/mod-financial';
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, types } from 'pg';

// node-pg devolve smallint (INT2) como string; o front precisa de número 1 | 2 | 9
types.setTypeParser(21, (value) => (value == null ? null : Number.parseInt(value, 10)));

const schema = {
  ...coreSchema,
  ...personsSchema,
  ...financialSchema,
};

// Cria o pool de conexões com o PostgreSQL do Docker
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });
