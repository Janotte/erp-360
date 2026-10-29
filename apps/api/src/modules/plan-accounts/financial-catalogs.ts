import '../../types/fastify.ts';

import { cardBrands, meansOfPayment, planAccounts } from '@erp-360/mod-financial';
import { planAccountDreLines, planAccountNatures } from '@erp-360/shared';
import { and, asc, eq, gte, isNull, lte, or, sql } from 'drizzle-orm';
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

  fastify.get('/means-of-payment', async () => {
    return db
      .select({
        id: meansOfPayment.id,
        code: meansOfPayment.code,
        description: meansOfPayment.description,
        fiscalGroup: meansOfPayment.fiscalGroup,
      })
      .from(meansOfPayment)
      .where(
        and(
          eq(meansOfPayment.isSelectable, true),
          lte(meansOfPayment.startsOn, sql`CURRENT_DATE`),
          or(isNull(meansOfPayment.endsOn), gte(meansOfPayment.endsOn, sql`CURRENT_DATE`)),
        ),
      )
      .orderBy(asc(meansOfPayment.code));
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
