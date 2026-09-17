Ótima escolha! O Drizzle ORM é atualmente uma das ferramentas mais rápidas e eficientes para TypeScript, pois funciona basicamente como um gerador de SQL nativo e tipado, casando perfeitamente com a performance do Fastify.
Vamos configurar o PostgreSQL rodando no Docker e o Drizzle integrado à sua API e ao pacote shared (para que as tipagens do banco também possam ser compartilhadas se necessário).
------------------------------

## 📂 Nova Estrutura de Pastas

meu-erp-360/
├── docker-compose.yml # 🆕 Configuração do banco PostgreSQL
├── apps/
│ └── api/
│ ├── .env # 🆕 Variáveis de ambiente da API
│ ├── drizzle.config.ts # 🆕 Configuração do Drizzle Migration
│ └── src/
│ ├── db/ # 🆕 Conexão e Schemas do Banco
│ │ ├── index.ts
│ │ └── schema.ts

---

## 🐳 Passo 1: Subir o PostgreSQL no Docker

Crie o arquivo docker-compose.yml na raiz do seu erp-360:

version: '3.8'
services:
postgres:
image: postgres:16-alpine
container_name: erp-360-postgres
environment:
POSTGRES_USER: postgres
POSTGRES_PASSWORD: mysecretpassword
POSTGRES_DB: erp360_db
ports: - "5432:5432"
volumes: - pgdata:/var/lib/postgresql/data
volumes:
pgdata:

Para iniciar o banco de dados em segundo plano, execute na raiz do projeto:

docker compose up -d

---

## 🛠️ Passo 2: Instalar o Drizzle na API

Agora, vamos instalar o Drizzle ORM, o driver do PostgreSQL (postgres) e as ferramentas de linha de comando para migrações (drizzle-kit). Rode o comando na raiz do projeto:

# Instala o ORM e o driver na API

pnpm add drizzle-orm postgres --filter @erp-360/api

# Instala as ferramentas de desenvolvimento e variáveis de ambiente na API

pnpm add -D drizzle-kit dotenv --filter @erp-360/api

---

## 📝 Passo 3: Configurar o Drizzle na API (apps/api)

1.  Crie o arquivo de variáveis de ambiente apps/api/.env:

DATABASE_URL=postgres://postgres:mysecretpassword@localhost:5432/meu_erp-360

2.  Crie o arquivo de configuração do CLI do Drizzle em apps/api/drizzle.config.ts:

import 'dotenv/config';import { defineConfig } from 'drizzle-kit';
export default defineConfig({
out: './src/db/migrations',
schema: './src/db/schema.ts',
dialect: 'postgresql',
dbCredentials: {
url: process.env.DATABASE_URL!,
},
});

3.  Defina a tabela de usuários em apps/api/src/db/schema.ts (reutilizando a lógica do Zod que criamos se preferir, ou mapeando direto no Drizzle):

import { pgTable, uuid, text, varchar } from 'drizzle-orm/pg-core';
export const users = pgTable('users', {
id: uuid('id').primaryKey().defaultRandom(),
name: varchar('name', { length: 255 }).notNull(),
email: text('email').notNull().unique(),
});

4.  Crie a conexão com o banco em apps/api/src/db/index.ts:

import 'dotenv/config';import { drizzle } from 'drizzle-orm/postgres-js';import postgres from 'postgres';import * as schema from './schema';
const client = postgres(process.env.DATABASE_URL!);export const db = drizzle(client, { schema });

---

## 🔄 Passo 4: Sincronizar o Banco e Atualizar as Rotas

1.  Adicione os scripts de migração no package.json de apps/api:

"scripts": {
"dev": "ts-node src/index.ts",
"build": "tsc",
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate"
}

2.  Rode os comandos no terminal para gerar e aplicar a tabela no Docker:

# Executa a geração dos arquivos SQL e envia para o Postgres no Docker

pnpm --filter @erp-360/api db:generate
pnpm --filter @erp-360/api db:migrate

3.  Agora, altere a rota no seu apps/api/src/index.ts para salvar e buscar dados diretamente do banco PostgreSQL:

import Fastify from 'fastify';import cors from '@fastify/cors';import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';import { UserSchema, API_URL } from '@erp-360/shared';import { db } from './db';import { users } from './db/schema';
const fastify = Fastify({ logger: true }).withTypeProvider<ZodTypeProvider>();

fastify.setValidatorCompiler(validatorCompiler);
fastify.setSerializerCompiler(serializerCompiler);
fastify.register(cors, { origin: '*' });
// Rota POST modificada para salvar no Banco de Dados Real
fastify.post('/user', {
schema: { body: UserSchema }
}, async (request, reply) => {
const { name, email } = request.body;

     // Insere no Postgres usando Drizzle e retorna o item criado
     const [novoUsuario] = await db.insert(users).values({ name, email }).returning();

     return reply.status(201).send(novoUsuario);

});
// Rota GET para listar os usuários do banco
fastify.get('/user', async () => {
const todosUsuarios = await db.select().from(users);
// Retorna o primeiro ou um objeto fake caso esteja vazio
return todosUsuarios[0] || { id: "00000000-0000-0000-0000-000000000000", name: "Nenhum", email: "vazio@db.com" };
});
const start = async () => {
try {
await fastify.listen({ port: 3000, host: '0.0.0.0' });
} catch (err) {
fastify.log.error(err);
process.exit(1);
}
};

start();

---

## 🚀 Fluxo Completo Pronto!

Agora você tem:

- PostgreSQL isolado e rodando via Docker.
- Drizzle ORM controlando as tabelas e tipando as consultas.
- Fastify recebendo as requisições, validando com Zod, inserindo no banco de dados e atualizando a interface React gerenciada pelo TanStack Query.
