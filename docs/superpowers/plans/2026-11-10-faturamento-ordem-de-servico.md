# Faturamento da ordem de serviço — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Na ordem Entregue, o menu da lista confirma as parcelas e gera um título por parcela, sem mudar a situação.

**Architecture:** `POST /service-orders/:id/billings` regrava o plano confirmado e, na mesma transação, cria `receivables` e `service_order_billings`. A leitura da ordem devolve essas cobranças e o dia da empresa. A lista abre o diálogo pelo clique direito. A ficha só mostra o financeiro já gerado.

**Tech Stack:** Drizzle, Fastify, Zod, Postgres, React, TanStack Query, os testes `node:test` da API.

**Spec:** `docs/superpowers/specs/2026-11-10-faturamento-ordem-de-servico.md`

---

## Arquivos

- Criar `apps/api/src/modules/service-orders/billing-labels.ts`: documento e descrição do título.
- Modificar `packages/modules/service-orders/src/db/service-orders.ts`: tabela `service_order_billings`.
- Gerar `apps/api/src/db/migrations/0057_service_order_billings.sql` e o snapshot.
- Criar `apps/api/src/modules/service-orders/billings.ts`: validação, plano e títulos.
- Modificar `apps/api/src/modules/service-orders/orders.ts`: a leitura inclui `billings` e `today`; as rotas registram o POST.
- Criar `apps/api/test/service-order-billing.integration.test.ts`.
- Modificar `apps/api/scripts/run-tests.ts`: incluir o teste novo.
- Modificar `apps/ui/src/services/serviceOrders.ts`: tipo, leitura e POST.
- Criar `apps/ui/src/components/ServiceOrders/ServiceOrderBillingDialog.tsx`.
- Criar `apps/ui/src/components/ServiceOrders/ServiceOrderRowMenu.tsx`.
- Modificar `apps/ui/src/components/ServiceOrders/ListServiceOrders.tsx` e `FormServiceOrder.tsx`.

O juro não entra no valor. Caixa, banco, credenciadora, nota e estoque não entram. Não commitar `doc/Pagar.txt`.

### Task 1: Documento e descrição

**Files:**
- Create: `apps/api/src/modules/service-orders/billing-labels.ts`
- Test: `apps/api/test/service-order-rules.test.ts`

- [ ] **Step 1: Write the failing test**

No `describe` `totais e número` de `apps/api/test/service-order-rules.test.ts`, importe `serviceOrderBillingDescription` e `serviceOrderBillingDocumentNumber` de `../src/modules/service-orders/billing-labels.ts` e acrescente:

```ts
it('monta documento e descrição da parcela sem a forma', () => {
  assert.equal(serviceOrderBillingDescription('000.001', 1), 'Ordem 000.001 · parcela 1');
  assert.equal(serviceOrderBillingDocumentNumber(1, 1), '000001-01');
  assert.equal(serviceOrderBillingDocumentNumber(1_000_000, 2), '1000000-02');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec tsx --test test/service-order-rules.test.ts` em `apps/api`

Expected: FAIL, módulo ou funções inexistentes.

- [ ] **Step 3: Write minimal implementation**

Crie `apps/api/src/modules/service-orders/billing-labels.ts`:

```ts
import { formatServiceOrderNumber } from './rules.ts';

export function serviceOrderBillingDescription(numberLabel: string, lineNumber: number) {
  return `Ordem ${numberLabel} · parcela ${lineNumber}`;
}

export function serviceOrderBillingDocumentNumber(number: number, lineNumber: number) {
  const digits = formatServiceOrderNumber(number).replace(/\./g, '');
  return `${digits}-${String(lineNumber).padStart(2, '0')}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec tsx --test test/service-order-rules.test.ts` em `apps/api`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/service-orders/billing-labels.ts apps/api/test/service-order-rules.test.ts
git commit -m "Nomeia o título da ordem pelo número e pela parcela."
```

### Task 2: Tabela da cobrança

**Files:**
- Modify: `packages/modules/service-orders/src/db/service-orders.ts`
- Create: migração `0057_service_order_billings` pelo `db:generate`

