import cors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import Fastify, { FastifyReply, FastifyRequest } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { authRoutes } from './routes/auth.ts';
import { personsRoutes } from './routes/persons.ts';
import './types/fastify.ts';

const fastify = Fastify({ logger: true }).withTypeProvider<ZodTypeProvider>();

fastify.setValidatorCompiler(validatorCompiler);
fastify.setSerializerCompiler(serializerCompiler);

fastify.decorate(
  'autenticarETenant',
  async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'Não autorizado' });
    }
  },
);

const start = async () => {
  try {
    await fastify.register(cors, { origin: '*' });
    await fastify.register(fastifyJwt, {
      secret: process.env.JWT_SECRET!,
    });
    await fastify.register(authRoutes, { prefix: '/auth' });
    await fastify.register(personsRoutes, { prefix: '/persons' });
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
