import type { FastifyReply, FastifyRequest } from 'fastify';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { userId: string; tenantId: string };
    user: { userId: string; tenantId: string };
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    autenticarETenant: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
