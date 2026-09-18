Essa visão arquitetural que você propôs é excelente para projetos de médio e grande porte. Levar as regras de negócio para uma pasta modules/ (ou packages/) isolada, em vez de deixar tudo acoplado dentro de apps/api, é a definição ideal de uma arquitetura limpa em monorepos. Dessa forma, as aplicações em apps/ viram apenas "orquestradores" ou canais de entrega (HTTP, CLI, Cron, etc.).
Para suportar Multi-Tenant (Múltiplas Organizações/Inquilinos) de forma escalável e segura, a estratégia mais comum e performática para sistemas comerciais é o Isolamento por Coluna (Shared Database / Discriminator Column). Nele, todas as tabelas de negócio possuem uma coluna tenant_id, e todas as consultas ao banco de dados filtram por ela obrigatoriamente.
Abaixo está o design de como estruturar essa pasta modules/ e implementar o fluxo de Autenticação + Tenant no Drizzle e Fastify.
------------------------------
## 📂 Nova Estrutura Base do Monorepo
O ideal é que o modules fique dentro de packages/ para herdar o comportamento nativo de workspaces do pnpm, transformando cada módulo de negócio em um pacote localmente importável.

meu-monorepo/
├── apps/
│   ├── api/             # Apenas rotas, middlewares do Fastify e injeção do Tenant
│   └── ui/              # Frontend React
└── packages/
    ├── shared/          # Apenas tipos globais simples e constantes
    ├── eslint-config/
    └── modules/         # 🆕 Seus módulos de negócio isolados
        ├── core/        # Tenant, Usuários, Autenticação e tabelas base
        ├── pessoas/     # Clientes, Fornecedores, Funcionários
        ├── pagar/       # Contas a Pagar
        └── receber/     # Contas a Receber

------------------------------

Execute os comandos abaixo na raiz do seu monorepo:

## 🛠️ 1. Instalar os Drivers e o ORM na API
Em vez de instalar de forma isolada em cada módulo, o padrão mais limpo em monorepos é deixar os drivers pesados de banco concentrados no aplicativo que executa o servidor (apps/api).

# Instala o ORM, as variáveis de ambiente e o driver nativo do Postgres na API
pnpm add drizzle-orm pg dotenv --filter @erp-360/api
# Instala as ferramentas de desenvolvimento e os tipos do Postgres na API
pnpm add -D drizzle-kit tsx @types/pg --filter @erp-360/api

## 🧐 Por que o tsx e o pg são cruciais aqui?

* tsx (TypeScript Execute): O drizzle-kit precisa dele para conseguir ler e compilar os seus arquivos de schema do banco escritos em TypeScript (schema.ts) em tempo de execução sem que você precise buildar a API inteira antes.
* pg vs postgres: O pacote pg (node-postgres) é o driver mais tradicional e maduro do ecossistema Node.js, contendo suporte completo para tratamento de concorrência e pooling de conexões no PostgreSQL que o Drizzle consome nativamente.

------------------------------
## 📝 2. Atualizar o Arquivo de Conexão (apps/api/src/db/index.ts)
Como alteramos o driver de postgres para pg, o arquivo de inicialização do banco na sua API deve usar o Pool de conexões do pacote pg.
Atualize o seu apps/api/src/db/index.ts para refletir essa mudança:

import 'dotenv/config';import { drizzle } from 'drizzle-orm/node-postgres';import { Pool } from 'pg';import * as coreSchema from '@erp-360/mod-core';import * as pagarSchema from '@erp-360/mod-pagar';
// Agrupa todos os schemas dos módulos para o Drizzle ter ciência global nas queriesconst schema = {
  ...coreSchema,
  ...pagarSchema,
};
// Cria o pool de conexões com o PostgreSQL do Dockerconst pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
export const db = drizzle(pool, { schema });

Com essas instalações corrigidas e o driver alinhado, o comando pnpm dev conseguirá rodar o drizzle-kit generate e migrate sem qualquer gargalo ou erro de falta de pacotes.
Muito bem observado! Agora que as dependências do banco estão 100% corretas, por onde quer continuar? Podemos criar as rotas de registro e login gerando o JWT com tenant_id, ou prefere estruturar os scripts de seed para popular o banco no Docker com alguns dados de teste?


## 🗄️ Passo 1: O Módulo Core (Tenant e Usuários)
Vamos centralizar as tabelas estruturais de Tenant e Usuários dentro de packages/modules/core.

   1. Crie as pastas do módulo core:
   
   mkdir -p packages/modules/core/src/db
   
   2. Crie o packages/modules/core/package.json:
   
   {
     "name": "@erp-360/mod-core",
     "version": "1.0.0",
     "private": true,
     "main": "./src/index.ts",
     "dependencies": {
       "drizzle-orm": "workspace:*",
       "zod": "workspace:*"
     }
   }
   
   3. Defina as tabelas base e um utilitário para forçar o tenant nas próximas tabelas em packages/modules/core/src/db/schema.ts:
   
    import { pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

    // 1. Tabela de Tenants (as Empresas/Organizações)
    export const tenants = pgTable('tenants', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    });

    // 2. Tabela de Usuários (Vinculados a um Tenant)
    export const users = pgTable('users', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
        .references(() => tenants.id, { onDelete: 'cascade' })
        .notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash').notNull(), // Para Bcrypt/Argon2
    createdAt: timestamp('created_at').defaultNow().notNull(),
    });

    // 3. Helper Utilitário: Cria colunas padrão de Tenant para os outros módulos usarem
    export const tenantColumns = {
    tenantId: uuid('tenant_id')
        .references(() => tenants.id, { onDelete: 'cascade' })
        .notNull(),
    };
   
   
