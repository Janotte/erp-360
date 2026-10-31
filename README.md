# ERP 360

Sistema de gestão em monorepo TypeScript, com pnpm e Turbo.

A interface fica em [http://localhost:5173](http://localhost:5173) e a API em [http://localhost:3000](http://localhost:3000).

## Stack

**API** (`apps/api`): Node.js, Fastify, Zod, JWT e Drizzle ORM sobre PostgreSQL 16.

**Interface** (`apps/ui`): React 19, Vite, React Router, TanStack Query, Tailwind CSS 4, Radix, Lucide e Sonner.

**Organização:** regras de negócio em `packages/modules`, código comum em `packages/shared`, lint com ESLint e formatação com Prettier.

## Estrutura

```text
apps/api                  API
apps/ui                   interface
packages/shared           contratos, datas e formatação
packages/modules/core     empresa e usuário
packages/modules/persons  pessoas, endereços e contatos
packages/modules/catalog  itens, categorias, unidades e NCM
packages/modules/financial  caixa, contas, formas de pagamento e plano de contas
packages/modules/inbound  entradas e documentos fiscais
packages/modules/service-orders  ordens de serviço
```

A API expõe pessoas, catálogo, financeiro, entradas, ordens de serviço, certificado digital e configurações da empresa.

## Requisitos

- Node.js 24
- pnpm 12.4.2
- Docker, para o PostgreSQL local

## Primeira execução

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
```

Preencha `DATABASE_PASSWORD`, `JWT_SECRET` e `CERTIFICATE_SECRET` em `apps/api/.env`. Os dois segredos precisam ter pelo menos 32 caracteres e ser diferentes entre si. `JWT_SECRET` assina o login. `CERTIFICATE_SECRET` cifra a senha do certificado A1.

```bash
pnpm --filter @erp-360/api db:setup
pnpm --filter @erp-360/api db:seed
pnpm dev
```

`db:setup` sobe o PostgreSQL e aplica as migrações. `db:seed` carrega países, estados e cidades. `pnpm dev` sobe o banco, se ele ainda não estiver no ar, e inicia a API e a interface.

O cadastro da empresa é feito pela tela de registro. O seed não cria usuário.

## Banco

Os comandos abaixo rodam a partir de `apps/api`, ou com `pnpm --filter @erp-360/api <script>`.

| Comando | Uso |
| --- | --- |
| `db:generate` | gera a migração a partir do schema |
| `db:migrate` | aplica as migrações no banco do `.env` |
| `db:studio` | abre o Drizzle Studio |
| `db:backup` | gera um backup |
| `db:restore` | restaura um backup |

O banco de desenvolvimento é `erp360_db`. Os testes usam `erp360_test` e criam esse banco sozinhos. Não defina `DATABASE_NAME` no ambiente antes de `db:migrate`, para a migração não ir para o banco errado.

## Verificação

```bash
pnpm lint
pnpm test
pnpm build
```
