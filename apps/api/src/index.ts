import cors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import Fastify from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  ZodTypeProvider,
} from 'fastify-type-provider-zod';

import { API_URL } from '@erp-360/shared';
import { env } from './config/index.ts';
import { authRoutes } from './routes/auth.js';
import { financialCatalogRoutes } from './routes/financial-catalogs.ts';
import { locationsRoutes } from './routes/locations.ts';
import { payablesRoutes } from './routes/payables.ts';
import { personsRoutes } from './routes/persons.ts';
import { planAccountsRoutes } from './routes/plan-accounts.ts';
import { receivablesRoutes } from './routes/receivables.ts';
import { treasuryRoutes } from './routes/treasury.ts';
import './types/fastify.js';

const fastify = Fastify({ logger: true }).withTypeProvider<ZodTypeProvider>();

fastify.setValidatorCompiler(validatorCompiler);
fastify.setSerializerCompiler(serializerCompiler);

fastify.register(cors, {
  origin: '*',
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
});

fastify.register(fastifyJwt, {
  secret: process.env.JWT_SECRET as string,
});

fastify.decorate('autenticarETenant', async (request, reply) => {
  try {
    await request.jwtVerify();
  } catch {
    return reply.status(401).send({ error: 'Não autorizado' });
  }
});

fastify.register(authRoutes, { prefix: '/auth' });
fastify.register(personsRoutes, { prefix: '/persons' });
fastify.register(locationsRoutes, { prefix: '/locations' });
fastify.register(payablesRoutes, { prefix: '/payables' });
fastify.register(receivablesRoutes, { prefix: '/receivables' });
fastify.register(financialCatalogRoutes, { prefix: '/financial' });
fastify.register(treasuryRoutes, { prefix: '/financial' });
fastify.register(planAccountsRoutes, { prefix: '/plan-accounts' });

const start = async () => {
  try {
    await fastify.listen({ port: env.app.port, host: env.app.host });
    console.log(`🚀 Servidor Fastify pronto em ${API_URL}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
