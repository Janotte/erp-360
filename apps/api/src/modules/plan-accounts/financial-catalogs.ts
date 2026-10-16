import '../../types/fastify.ts';

import { cardBrands, paymentMethods, planAccounts } from '@erp-360/mod-financial';
import { planAccountDreLines, planAccountNatures } from '@erp-360/shared';
import { and, asc, eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { db } from '../../db/index.ts';

export const financialCatalogRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('preHandler', fastify.autenticarETenant);

  fastify.get(
    '/plan-accounts',
    {
      schema: {
        querystring: z.object({
          nature: z.enum(planAccountNatures).optional(),
          dreLine: z.enum(planAccountDreLines).optional(),
          acceptsEntries: z.enum(['true', 'false']).optional(),
          isTreasury: z.enum(['true', 'false']).optional(),
        }),
      },
    },
    async (request) => {
      const { tenantId } = request.user;
      const { nature, dreLine, acceptsEntries, isTreasury } = request.query;
      const conditions = [
        eq(planAccounts.tenantId, tenantId),
        eq(planAccounts.isActive, true),
      ];
      if (nature) conditions.push(eq(planAccounts.nature, nature));
      if (dreLine) conditions.push(eq(planAccounts.dreLine, dreLine));
      if (acceptsEntries) {
        conditions.push(eq(planAccounts.acceptsEntries, acceptsEntries === 'true'));
      }
      if (isTreasury) {
        conditions.push(eq(planAccounts.isTreasury, isTreasury === 'true'));
      }
      return db
        .select({
          id: planAccounts.id,
          accountCode: planAccounts.accountCode,
          name: planAccounts.name,
        })
        .from(planAccounts)
        .where(and(...conditions))
        .orderBy(asc(planAccounts.accountCode));
    },
  );

  fastify.get('/payment-methods', async () => {
    return db
      .select({
        id: paymentMethods.id,
        paymentTypeCode: paymentMethods.paymentTypeCode,
        description: paymentMethods.description,
      })
      .from(paymentMethods)
      .orderBy(asc(paymentMethods.description));
  });

  fastify.get('/card-brands', async () => {
    return db
      .select({
        id: cardBrands.id,
        name: cardBrands.name,
      })
      .from(cardBrands)
      .orderBy(asc(cardBrands.name));
  });
};
