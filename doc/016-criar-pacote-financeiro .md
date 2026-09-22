---

Para criar o módulo financeiro de forma profissional, vamos agrupar as regras de Contas a Pagar e Contas a Receber dentro de um único pacote chamado @erp-360/mod-financial.
Seguindo a arquitetura do seu projeto, vamos criar esse pacote local, definir as tabelas com relacionamentos diretos para a tabela de persons e configurar as chaves estrangeiras (references) protegidas por tenantId.
-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

## 📂 Passo 1: Criar o Pacote Financeiro (packages/modules/financial)

1. Crie as pastas estruturais no terminal:

```bash
mkdir -p packages/modules/financial/src/db
```

2. Crie o arquivo packages/modules/financial/package.json:

```ts
{
  "name": "@erp-360/mod-financial",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "dependencies": {
    "@erp-360/mod-core": "workspace:*",
    "@erp-360/mod-persons": "workspace:*",
    "drizzle-orm": "^0.45.2"
  }
}
```

3. Defina as tabelas em packages/modules/financial/src/db/schema.ts. Repare o uso de integer para o valor monetário (salvar em centavos evita falhas de arredondamento de floats) e o relacionamento com persons.id:

```ts
import { pgTable, uuid, varchar, integer, pgEnum, date } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenantColumns } from '@erp-360/mod-core';
import { persons } from '@erp-360/mod-persons';

// Enum para controle de status financeiro
export const statusFinancialEnum = pgEnum('status_financial', [
  'pendente',
  'pago',
  'cancelado',
]);

// 1. Tabela de Contas a Pagar
export const accountsPayable = pgTable('accounts_payable', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...tenantColumns,
  personId: uuid('person_id')
    .references(() => persons.id, { onDelete: 'restrict' })
    .notNull(),
  document: varchar('document', { length: 20 }),
  description: varchar('description', { length: 255 }).notNull(),
  issueDate: date('issue_date')
    .default(sql`CURRENT_DATE`)
    .notNull(),
  amount: integer('amount').notNull(),
  dueDate: date('due_date').notNull(),
  paymentDate: date('payment_date'),
  amountPaid: integer('amount_paid'),
  status: statusFinancialEnum('status').default('pendente').notNull(),
});

// 2. Tabela de Contas a Receber
export const accountsReceivable = pgTable('accounts_receivable', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...tenantColumns,
  personId: uuid('person_id')
    .references(() => persons.id, { onDelete: 'restrict' })
    .notNull(),
  document: varchar('document', { length: 20 }),
  description: varchar('description', { length: 255 }).notNull(),
  issueDate: date('issue_date')
    .default(sql`CURRENT_DATE`)
    .notNull(),
  amount: integer('amount').notNull(),
  dueDate: date('due_date').notNull(),
  receiveDate: date('receive_date'),
  amountReceived: integer('amount_received'),
  status: statusFinancialEnum('status').default('pendente').notNull(),
});
```

4. Exporte as tabelas em packages/modules/financial/src/index.ts:

```ts
export \* from './db/schema.ts';
```

5. Rode pnpm install na raiz para sincronizar os workspaces do monorepo.

---

## 🔄 Passo 2: Atualizar a API e Executar as Migrações

1. Vincule o novo pacote na sua API executando na raiz:

```bash
pnpm add @erp-360/mod-financial --filter apps/api
```

2. Registre as novas tabelas no arquivo de conexão global do banco (apps/api/src/db/index.ts):

```ts
import * as coreSchema from '@erp-360/mod-core';
import * as personsSchema from '@erp-360/mod-persons';
import * as financialSchema from '@erp-360/mod-financial';
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

const schema = {
  ...coreSchema,
  ...personsSchema,
  ...financialSchema,
};

// Cria o pool de conexões com o PostgreSQL do Docker
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });
```

3. Gere e aplique as migrações SQL para criar as tabelas no Docker:

```bash
pnpm --filter @erp-360/api db:generate
pnpm --filter @erp-360/api db:migrate
```

---

## 🔒 Passo 3: Ativar o Bloqueio Real de Exclusão em persons.ts

Agora que as tabelas financeiras existem, podemos substituir o comentário fictício que havíamos planejado no endpoint DELETE de apps/api/src/routes/persons.ts por uma validação real no banco de dados.
Abra apps/api/src/routes/persons.ts e atualize a rota DELETE:

```ts
import { contasPagar, contasReceber } from '@erp-360/mod-financial';

// ... dentro de personsRoutes, modifique apenas o método DELETE:

fastify.delete(
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

    try {
      // 🌟 1. Verifica se a pessoa possui vínculos em contas a pagar
      const [hasPayable] = await db
        .select()
        .from(accountsPayable)
        .where(
          and(eq(accountsPayable.personId, id), eq(accountsPayable.tenantId, tenantId)),
        )
        .limit(1);

      // 🌟 2. Verifica se a pessoa possui vínculos em contas a receber
      const [hasReceivable] = await db
        .select()
        .from(accountsReceivable)
        .where(
          and(
            eq(accountsReceivable.personId, id),
            eq(accountsReceivable.tenantId, tenantId),
          ),
        )
        .limit(1);

      // Se houver qualquer vínculo, bloqueia e retorna erro 400
      if (hasPayable || hasReceivable) {
        return reply.status(400).send({
          message:
            'Não é possível excluir esta pessoa porque ela possui movimentações financeiras vinculadas.',
        });
      }

      // Executa a deleção garantindo que a pessoa pertence ao Tenant do usuário logado
      const [deletedPerson] = await db
        .delete(persons)
        .where(and(eq(persons.id, id), eq(persons.tenantId, tenantId)))
        .returning();

      // Se o ID não existir ou pertencer a outro tenant, o array retornará vazio
      if (!deletedPerson) {
        return reply.status(404).send({ message: 'Pessoa não encontrada' });
      }

      return { success: true };
    } catch (error) {
      fastify.log.error(error);
      return reply
        .status(500)
        .send({ message: 'Erro interno ao tentar excluir o registro.' });
    }
  },
);
```
