import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

const testDatabase = 'erp360_test';
const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

export async function prepareTestDatabase() {
  const host = process.env.DATABASE_HOST;
  const port = Number(process.env.DATABASE_PORT ?? 5432);
  const user = process.env.DATABASE_USER;
  const password = process.env.DATABASE_PASSWORD;
  if (!host || !user || !password) {
    throw new Error(
      'Defina DATABASE_HOST, DATABASE_USER e DATABASE_PASSWORD para criar o banco de teste.',
    );
  }

  const admin = new pg.Client({ host, port, user, password, database: 'postgres' });
  await admin.connect();
  const existing = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [
    testDatabase,
  ]);
  if (existing.rowCount === 0) {
    await admin.query(`CREATE DATABASE "${testDatabase}"`);
  }
  await admin.end();

  const pool = new pg.Pool({ host, port, user, password, database: testDatabase });
  try {
    await migrate(drizzle(pool), {
      migrationsFolder: join(apiRoot, 'src/db/migrations'),
    });
  } finally {
    await pool.end();
  }
}
