import '../types/fastify.js';

import { tenants, users } from '@erp-360/mod-core';
import {
  isValidCnpj,
  normalizeEmail,
  onlyDigits,
  RegisterResponseSchema,
  toTitleCasePtBr,
} from '@erp-360/shared';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { db } from '../db/index.js';
import { uniqueConflictMessage } from '../lib/postgres-errors.js';

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

const messageResponse = z.object({
  message: z.string(),
});

const registerUniqueMessages = {
  tenants_cnpj_unique: 'CNPJ já cadastrado.',
  users_email_unique: 'E-mail já cadastrado.',
};

export const authRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.post(
    '/login',
    {
      schema: {
        body: loginBody,
      },
    },
    async (request, reply) => {
      const { email, password } = request.body;
      const normalizedEmail = normalizeEmail(email);

      try {
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, normalizedEmail))
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
        response: {
          201: RegisterResponseSchema,
          400: messageResponse,
          409: messageResponse,
          500: messageResponse,
        },
      },
    },
    async (request, reply) => {
      const { companyName, cnpj, name, email, password } = request.body;
      const normalizedEmail = normalizeEmail(email);
      const normalizedCnpj = onlyDigits(cnpj).slice(0, 14);

      if (!isValidCnpj(normalizedCnpj)) {
        return reply.status(400).send({ message: 'CNPJ inválido.' });
      }

      const passwordHash = await bcrypt.hash(password, 10);

      try {
        const created = await db.transaction(async (tx) => {
          const [novoTenant] = await tx
            .insert(tenants)
            .values({ name: toTitleCasePtBr(companyName), cnpj: normalizedCnpj })
            .returning();

          const [novoUsuario] = await tx
            .insert(users)
            .values({
              tenantId: novoTenant.id,
              name: toTitleCasePtBr(name),
              email: normalizedEmail,
              passwordHash,
            })
            .returning();

          return { userId: novoUsuario.id, tenantId: novoTenant.id };
        });

        return reply.status(201).send(created);
      } catch (error) {
        const message = uniqueConflictMessage(
          error,
          registerUniqueMessages,
          'Já existe um cadastro com estes dados.',
        );
        if (message) return reply.status(409).send({ message });

        fastify.log.error(error);
        return reply.status(500).send({ message: 'Erro interno no servidor.' });
      }
    },
  );
};
