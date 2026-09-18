import { users } from '@erp-360/mod-core';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.ts';
import '../types/fastify.ts';

const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/login',
    {
      schema: {
        body: loginBody,
        response: {
          200: z.object({ token: z.string() }),
          401: z.object({ error: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { email, password } = request.body as z.infer<typeof loginBody>;
      const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

      if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
        return reply.status(401).send({ error: 'E-mail ou senha inválidos' });
      }

      const token = fastify.jwt.sign({
        userId: user.id,
        tenantId: user.tenantId,
      });

      return { token };
    },
  );
};
