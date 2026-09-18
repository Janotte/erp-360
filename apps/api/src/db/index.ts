import * as coreSchema from '@erp-360/mod-core';
import * as personsSchema from '@erp-360/mod-persons';
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

const schema = {
  ...coreSchema,
  ...personsSchema,
};

// Cria o pool de conexões com o PostgreSQL do Docker
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });
