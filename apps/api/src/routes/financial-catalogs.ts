import { cardBrands, paymentMethods, planAccounts } from '@erp-360/mod-financial';
import { asc, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/index.ts';
import '../types/fastify.ts';

export const financialCatalogRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.autenticarETenant);

  fastify.get('/plan-accounts', async (request) => {
    const { tenantId } = request.user;
    return db
      .select({
        id: planAccounts.id,
        accountCode: planAccounts.accountCode,
        name: planAccounts.name,
      })
      .from(planAccounts)
      .where(eq(planAccounts.tenantId, tenantId))
      .orderBy(asc(planAccounts.accountCode));
  });

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
