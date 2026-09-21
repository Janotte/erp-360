import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import {
  serializerCompiler,
  validatorCompiler,
  ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';

import { db } from './db/index.js';
import { tenants, users } from '@erp-360/mod-core';
import { API_URL } from '@erp-360/shared';
import { personsRoutes } from './routes/persons.js';
import './types/fastify.js';

const fastify = Fastify({ logger: true }).withTypeProvider<ZodTypeProvider>();

fastify.setValidatorCompiler(validatorCompiler);
fastify.setSerializerCompiler(serializerCompiler);

fastify.register(cors, { origin: '*' });

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

fastify.register(personsRoutes, { prefix: '/persons' });

// 🌟 ENDPOINT DE LOGIN
fastify.post(
  '/auth/login',
  {
    schema: {
      body: z.object({
        email: z.string().email(),
        password: z.string().min(6), // Recebe a senha em texto puro do front
      }),
    },
  },
  async (request, reply) => {
    const { email, password } = request.body;

    try {
      // 1. Busca o usuário no Postgres pelo e-mail
      const [usuario] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      // 2. Se o usuário não existir, retorna erro genérico (segurança)
      if (!usuario) {
        return reply.status(401).send({ message: 'E-mail ou senha incorretos.' });
      }

      // 3. Compara a senha digitada com o hash salvo no banco
      const senhaBate = await bcrypt.compare(password, usuario.passwordHash);

      if (!senhaBate) {
        return reply.status(401).send({ message: 'E-mail ou senha incorretos.' });
      }

      // 4. Se a senha bater, gera o JWT contendo o contexto Multi-Tenant
      const token = fastify.jwt.sign({
        userId: usuario.id,
        tenantId: usuario.tenantId, // Essencial para o isolamento de dados
      });

      // 5. Retorna o token e os dados básicos do usuário para o Frontend
      return reply.send({
        token,
        user: {
          id: usuario.id,
          name: usuario.name,
          email: usuario.email,
          tenantId: usuario.tenantId,
        },
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ message: 'Erro interno no servidor.' });
    }
  },
);

// 🌟 ENDPOINT DE REGISTRO
fastify.post(
  '/auth/register',
  {
    schema: {
      body: z.object({
        nomeEmpresa: z.string().min(1),
        nomeUsuario: z.string().min(1),
        email: z.string().email(),
        senha: z.string().min(6),
      }),
    },
  },
  async (request, reply) => {
    const { nomeEmpresa, nomeUsuario, email, senha } = request.body;

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
        .values({ name: nomeEmpresa })
        .returning();

      const hash = await bcrypt.hash(senha, 10);

      const [novoUsuario] = await db
        .insert(users)
        .values({
          tenantId: novoTenant.id,
          name: nomeUsuario,
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

const start = async () => {
  try {
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
    console.log(`🚀 Servidor Fastify pronto em ${API_URL}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
