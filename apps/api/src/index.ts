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
import { authRoutes } from './routes/auth.js';
import { financialCatalogRoutes } from './routes/financial-catalogs.ts';
import { locationsRoutes } from './routes/locations.ts';
import { payablesRoutes } from './routes/payables.ts';
import { personsRoutes } from './routes/persons.ts';
import { planAccountsRoutes } from './routes/plan-accounts.ts';
import { receivablesRoutes } from './routes/receivables.ts';
import { treasuryRoutes } from './routes/treasury.ts';
import { activeUser } from './services/active-user.ts';

const fastify = Fastify({ logger: true }).withTypeProvider<ZodTypeProvider>();

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
    const publicUrl = env.app.baseUrl ?? `http://localhost:${env.app.port}`;
    console.log(`🚀 Servidor Fastify pronto em ${publicUrl}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