- [ ] **Step 1: Add the table**

Em `packages/modules/service-orders/src/db/service-orders.ts`, importe `date` de `drizzle-orm/pg-core` e `receivables` de `@erp-360/mod-financial`. Depois de `serviceOrders`, declare:

```ts
/** Parcela da ordem que já gerou recebível. Cancelar o título não apaga a linha. */
export const serviceOrderBillings = pgTable(
  'service_order_billings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...tenantColumns,
    serviceOrderId: uuid('service_order_id').notNull(),
    lineNumber: integer('line_number').notNull(),
    dueOn: date('due_on').notNull(),
    amount: integer('amount').notNull(),
    receivableId: uuid('receivable_id').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    unique('service_order_billings_id_tenant_id_unique').on(table.id, table.tenantId),
    unique('service_order_billings_tenant_order_line_unique').on(
      table.tenantId,
      table.serviceOrderId,
      table.lineNumber,
    ),
    unique('service_order_billings_tenant_receivable_unique').on(
      table.tenantId,
      table.receivableId,
    ),
    foreignKey({
      name: 'service_order_billings_order_tenant_fk',
      columns: [table.serviceOrderId, table.tenantId],
      foreignColumns: [serviceOrders.id, serviceOrders.tenantId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'service_order_billings_receivable_tenant_fk',
      columns: [table.receivableId, table.tenantId],
      foreignColumns: [receivables.id, receivables.tenantId],
    }).onDelete('restrict'),
    check('service_order_billings_line_check', sql`${table.lineNumber} >= 1`),
    check('service_order_billings_amount_check', sql`${table.amount} > 0`),
  ],
);
```

`packages/modules/service-orders/src/index.ts` já reexporta o arquivo. Não crie outro export.

- [ ] **Step 2: Generate the migration**

Run, em `apps/api`: `pnpm db:generate`

Expected: um SQL novo e um snapshot. Se o nome vier aleatório, renomeie o SQL e a tag no `meta/_journal.json` para `0057_service_order_billings`. O SQL precisa criar `service_order_billings` com as duas unicidades, as duas chaves compostas `ON DELETE restrict`, `line_number >= 1` e `amount > 0`. Não deixe outra alteração de schema no mesmo arquivo.

- [ ] **Step 3: Apply it on the dev database**

Run, em `apps/api`: `pnpm db:migrate`

Expected: a migração termina sem erro.

- [ ] **Step 4: Commit**

```bash
git add packages/modules/service-orders/src/db/service-orders.ts apps/api/src/db/migrations
git commit -m "Reserva a ligação entre a parcela da ordem e o título."
```

### Task 3: Geração dos títulos

**Files:**
- Create: `apps/api/src/modules/service-orders/billings.ts`
- Modify: `apps/api/src/modules/service-orders/orders.ts`
- Test: `apps/api/test/service-order-billing.integration.test.ts`
- Modify: `apps/api/scripts/run-tests.ts`

- [ ] **Step 1: Write the failing test**

Crie `apps/api/test/service-order-billing.integration.test.ts`. Copie o arranjo de `service-order.integration.test.ts`: `buildApp`, `createCompany`, medida, produto com `listPrice: '10.0000'`, forma `Dinheiro` com `receiptKind: 'cash'`, `useInServiceOrder: true` e condição de 1 parcela. Acrescente uma segunda forma `PIX`, meio `17`, também de ordem, com condição `installmentCount: 2`, `firstDueDays: 0`, `intervalDays: 30`. No `after`, apague nesta ordem: `serviceOrderBillings`, `receivables`, `serviceOrders`, `paymentPlans`, catálogo, medidas, formas e a empresa.

O teste principal entrega uma ordem de R$ 10,00 (`unitPrice: '10.0000'`, quantidade `1.0000`) com três chamadas de situação `in_progress`, `ready` e `delivered`, e com duas parcelas de Dinheiro, 400 e 600 centavos, vencimentos `2026-11-10` e `2026-12-10`. Depois:

