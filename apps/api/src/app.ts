import './types/fastify.js';

import cors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import Fastify from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  ZodTypeProvider,
} from 'fastify-type-provider-zod';

import { env } from './config/index.ts';
import { registerErrorHandler } from './lib/error-handler.ts';
import { activeUser } from './modules/auth/active-user.ts';
import { authRoutes } from './modules/auth/auth.js';
import { categoryRoutes } from './modules/catalog/categories.ts';
import { itemRoutes } from './modules/catalog/items.ts';
import { measureRoutes } from './modules/catalog/measures.ts';
import { ncmRoutes } from './modules/catalog/ncms.ts';
import { locationsRoutes } from './modules/persons/locations.ts';
import { personsRoutes } from './modules/persons/persons.ts';
import { financialCatalogRoutes } from './modules/plan-accounts/financial-catalogs.ts';
import { planAccountsRoutes } from './modules/plan-accounts/plan-accounts.ts';
import { dashboardRoutes } from './modules/dashboard/dashboard.ts';
import { payablesRoutes } from './modules/titles/payables.ts';
import { receivablesRoutes } from './modules/titles/receivables.ts';
import { emitterRoutes } from './modules/tenants/emitter.ts';
import { treasuryRoutes } from './modules/treasury/treasury.ts';

export function buildApp(options?: { logger?: boolean }) {
  const fastify = Fastify({
    logger: options?.logger ?? true,
  }).withTypeProvider<ZodTypeProvider>();

  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);

  fastify.register(cors, {
    origin: [...env.cors.origins],
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  fastify.register(fastifyJwt, {
    secret: env.auth.jwtSecret,
    sign: { expiresIn: env.auth.jwtExpiresIn },
  });

  registerErrorHandler(fastify);

  fastify.decorate('autenticarETenant', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ message: 'Não autorizado' });
    }

    const user = await activeUser(request.user.userId, request.user.tenantId);
    if (!user) {
      return reply.status(401).send({ message: 'Não autorizado' });
    }
  });

  fastify.register(dashboardRoutes, { prefix: '/dashboard' });
  fastify.register(authRoutes, { prefix: '/auth' });
  fastify.register(personsRoutes, { prefix: '/persons' });
  fastify.register(locationsRoutes, { prefix: '/locations' });
  fastify.register(payablesRoutes, { prefix: '/payables' });
  fastify.register(receivablesRoutes, { prefix: '/receivables' });
  fastify.register(financialCatalogRoutes, { prefix: '/financial' });
  fastify.register(treasuryRoutes, { prefix: '/financial' });
  fastify.register(emitterRoutes, { prefix: '/settings' });
  fastify.register(planAccountsRoutes, { prefix: '/plan-accounts' });
  fastify.register(categoryRoutes, { prefix: '/catalog/categories' });
  fastify.register(itemRoutes, { prefix: '/catalog/items' });
  fastify.register(measureRoutes, { prefix: '/catalog/measures' });
  fastify.register(ncmRoutes, { prefix: '/catalog/ncms' });

  return fastify;
}
