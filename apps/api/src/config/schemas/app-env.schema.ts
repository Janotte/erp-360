import { z } from 'zod';

const nodeEnvSchema = z.enum(['development', 'test', 'production']);

export const appEnvSchema = z.object({
  NODE_ENV: nodeEnvSchema.default('development'),

  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),

  APP_NAME: z.string().min(1).default('tax-engine-api'),
  APP_VERSION: z.string().min(1).default('1.0.0'),
  APP_BASE_URL: z.url().optional(),

  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),

  /** Se definido, duplica os logs para este ficheiro (JSON, append). Cria o diretório pai se não existir. */
  LOG_FILE_PATH: z.string().min(1).optional(),

  DATABASE_HOST: z.string().min(1),
  DATABASE_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
  DATABASE_NAME: z.string().min(1),
  DATABASE_USER: z.string().min(1),
  DATABASE_PASSWORD: z.string().min(1),

  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().min(1).default('1d'),
});

export type AppEnv = z.infer<typeof appEnvSchema>;