```ts
const response = await app.inject({
  method: 'POST',
  url: `/service-orders/${detail.id}/billings`,
  headers: headers(),
  payload: {
    payments: [
      { paymentMethodId, installmentCount: 1, dueOn: '2026-11-10', amount: 400 },
      { paymentMethodId, installmentCount: 1, dueOn: '2026-12-10', amount: 600 },
    ],
  },
});
assert.equal(response.statusCode, 200, response.body);
const body = response.json() as {
  message: string;
  billings: { documentNumber: string; description: string; dueOn: string; amount: number; status: string }[];
};
assert.equal(body.message, 'Financeiro gerado.');
assert.deepEqual(
  body.billings.map((line) => ({
    documentNumber: line.documentNumber,
    description: line.description,
    dueOn: line.dueOn,
    amount: line.amount,
    status: line.status,
  })),
  [
    {
      documentNumber: '000001-01',
      description: 'Ordem 000.001 · parcela 1',
      dueOn: '2026-11-10',
      amount: 400,
      status: 'pendente',
    },
    {
      documentNumber: '000001-02',
      description: 'Ordem 000.001 · parcela 2',
      dueOn: '2026-12-10',
      amount: 600,
      status: 'pendente',
    },
  ],
);
```

Confira no banco que cada `receivables` tem o cliente da ordem, a forma, o meio, `issueOn` igual ao dia de `todayForTenant(tenantId)` e `planAccountId` nulo. A ordem relida continua `delivered`.

Os outros casos do mesmo arquivo:

- Trocar para as duas parcelas do PIX, 500 e 500, com vencimentos `2026-11-10` e `2026-12-10`, grava o plano novo e dois títulos com a forma PIX. A data enviada é a data gravada. Não recalcule no servidor.
- A segunda chamada, com outro corpo, responde 409, `message` igual a `O financeiro desta ordem já foi gerado.` e devolve os mesmos títulos. A quantidade de `receivables` da ordem não muda.
- Cancelar o recebível (`status: 'cancelado'`) e chamar de novo continua 409. A linha de `service_order_billings` permanece.
- Ordem `ready` responde 400 com `A ordem precisa estar entregue para gerar o financeiro.`
- Ordem entregue de total zero responde 400 com `Ordem com total zero não gera financeiro.`
- Soma 900 em ordem de 1000 responde 400 com `A soma das parcelas precisa ser igual ao total da ordem.`
- Parcela com `amount: 0` responde 400 com `A parcela precisa ter valor.`
- Forma com `useInServiceOrder: false` responde 400 com `A forma de pagamento não está disponível para a ordem.`
- Forma `receiptKind: 'store_credit'` responde 400 com `Crédito em loja não entra na ordem.`

Nenhuma dessas recusas grava título nem troca o plano já entregue. Inclua o arquivo em `apps/api/scripts/run-tests.ts`, ao lado de `test/service-order.integration.test.ts`.

- [ ] **Step 2: Run test to verify it fails**

Run, em `apps/api`, o mesmo arranjo de `scripts/run-tests.ts` limitado a `test/service-order-billing.integration.test.ts`: carregar `.env`, `NODE_ENV=test`, `DATABASE_NAME=erp360_test`, `prepareTestDatabase()` e `node --import tsx --test`.

Expected: FAIL com 404 no POST.

- [ ] **Step 3: Write minimal implementation**

Crie `apps/api/src/modules/service-orders/billings.ts`. Ele não importa `orders.ts`.

Mensagens, exatamente:

```ts
const messages = {
  notDelivered: 'A ordem precisa estar entregue para gerar o financeiro.',
  zeroTotal: 'Ordem com total zero não gera financeiro.',
  sum: 'A soma das parcelas precisa ser igual ao total da ordem.',
  emptyLine: 'A parcela precisa ter valor.',
  method: 'A forma de pagamento não está disponível para a ordem.',
  storeCredit: 'Crédito em loja não entra na ordem.',
  already: 'O financeiro desta ordem já foi gerado.',
  done: 'Financeiro gerado.',
};
```

`httpError` igual ao de `apps/api/src/modules/contracts/billings.ts`: `Error` com `status`. Data inválida usa a mesma checagem de `assertDueOn` em `orders.ts`.

