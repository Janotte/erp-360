import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

import { env } from '../src/config/index.ts';

const USAGE = 'Uso: pnpm --filter @erp-360/api db:restore -- --confirm [arquivo.dump]';

function backupsDir(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '../backups');
}

function latestDumpPath(): string | null {
  const dir = backupsDir();
  if (!existsSync(dir)) return null;

  const dumps = readdirSync(dir)
    .filter((name) => name.endsWith('.dump'))
    .map((name) => join(dir, name))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);

  return dumps[0] ?? null;
}

function parseArgs(argv: string[]) {
  const confirmed = argv.includes('--confirm');
  const fileArg = argv.find((arg) => arg !== '--confirm');
  return { confirmed, fileArg };
}

/** pg_dump 17+ emite SET transaction_timeout; o Postgres 16 não reconhece o parâmetro. */
function isHarmlessClientServerMismatch(stderr: string): boolean {
  const errors = [...stderr.matchAll(/^pg_restore: error:.*$/gm)].map(
    (match) => match[0],
  );
  return (
    errors.length > 0 && errors.every((line) => line.includes('transaction_timeout'))
  );
}

/** O dump não conhece objetos criados depois dele. --clean não os apaga e o DROP das tabelas antigas falha. */
async function emptyDatabase() {
  const client = new pg.Client({
    host: env.database.host,
    port: env.database.port,
    database: env.database.name,
    user: env.database.user,
    password: env.database.password,
  });
  await client.connect();
  try {
    await client.query(`
      select pg_terminate_backend(pid)
      from pg_stat_activity
      where datname = current_database()
        and pid <> pg_backend_pid()
    `);
    await client.query('drop schema if exists public cascade');
    await client.query('drop schema if exists drizzle cascade');
    await client.query('create schema public');
    await client.query('create schema drizzle');
    await client.query('grant all on schema public to public');
    await client.query('grant all on schema drizzle to public');
  } finally {
    await client.end();
  }
}

async function main() {
  const { confirmed, fileArg } = parseArgs(process.argv.slice(2));

  if (!confirmed) {
    console.error(USAGE);
    console.error('❌ Operação cancelada. Para restaurar, adicione a flag --confirm.');
    process.exit(1);
  }

  const backupPath = fileArg ? resolve(process.cwd(), fileArg) : latestDumpPath();

  if (!backupPath) {
    console.error('❌ Nenhum arquivo .dump encontrado em apps/api/backups.');
    console.error(USAGE);
    process.exit(1);
  }

  if (!existsSync(backupPath)) {
    console.error(`❌ Arquivo de backup não encontrado: ${backupPath}`);
    process.exit(1);
  }

  console.log(`♻️ Restaurando backup em ${env.database.name} a partir de: ${backupPath}`);
  await emptyDatabase();

  const result = spawnSync(
    'pg_restore',
    [
      '--verbose',
      '--clean',
      '--if-exists',
      '--no-owner',
      '--no-privileges',
      '--host',
      env.database.host,
      '--port',
      String(env.database.port),
      '--username',
      env.database.user,
      '--dbname',
      env.database.name,
      backupPath,
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        PGPASSWORD: env.database.password,
      },
    },
  );

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.error) {
    if ((result.error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.error(
        '❌ pg_restore não encontrado. Instale PostgreSQL client tools e tente novamente.',
      );
      process.exit(1);
    }

    console.error(result.error);
    process.exit(1);
  }

  if (result.status !== 0 && !isHarmlessClientServerMismatch(result.stderr ?? '')) {
    process.exit(result.status ?? 1);
  }

  console.log('✅ Restauração concluída com sucesso.');
}

await main();
