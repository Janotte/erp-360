import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

const host = process.env.DATABASE_HOST;
const port = process.env.DATABASE_PORT ?? '5432';
const user = process.env.DATABASE_USER;
const password = process.env.DATABASE_PASSWORD;
const database = process.env.DATABASE_NAME;

if (!host || !user || !password || !database) {
  throw new Error(
    'Defina DATABASE_HOST, DATABASE_USER, DATABASE_PASSWORD e DATABASE_NAME no .env',
  );
}

const url = `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;

export default defineConfig({
  out: './src/db/migrations',
  // Encontra todos os arquivos de schema dentro de qualquer módulo na pasta packages/modules
  schema: '../../packages/modules/**/src/db/*.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url,
  },
});
