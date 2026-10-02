import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { env } from './env.js';

async function configPlugin(app: FastifyInstance): Promise<void> {
  app.decorate('config', env);
}

export default fp(configPlugin, {
  name: 'config-plugin',
});

declare module 'fastify' {
  interface FastifyInstance {
    config: typeof env;
  }
}
