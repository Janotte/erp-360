import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadDotenv } from 'dotenv';

import { prepareTestDatabase } from '../test/prepare-database.ts';

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

loadDotenv({ path: join(apiRoot, '.env') });
process.env.NODE_ENV = 'test';
process.env.DATABASE_NAME = 'erp360_test';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET com pelo menos 32 caracteres é necessário para os testes.');
}

await prepareTestDatabase();

const child = spawn(
  process.execPath,
  [
    '--import',
    'tsx',
    '--test',
    'test/certificate.test.ts',
    'test/inbound-cost.test.ts',
    'test/inbound-post.integration.test.ts',
    'test/certificate-connection.test.ts',
    'test/dashboard-period.test.ts',
    'test/settlement-math.test.ts',
    'test/title-list-status.test.ts',
    'test/settlement.integration.test.ts',
  ],
  {
    cwd: apiRoot,
    env: process.env,
    stdio: 'inherit',
  },
);

const exitCode = await new Promise<number>((resolve, reject) => {
  child.on('error', reject);
  child.on('exit', (code) => resolve(code ?? 1));
});

process.exit(exitCode);
