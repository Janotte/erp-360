import { tenants, users } from '@erp-360/mod-core';
import { db } from '../db/index.ts';
import bcrypt from 'bcryptjs';
import type { FastifyPluginAsync } from 'fastify';
import '../types/fastify.ts';

// Rota auxiliar temporária para criar dados de teste
export const registerRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/auth/register', async (request, reply) => {
    const { nomeEmpresa, nomeUsuario, email, senha } = request.body as any;

    // 1. Cria o Tenant (Empresa)
    const [novoTenant] = await db
      .insert(tenants)
      .values({ name: nomeEmpresa })
      .returning();

    // 2. Gera o hash seguro da senha
    const saltRounds = 10;
    const hash = await bcrypt.hash(senha, saltRounds);

    // 3. Cria o usuário vinculado ao Tenant
    const [novoUsuario] = await db
      .insert(users)
      .values({
        tenantId: novoTenant.id,
        name: nomeUsuario,
        email,
        passwordHash: hash,
      })
      .returning();

    return { sucesso: true, usuarioId: novoUsuario.id, tenantId: novoTenant.id };
  });
};
