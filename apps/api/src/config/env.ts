import { config as loadDotenv } from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';
import { AppEnv, appEnvSchema } from './schemas/app-env.schema.ts';

loadDotenv({
  path: join(dirname(fileURLToPath(import.meta.url)), '../../.env'),
});

function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join('.') || '(root)';
      return `${path}: ${issue.message}`;
    })
    .join('\n');
}

function loadEnv(): AppEnv {
  const parsed = appEnvSchema.safeParse(process.env);

  if (!parsed.success) {
    const formatted = formatZodError(parsed.error);
    throw new Error(`Invalid environment variables:\n${formatted}`);
  }

  return parsed.data;
}

const rawEnv = loadEnv();

export const env = {
  nodeEnv: rawEnv.NODE_ENV,
  isDevelopment: rawEnv.NODE_ENV === 'development',
  isTest: rawEnv.NODE_ENV === 'test',
  isProduction: rawEnv.NODE_ENV === 'production',

  app: {
    name: rawEnv.APP_NAME,
    version: rawEnv.APP_VERSION,
    host: rawEnv.HOST,
    port: rawEnv.PORT,
    baseUrl: rawEnv.APP_BASE_URL ?? null,
    logLevel: rawEnv.LOG_LEVEL,
    logFilePath: rawEnv.LOG_FILE_PATH ?? null,
  },

  database: {
    host: rawEnv.DATABASE_HOST,
    port: rawEnv.DATABASE_PORT,
    name: rawEnv.DATABASE_NAME,
    user: rawEnv.DATABASE_USER,
    password: rawEnv.DATABASE_PASSWORD,
  },

  auth: {
    jwtSecret: rawEnv.JWT_SECRET,
    jwtExpiresIn: rawEnv.JWT_EXPIRES_IN,
  },
} as const;

export type Env = typeof env;
