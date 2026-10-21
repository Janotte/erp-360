import '../../types/fastify.js';

import { tenants, users } from '@erp-360/mod-core';
import {
  isValidCnpj,
  normalizeEmail,
  onlyDigits,
  RegisterResponseSchema,
  toTitleCasePtBr,
} from '@erp-360/shared';
import rateLimit from '@fastify/rate-limit';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { db } from '../../db/index.js';
import {
  clearLoginFailures,
  isLoginBlocked,
  recordLoginFailure,
} from './login-attempts.js';

const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const registerBody = z.object({
  companyName: z.string().min(1),
  cnpj: z.string().min(14),
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8, 'A senha deve ter no mínimo 8 caracteres.'),
});

const dummyPasswordHash = bcrypt.hashSync('invalid-password', 10);

function tooManyAttempts(
  _request: unknown,
  context: { statusCode: number; after: string },
) {
  const error = new Error(`Muitas tentativas. Aguarde ${context.after}.`);
  return Object.assign(error, { statusCode: context.statusCode });
}

const messageResponse = z.object({
  message: z.string(),
});

export const authRoutes: FastifyPluginAsyncZod = async (fastify) => {
  await fastify.register(rateLimit, {
    global: false,
    errorResponseBuilder: tooManyAttempts,
  });

  fastify.post(
    '/login',
    {
      config: {
        rateLimit: {
          max: 20,
          timeWindow: '1 minute',
        },
      },
      schema: {
        body: loginBody,
      },
    },
    async (request, reply) => {
      const { email, password } = request.body;
      const normalizedEmail = normalizeEmail(email);

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, normalizedEmail))
        .limit(1);

      const blocked = isLoginBlocked(normalizedEmail);
      const passwordMatches = await bcrypt.compare(
        password,
        user?.passwordHash ?? dummyPasswordHash,
      );

      if (blocked) {
        return reply.status(429).send({
          message: 'Muitas tentativas para este e-mail. Tente novamente em alguns minutos.',
        });
      }

      if (!user || !passwordMatches) {
        recordLoginFailure(normalizedEmail);
        return reply.status(401).send({ message: 'E-mail ou senha incorretos.' });
      }

      clearLoginFailures(normalizedEmail);

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
    },
  );

  fastify.post(
    '/register',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '10 minutes',
        },
      },
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

      const created = await db.transaction(async (tx) => {
        const [novoTenant] = await tx
          .insert(tenants)
          .values({
            name: toTitleCasePtBr(companyName).slice(0, 60),
            tradeName: toTitleCasePtBr(companyName).slice(0, 60),
            cnpj: normalizedCnpj,
          })
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
    },
  );
};