Exporte tudo no packages/modules/core/src/index.ts:

export * from './db/schema';

------------------------------
## 💵 Passo 2: Criando um Módulo de Negócio (packages/modules/pagar)
Agora veja como um módulo independente (como o de Contas a Pagar) herda a estrutura de Tenant de forma limpa.

   1. Crie as pastas:
   
   mkdir -p packages/modules/pagar/src/db
   
   2. No packages/modules/pagar/package.json, ele vai depender do @erp-360/mod-core:
   
   {
     "name": "@erp-360/mod-pagar",
     "version": "1.0.0",
     "private": true,
     "main": "./src/index.ts",
     "dependencies": {
       "@erp-360/mod-core": "workspace:*",
       "drizzle-orm": "workspace:*"
     }
   }
   
   3. Mapeie a tabela em packages/modules/pagar/src/db/schema.ts injetando as tenantColumns:
   
   import { pgTable, uuid, varchar, integer, timestamp } from 'drizzle-orm/pg-core';import { tenantColumns } from '@erp-360/mod-core';
   export const contasAPagar = pgTable('contas_a_pagar', {
     id: uuid('id').primaryKey().defaultRandom(),
     ...tenantColumns, // 🌟 injeta automaticamente 'tenant_id' nesta tabela!
     descricao: varchar('descricao', { length: 255 }).notNull(),
     valorCentavos: integer('valor_centavos').notNull(), // Evita problemas de float salvando em centavos
     dataVencimento: timestamp('data_vencimento').notNull(),
     status: varchar('status', { length: 50 }).default('pendente').notNull(),
   });
   
   
------------------------------
## 🔒 Passo 3: Autenticação e Captura do Tenant na API (apps/api)
Na sua API Fastify, você usará JWT (JSON Web Tokens). O token gerado no login deve conter duas informações cruciais no payload: o userId e o tenantId.

   1. Instale o plugin de JWT do Fastify na sua API:
   
   pnpm add @fastify/jwt --filter @erp-360/api
   
   2. No arquivo apps/api/src/index.ts, registre o plugin e crie um Middleware (Hook) global para validar o token e expor o contexto do Tenant para as rotas:

import Fastify from 'fastify';import fastifyJwt from '@fastify/jwt';import { db } from './db';import { contasAPagar } from '@erp-360/mod-pagar';import { eq, and } from 'drizzle-orm';
// Estendendo a tipagem do Fastify para reconhecer o JWT e o Tenantdeclare module 'fastify' {
  interface FastifyJWT {
    payload: { userId: string; tenantId: string }
    user: { userId: string; tenantId: string }
  }
}
const fastify = Fastify({ logger: true });

fastify.register(fastifyJwt, {
  secret: 'sua_chave_secreta_super_segura_aqui'
});
// Middleware que protege as rotas de negócio e extrai o tenantId
fastify.decorate('autenticarETenant', async (request, reply) => {
  try {
    await request.jwtVerify(); // Decodifica o token e joga em request.user
  } catch (err) {
    reply.status(401).send({ error: 'Não autorizado' });
  }
});
// EXEMPLO DE ROTA PROTEGIDA NO MÓDULO PAGAR
fastify.get('/contas-pagar', { preHandler: [fastify.autenticarETenant] }, async (request, reply) => {
  // 🌟 O tenantId vem direto e seguro de dentro do JWT assinado! O usuário não pode burlar.
  const { tenantId } = request.user;

  // Busca APENAS as contas da empresa/tenant do usuário logado
  const contas = await db
    .select()
    .from(contasAPagar)
    .where(
      eq(contasAPagar.tenantId, tenantId)
    );

  return contas;
});

## 🔗 Passo 4: Centralizando as Migrações do Drizzle
Para que o Drizzle Kit consiga ler os schemas espalhados pelas subpastas de packages/modules/* e gerar um único histórico de banco de dados, ajuste o parâmetro schema no arquivo apps/api/drizzle.config.ts:

import 'dotenv/config';import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  out: './src/db/migrations',
  // 🌟 Encontra todos os arquivos de schema dentro de qualquer módulo na pasta packages/modules
  schema: '../../packages/modules/**/src/db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});

Execute pnpm install na raiz para o pnpm linkar os novos pacotes @erp-360/mod-core e @erp-360/mod-pagar e, em seguida, rode pnpm --filter @erp-360/api db:generate para criar as novas tabelas multi-tenant.
O esqueleto da arquitetura de módulos e isolamento multi-tenant está desenhado. Como quer prosseguir? Podemos escrever o código completo das rotas de Cadastro de Tenant + Registro de Usuário (com hash de senha), ou prefere focar em como o Frontend React armazenará esse JWT e lidará com a troca de contexto entre telas?

