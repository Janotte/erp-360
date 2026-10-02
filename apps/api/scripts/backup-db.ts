import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { env } from '../src/config/index.ts';

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function buildDefaultOutputPath(): string {
  const now = new Date();
  const timestamp =
    [now.getFullYear(), pad(now.getMonth() + 1), pad(now.getDate())].join('-') +
    '_' +
    [pad(now.getHours()), pad(now.getMinutes()), pad(now.getSeconds())].join('');

  return resolve(
    process.cwd(),
    'backups',
    `erp360-${env.database.name}-${timestamp}.dump`,
  );
}

function main() {
  const outputFileArg = process.argv[2];
  const outputPath = outputFileArg
    ? resolve(process.cwd(), outputFileArg)
    : buildDefaultOutputPath();

  mkdirSync(dirname(outputPath), { recursive: true });

  console.log(`📦 Gerando backup completo em: ${outputPath}`);

  const result = spawnSync(
    'pg_dump',
    [
      '--format=custom',
      '--blobs',
      '--verbose',
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
      '--file',
      outputPath,
    ],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        PGPASSWORD: env.database.password,
      },
    },
  );

  if (result.error) {
    if ((result.error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.error(
        '❌ pg_dump não encontrado. Instale PostgreSQL client tools e tente novamente.',
      );
      process.exit(1);
    }

    console.error(result.error);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  console.log('✅ Backup concluído com sucesso.');
}

main();
