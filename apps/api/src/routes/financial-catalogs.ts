import { cardBrands, paymentMethods, planAccounts } from '@erp-360/mod-financial';
import { and, asc, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.ts';
import '../types/fastify.ts';

export const financialCatalogRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.autenticarETenant);

  fastify.get(
    '/plan-accounts',
    {
      schema: {
        querystring: z.object({
          type: z.enum(['revenue', 'expense', 'bank', 'withdrawal']).optional(),
        }),
      },
    },
    async (request) => {
      const { tenantId } = request.user;
      const { type } = request.query as { type?: 'revenue' | 'expense' | 'bank' | 'withdrawal' };
      const conditions = [
        eq(planAccounts.tenantId, tenantId),
        eq(planAccounts.isActive, true),
      ];
      if (type) conditions.push(eq(planAccounts.type, type));
      return db
        .select({
          id: planAccounts.id,
          accountCode: planAccounts.accountCode,
          name: planAccounts.name,
          type: planAccounts.type,
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