`loadTerm` lê `paymentMethods` e `paymentMethodTerms` da empresa. Forma inativa ou com `useInServiceOrder` falso chama `messages.method`. `receiptKind === 'store_credit'` chama `messages.storeCredit`. Condição ausente responde 400 `Esta forma não tem a quantidade de parcelas escolhida.`

`confirmedLines` percorre o corpo. Parcela com `amount <= 0` chama `messages.emptyLine`. Cada linha devolve os campos que `paymentPlanLines` já grava na ordem: forma, nome, vencimento, valor, quantidade, meio, juros, taxa, carência, intervalo, `receiptKind`, integração, credenciadora e bandeira. O valor é o do corpo. O vencimento é o do corpo.

`existingBillings` junta `serviceOrderBillings` e `receivables` da ordem, ordena por `lineNumber` e devolve `lineNumber`, `dueOn`, `amount`, `documentNumber`, `description`, `status` e `receivableId`.

`generateServiceOrderBillings(tenantId, orderId, payments)`:

1. Carrega a ordem. Sem linha, 404 `Ordem não encontrada.`
2. Se já existe cobrança, devolve `{ created: false, message: messages.already, billings }`.
3. Situação diferente de `delivered`: `messages.notDelivered`, 400.
4. `totalAmount === 0`: `messages.zeroTotal`, 400.
5. Monta `confirmedLines`. Soma diferente de `totalAmount`: `messages.sum`, 400.
6. `today = await todayForTenant(tenantId)`, importado de `../contracts/clock.ts`.
7. Na transação, cria `paymentPlans` se a ordem não tiver `paymentPlanId`. Apaga as linhas do plano e insere as confirmadas com `lineNumber` a partir de 1. Atualiza a ordem com `paymentPlanId` e o snapshot vazio: `paymentMethodId`, `paymentInstallments`, `meansOfPaymentId`, `interestType`, `interestRateBps`, `administrativeFeeBps`, `fixedFeeAmount`, `firstDueDays`, `intervalDays`, `receiptKind`, `integrationType`, `acquirerId` e `cardBrandId` nulos. Não altere `status` nem `deliveredAt`.
8. Para cada linha, insere `receivables` com `tenantId`, `debtorId` do cliente, `documentNumber` e `description` dos rótulos da Task 1, `issueOn: today`, `installmentAmount` e `dueOn` da linha, `status: 'pendente'`, `planAccountId: null`, `paymentMethodId` e `meansOfPaymentId` da linha. `invoiceNumber` fica nulo. Insere `serviceOrderBillings` com `tenantId`, ordem, número da linha, vencimento, valor e o título.
9. Se a transação estourar a unicidade `23505`, devolva `{ created: false, message: messages.already, billings }` com a cobrança que ficou gravada. Não deixe o erro virar 500.
10. Devolve `{ created: true, message: messages.done, billings }`.

O corpo do POST é:

```ts
const billingBody = z.object({
  payments: z
    .array(
      z.object({
        paymentMethodId: z.string().uuid(),
        installmentCount: z.number().int().min(1).max(48),
        dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        amount: z.number().int(),
      }),
    )
    .max(96),
});
```

`serviceOrderBillingRoutes` exige `fastify.autenticarETenant`. O POST `/:id/billings` chama a geração. `created: false` responde 409 com `{ message, billings }`. Sucesso responde 200 com o mesmo formato. Chame `await serviceOrderBillingRoutes(fastify, {})` no início de `serviceOrderRoutes`, antes do GET e do PUT `/:id`.

- [ ] **Step 4: Run test to verify it passes**

