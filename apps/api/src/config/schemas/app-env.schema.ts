import { z } from 'zod';

const nodeEnvSchema = z.enum(['development', 'test', 'production']);

export function parseCorsOrigins(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function isHttpOrigin(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  return (
    (url.protocol === 'http:' || url.protocol === 'https:') &&
    url.origin === value &&
    url.username === '' &&
    url.password === ''
  );
}

export const appEnvSchema = z
  .object({
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

    /** Origens do navegador autorizadas a chamar a API, separadas por vírgula. */
    CORS_ORIGINS: z.string().optional(),

    DATABASE_HOST: z.string().min(1),
    DATABASE_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
    DATABASE_NAME: z.string().min(1),
    DATABASE_USER: z.string().min(1),
    DATABASE_PASSWORD: z.string().min(1),

    JWT_SECRET: z.string().min(32),
    JWT_EXPIRES_IN: z.string().min(1).default('1d'),
  })
  .superRefine((data, ctx) => {
    const origins = parseCorsOrigins(data.CORS_ORIGINS);
    if (origins.length === 0) {
      if (data.NODE_ENV === 'production') {
        ctx.addIssue({
          code: 'custom',
          path: ['CORS_ORIGINS'],
          message: 'Informe ao menos uma origem permitida.',
        });
      }
      return;
    }

    for (const origin of origins) {
      if (!isHttpOrigin(origin)) {
        ctx.addIssue({
          code: 'custom',
          path: ['CORS_ORIGINS'],
          message: `Origem inválida: ${origin}`,
        });
      }
    }
  });

export type AppEnv = z.infer<typeof appEnvSchema>;
