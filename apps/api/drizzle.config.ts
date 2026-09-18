import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './src/db/migrations',
  // Encontra todos os arquivos de schema dentro de qualquer módulo na pasta packages/modules
  schema: '../../packages/modules/**/src/db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