Run o teste de integração da Task 3.

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/service-orders/billings.ts apps/api/src/modules/service-orders/orders.ts apps/api/test/service-order-billing.integration.test.ts apps/api/scripts/run-tests.ts
git commit -m "Gera um título por parcela confirmada da ordem entregue."
```

### Task 4: Leitura da ordem

**Files:**
- Modify: `apps/api/src/modules/service-orders/orders.ts`
- Test: `apps/api/test/service-order-billing.integration.test.ts`

- [ ] **Step 1: Write the failing test**

No teste que gera duas parcelas, releia `GET /service-orders/:id` e exija:

```ts
assert.equal(read.status, 'delivered');
assert.equal(read.today, await todayForTenant(tenantId));
assert.equal(read.billings.length, 2);
assert.equal(read.billings[0].documentNumber, '000001-01');
assert.equal(read.billings[0].description, 'Ordem 000.001 · parcela 1');
```

Uma ordem sem cobrança devolve `billings: []` e `today` no mesmo formato `AAAA-MM-DD`.

- [ ] **Step 2: Run test to verify it fails**

Run o teste de integração.

Expected: FAIL porque `billings` ou `today` não vêm na leitura.

- [ ] **Step 3: Write minimal implementation**

Em `loadOrder`, depois das parcelas, carregue as cobranças com a mesma consulta de `existingBillings`. Extraia essa consulta para `billings.ts` e exporte `listServiceOrderBillings` e o tipo da linha, para a geração e a leitura usarem a mesma função. `present` inclui sempre:

```ts
today: order.today,
billings: order.billings,
```

`today` vem de `todayForTenant(tenantId)` dentro de `loadOrder`. Não omita o array vazio.

- [ ] **Step 4: Run test to verify it passes**

Run o teste de integração e `pnpm exec tsx --test test/service-order.integration.test.ts` com o banco de teste preparado.

Expected: PASS. A suíte antiga não quebra por campos novos.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/service-orders/orders.ts apps/api/src/modules/service-orders/billings.ts apps/api/test/service-order-billing.integration.test.ts
git commit -m "Mostra na ordem o financeiro gerado e o dia da empresa."
```

### Task 5: Ficha

**Files:**
- Modify: `apps/ui/src/services/serviceOrders.ts`
- Modify: `apps/ui/src/components/ServiceOrders/FormServiceOrder.tsx`

- [ ] **Step 1: Extend the client type**

Em `ServiceOrderDetail`, acrescente:

```ts
today: string;
billings: {
  lineNumber: number;
  dueOn: string;
  amount: number;
  documentNumber: string | null;
  description: string;
  status: 'pendente' | 'recebido' | 'cancelado';
  receivableId: string;
}[];
```

O `get` já devolve o JSON da ordem. Não crie outro método nesta task.

- [ ] **Step 2: Show the section**

Em `FormServiceOrder.tsx`, quando `order.data.billings.length > 0`, renderize uma seção `Financeiro` antes de Observações. Tabela somente leitura: documento, vencimento (`dueOn` em `dd/MM/aaaa`), valor com `formatCurrency` e situação `Pendente`, `Recebido` ou `Cancelado`. Sem botão e sem edição. Ordem sem cobrança não mostra a seção.

- [ ] **Step 3: Check the type**

Run, na raiz: `pnpm --filter @erp-360/ui exec tsc -p tsconfig.json --noEmit`

Expected: PASS, ou o projeto não tem `tsc` no filtro e o `pnpm --filter @erp-360/ui build` não é necessário. Se o script não existir, abra a ficha no `pnpm dev` já em execução e confirme que a seção não aparece numa ordem sem cobrança. A geração pela tela entra na Task 6.

- [ ] **Step 4: Commit**

```bash
git add apps/ui/src/services/serviceOrders.ts apps/ui/src/components/ServiceOrders/FormServiceOrder.tsx
git commit -m "Mostra na ficha os títulos gerados pela ordem."
```

### Task 6: Menu e diálogo

**Files:**
- Modify: `apps/ui/src/services/serviceOrders.ts`
- Create: `apps/ui/src/components/ServiceOrders/ServiceOrderRowMenu.tsx`
- Create: `apps/ui/src/components/ServiceOrders/ServiceOrderBillingDialog.tsx`
- Modify: `apps/ui/src/components/ServiceOrders/ListServiceOrders.tsx`

- [ ] **Step 1: Add the client call**

Em `serviceOrders.ts`:

