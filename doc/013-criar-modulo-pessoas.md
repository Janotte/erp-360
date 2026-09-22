Excelente! Vamos estruturar o módulo de Pessoas seguindo rigorosamente a nossa arquitetura limpa e isolada por Tenant. No contexto de um ERP, a melhor prática de modelagem é centralizar clientes, fornecedores e colaboradores em uma única tabela base (chamada persons ou contatos) e usar flags ou tipos específicos para diferenciá-los. Isso evita duplicação de dados, pois uma mesma pessoa pode ser um fornecedor e um cliente ao mesmo tempo.
Vamos criar a estrutura no banco de dados e as rotas de API para este módulo.
------------------------------

## 🗄️ Passo 1: Criar o Módulo de Pessoas (packages/modules/persons)

1.  Crie as pastas necessárias para o novo pacote:

mkdir -p packages/modules/persons/src/db

2.  Crie o arquivo packages/modules/persons/package.json:

```json
{
  "name": "@erp-360/mod-persons",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "dependencies": {
    "@erp-360/mod-core": "workspace:*",
    "drizzle-orm": "^0.45.2"
  }
}
```

3.  Defina a tabela unificada de contatos em packages/modules/persons/src/db/schema.ts injetando as tenantColumns:

```ts
import { tenantColumns } from '@erp-360/mod-core';
import { boolean, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const persons = pgTable('persons', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...tenantColumns, // 🌟 Garante o isolamento Multi-Tenant por coluna

  name: varchar('name', { length: 255 }).notNull(),
  document: varchar('document', { length: 20 }), // CPF ou CNPJ
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 20 }),

  // Flags para identificar o papel da pessoa no ERP (pode acumular papéis)
  isClient: boolean('is_client').default(false).notNull(),
  isSupplier: boolean('is_supplier').default(false).notNull(),
  isEmployee: boolean('is_employee').default(false).notNull(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

4.  Exporte o schema em packages/modules/persons/src/index.ts:

```ts
export * from './db/schema';
```

5.  Execute pnpm install na raiz do projeto para criar o link simbólico do novo workspace.

---

## 🔄 Passo 2: Registrar no Banco e Executar as Migrações

1.  Atualize a sua conexão global do banco (apps/api/src/db/index.ts) para incluir o novo schema:

```ts
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as coreSchema from '@erp-360/mod-core';
import * as pagarSchema from '@erp-360/mod-pagar';
import * as personsSchema from '@erp-360/mod-persons'; // 🆕
const schema = {
  ...coreSchema,
  ...pagarSchema,
  ...personsSchema, // 🆕
};
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
export const db = drizzle(pool, { schema });
```

2.  Gere e aplique as migrações SQL no banco PostgreSQL do Docker rodando na raiz:

```bash
pnpm --filter @erp-360/api db:generate
pnpm --filter @erp-360/api db:migrate
```

---

## ⚙️ Passo 3: Criar as Rotas de Pessoas (apps/api/src/routes/persons.ts)

Vamos adicionar os endpoints para cadastrar e listar as persons na API Fastify, aplicando a validação do Zod e o filtro obrigatório por tenantId.
Abra o arquivo apps/api/src/routes/persons.ts e adicione as seguintes rotas e validações:

```ts
import { persons } from '@erp-360/mod-persons';
import { PersonSchema, type Person } from '@erp-360/shared';
import { and, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import '../types/fastify.js';

const listPersonsQuery = z.object({
  tipo: z.enum(['cliente', 'fornecedor', 'colaborador']).optional(),
});

export const personsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.autenticarETenant);

  // 1. Rota para Cadastrar uma Pessoa (Protegida por Tenant)
  fastify.post(
    '/persons',
    {
      preHandler: [fastify.autenticarETenant],
      schema: { body: PersonSchema },
    },
    async (request, reply) => {
      const { tenantId } = request.user;
      const data = request.body as Person;

      const [newPerson] = await db
        .insert(persons)
        .values({
          ...data,
          tenantId,
        })
        .returning();

      return reply.status(201).send(newPerson);
    },
  );

  // 2. Rota para Listar as persons do Tenant (com filtro opcional por tipo)
  fastify.get(
    '/persons',
    {
      preHandler: [fastify.autenticarETenant],
      schema: {
        querystring: listPersonsQuery,
      },
    },
    async (request) => {
      const { tenantId } = request.user;
      const { tipo } = request.query as z.infer<typeof listPersonsQuery>;

      const condicoes = [eq(persons.tenantId, tenantId)];

      if (tipo === 'cliente') condicoes.push(eq(persons.isClient, true));
      if (tipo === 'fornecedor') condicoes.push(eq(persons.isSupplier, true));
      if (tipo === 'colaborador') condicoes.push(eq(persons.isEmployee, true));

      return db
        .select()
        .from(persons)
        .where(and(...condicoes));
    },
  );

  fastify.get(
    '/:id',
    {
      schema: {
        params: z.object({
          id: z.string().uuid({ message: 'ID precisa ser um UUID válido' }),
        }),
      },
    },
    async (request, reply) => {
      const { tenantId } = request.user;
      const { id } = request.params as { id: string };

      const [person] = await db
        .select()
        .from(persons)
        .where(and(eq(persons.id, id), eq(persons.tenantId, tenantId)));

      if (!person) {
        return reply.status(404).send({ error: 'Pessoa não encontrada' });
      }

      return person;
    },
  );
};
```

## ⚙️ Passo 3: Atualizar as Rotas da API (apps/api/src/index.ts)

Abra o arquivo apps/api/src/index.ts e atualize:

```ts
import cors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import Fastify from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { z } from 'zod';

import { tenants, users } from '@erp-360/mod-core';
import { API_URL } from '@erp-360/shared';
import { db } from './db/index.js';
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
```

---

## 🎯 O que estruturamos até aqui?

A fundação de dados do módulo de Pessoas está pronta. O Drizzle já aplicou a tabela no Postgres e a API possui as regras de negócio expostas de forma segura. Nenhuma empresa/tenant conseguirá visualizar os contatos ou colaboradores de outra.
