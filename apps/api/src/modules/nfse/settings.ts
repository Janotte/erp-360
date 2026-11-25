import '../../types/fastify.ts';

import { nfseSettings } from '@erp-360/mod-nfse';
import { nfseSettingsMessage, nfseSettingsSchema, normalizeNfseSeries } from '@erp-360/shared';
import { eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { db } from '../../db/index.ts';

const nfseSettingsColumns = {
  environment: nfseSettings.environment,
  series: nfseSettings.series,
  simplesNacional: nfseSettings.simplesNacional,
  simplesAssessment: nfseSettings.simplesAssessment,
  ibsCbsAssessment: nfseSettings.ibsCbsAssessment,
  specialTaxRegime: nfseSettings.specialTaxRegime,
  issqnTaxation: nfseSettings.issqnTaxation,
};

function reject(message: string): never {
  const error = new Error(message) as Error & { status: number };
  error.status = 400;
  throw error;
}

export async function getOrCreateNfseSettings(tenantId: string) {
  const [existing] = await db
    .select(nfseSettingsColumns)
    .from(nfseSettings)
    .where(eq(nfseSettings.tenantId, tenantId))
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(nfseSettings)
    .values({ tenantId })
    .returning(nfseSettingsColumns);
  return created;
}

export const nfseSettingsRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('preHandler', fastify.autenticarETenant);

  fastify.get('/nfse', async (request) => {
    return getOrCreateNfseSettings(request.user.tenantId);
  });

  fastify.put('/nfse', { schema: { body: nfseSettingsSchema } }, async (request) => {
    const message = nfseSettingsMessage(request.body);
    if (message) reject(message);
    const series = normalizeNfseSeries(request.body.series);

    const tenantId = request.user.tenantId;
    await getOrCreateNfseSettings(tenantId);
    const [updated] = await db
      .update(nfseSettings)
      .set({ ...request.body, series })
      .where(eq(nfseSettings.tenantId, tenantId))
      .returning(nfseSettingsColumns);
    return updated;
  });
};