```ts
export interface ServiceOrderBillingResult {
  message: string;
  billings: ServiceOrderDetail['billings'];
}

async function generateBillings(
  id: string,
  payments: ServiceOrderPaymentInput[],
): Promise<{ status: number; body: ServiceOrderBillingResult }> {
  const res = await apiFetch(`/service-orders/${id}/billings`, {
    method: 'POST',
    body: JSON.stringify({ payments }),
  });
  const body = (await readBody(res)) as ServiceOrderBillingResult & { message?: string };
  if (res.status !== 200 && res.status !== 409) {
    throw new Error(messageOf(body, 'Não foi possível gerar o financeiro.'));
  }
  return { status: res.status, body };
}
```

Publique `generateBillings` em `serviceOrdersService`.

- [ ] **Step 2: Build the dialog**

`ServiceOrderBillingDialog` recebe `orderId: string | null` e `onClose: () => void`. Com `orderId`, busca `serviceOrdersService.get` e as formas em `paymentMethodsService.list` com `channel: 'serviceOrder'`, `isActive: true`, página 1, limite 100, ordenação por nome. Filtre `receiptKind !== 'store_credit'`, como a ficha.

Estados do diálogo:

- Carregando: texto `Carregando a ordem...`
- `billings.length > 0`: mensagem `O financeiro desta ordem já foi gerado.` e a tabela documento, vencimento, valor e situação. Sem confirmação.
- `totalAmount === 0`: mensagem `Ordem com total zero não gera financeiro.` Sem compositor.
- Caso restante: o compositor. Estado inicial são as `payments` da ordem. Forma, condição e valor chamam `installmentDueDates(order.today, term.firstDueDays, term.intervalDays, term.installmentCount)` e `splitInstallmentAmounts`. O rótulo da condição é `À vista` quando a quantidade é 1 e a carência é 0; nos outros casos, `${count}x`. Dá para editar vencimento e valor e remover a linha. O saldo é `totalAmount` menos a soma. Confirmar fica `disabled` enquanto a soma for diferente do total. Acima do total, o botão Adicionar recusa com `toast.error('O valor passa do saldo restante.')`.

Confirmar chama `generateBillings` com `{ paymentMethodId, installmentCount, dueOn, amount }` de cada linha. Status 200: `toast.success('Financeiro gerado.')`, invalida `['service-orders']` e fecha. Status 409: mostra a mensagem e os `billings` do corpo, sem gerar de novo. Erro: `toast.error` com a mensagem da API.

O diálogo usa `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle` com título `Gerar financeiro`. Largura `sm:max-w-3xl`.

- [ ] **Step 3: Build the row menu**

`ServiceOrderRowMenu` segue o posicionamento de `InboundNoteMenu`: portal em `cursor.x` e `cursor.y`, fecha no Escape e no clique fora. Um item, `Gerar financeiro`. `disabled` quando `cursor.row.status !== 'delivered'`. O clique habilita o diálogo com o id da linha e fecha o menu. O clique da linha continua abrindo a ficha. `onContextMenu` chama `preventDefault` e não navega.

- [ ] **Step 4: Verify in the browser**

Com `pnpm dev` já ativo, abra a lista de ordens.

- Linha que não está Entregue: o item fica desabilitado e a ficha abre no clique esquerdo.
- Ordem Entregue com total: o diálogo traz as parcelas. Troque a condição e confira que as datas partem de hoje. Confirme. O toast é `Financeiro gerado.` A ficha mostra a seção Financeiro, sem botão. O contas a receber lista os títulos pendentes.
- Abrir de novo a mesma linha: a mensagem é `O financeiro desta ordem já foi gerado.` e os títulos são os mesmos.
- Ordem Entregue de total zero: a mensagem é `Ordem com total zero não gera financeiro.`

- [ ] **Step 5: Commit**

```bash
git add apps/ui/src/services/serviceOrders.ts apps/ui/src/components/ServiceOrders/ServiceOrderBillingDialog.tsx apps/ui/src/components/ServiceOrders/ServiceOrderRowMenu.tsx apps/ui/src/components/ServiceOrders/ListServiceOrders.tsx
git commit -m "Abre a geração do financeiro no menu da lista."
```
