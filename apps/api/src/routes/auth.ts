import { users } from '@erp-360/mod-core';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { db } from '../db/index.js';
import '../types/fastify.js';

import { tenants } from '@erp-360/mod-core';

const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const registerBody = z.object({
  companyName: z.string().min(1),
  cnpj: z.string().min(14),
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
});

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/login',
    {
      schema: {
        body: loginBody,
      },
    },
    async (request, reply) => {
      const { email, password } = request.body as z.infer<typeof loginBody>;

      try {
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (!user) {
          return reply.status(401).send({ message: 'E-mail ou senha incorretos.' });
        }

        const currentPassword = await bcrypt.compare(password, user.passwordHash);

        if (!currentPassword) {
          return reply.status(401).send({ message: 'E-mail ou senha incorretos.' });
        }

        const token = fastify.jwt.sign({
          userId: user.id,
          tenantId: user.tenantId,
        });

        return reply.send({
          token,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            tenantId: user.tenantId,
          },
        });
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({ message: 'Erro interno no servidor.' });
      }
    },
  );

  fastify.post(
    '/register',
    {
      schema: {
        body: registerBody,
      },
    },
    async (request, reply) => {
      const { companyName, cnpj, name, email, password } = request.body as z.infer<
        typeof registerBody
      >;

      try {
        const [usuarioExistente] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (usuarioExistente) {
          return reply.status(409).send({ message: 'E-mail já cadastrado.' });
        }

        const [novoTenant] = await db
          .insert(tenants)
          .values({ name: companyName, cnpj })
          .returning();

        const hash = await bcrypt.hash(password, 10);

        const [novoUsuario] = await db
          .insert(users)
          .values({
            tenantId: novoTenant.id,
            name: name,
            email,
            passwordHash: hash,
          })
          .returning();

        return reply.send({
          sucesso: true,
          usuarioId: novoUsuario.id,
          tenantId: novoTenant.id,
        });
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({ message: 'Erro interno no servidor.' });
      }
    },
  );
};
