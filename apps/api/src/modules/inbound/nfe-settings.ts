import '../../types/fastify.ts';

import { nfeSettings } from '@erp-360/mod-inbound';
import { certificateEnvironments } from '@erp-360/shared';
import { eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { db } from '../../db/index.ts';

const nfeSettingsBody = z.object({
  environment: z.enum(certificateEnvironments),
});

export async function getOrCreateNfeSettings(tenantId: string) {
  const [existing] = await db
    .select({ environment: nfeSettings.environment })
    .from(nfeSettings)
    .where(eq(nfeSettings.tenantId, tenantId))
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(nfeSettings)
    .values({ tenantId })
    .returning({ environment: nfeSettings.environment });
  return created;
}

export const nfeSettingsRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('preHandler', fastify.autenticarETenant);

  fastify.get('/nfe', async (request) => {
    return getOrCreateNfeSettings(request.user.tenantId);
  });

  fastify.put('/nfe', { schema: { body: nfeSettingsBody } }, async (request) => {
    const tenantId = request.user.tenantId;
    await getOrCreateNfeSettings(tenantId);
    const [updated] = await db
      .update(nfeSettings)
      .set({ environment: request.body.environment })
      .where(eq(nfeSettings.tenantId, tenantId))
      .returning({ environment: nfeSettings.environment });
    return updated;
  });
};
