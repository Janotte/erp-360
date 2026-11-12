# Vínculo do item, margem e preço de lista — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Abrir uma página da nota para vincular item e fator, simular margem e preço de lista sobre o custo médio projetado, e gravar o preço só no lançamento pela conta preço = custo médio / (1 − margem).

**Architecture:** As funções puras ficam em `@erp-360/shared` e o lançamento deixa de sugerir preço pelo custo da linha. A margem ajustada mora em `inbound_pricing_overrides`, uma por item da nota. A página `/inbound/:id/vinculos` edita vínculo, fator e essa margem; o cadastro do item usa a mesma conta em cima do custo médio atual.

**Tech Stack:** TypeScript, Drizzle, Fastify, node:test, React, Vite, `@erp-360/shared`.

**Spec:** `docs/superpowers/specs/2026-11-12-vinculo-item-margem-preco-design.md`

**Status:** concluído em `master`, fast-forward até `6669309`. A suíte da API passou com 196 testes. As conferências de tela das tarefas 6 e 7 continuam em aberto.

**Commits:**

- `765679d` Leva a conta de custo e de preço de lista para o pacote compartilhado.
- `ef8c2d8` Guarda a margem ajustada da nota e limita a margem do item a menos de 100%.
- `671706c` Inclui o snapshot da migration da margem ajustada da nota.
- `987e148` Calcula o preço de lista pelo custo médio no lançamento da nota.
- `e045674` Grava a margem ajustada no rascunho sem mudar o preço de lista.
- `825a5e2` Recusa margem bruta de 100% ou mais no cadastro do item.
- `eaefa95` Separa margem fora da faixa de valor que não é número.
- `2470b66` Recalcula margem e preço de lista no cadastro do item.
- `3b27639` Abre a página de vínculos da nota com fator, margem e preço de lista.
- `ceb1f7c` Inclui os valores da linha no custo projetado do vínculo.
- `6669309` Testa o custo projetado do vínculo e mostra o custo da entrada.

**Commits:** mensagem em português, uma frase, ponto final. No PowerShell, não usar `&&`. O commit é:

```powershell
git commit -m @"
Mensagem.

"@
```

Não incluir `.superpowers/` nem `.env`.

---

## Arquivos

- Criar: `packages/shared/src/utils/pricing.ts` — `round4`, `lineUnitCost`, `nextAverage`, `projectedAverage`, `listPriceFromMargin`, `marginFromListPrice`, `syncPricing`.
- Criar: `packages/shared/src/utils/pricing.test.ts`.
- Criar: `packages/shared/src/utils/inboundPricing.ts` — máscaras, custo da entrada, média projetada do item e o recálculo da página.
- Criar: `packages/shared/src/utils/inboundPricing.test.ts`.
- Modificar: `packages/shared/src/index.ts` — exportar `./utils/pricing.ts` e `./utils/inboundPricing.ts`.
- Modificar: `apps/api/src/modules/inbound/cost.ts` — reexportar `CostFlags`, `LineAmounts`, `round4`, `lineUnitCost` e `nextAverage`. `listPriceFromMargin` fica no shared e o lançamento importa de lá. `reversedBalance`, `payableDocumentNumber` e a chave da NF-e continuam neste arquivo.
- Criar: `apps/api/src/db/migrations/0058_inbound_pricing_overrides.sql`.
- Criar: `apps/api/src/db/migrations/meta/0058_snapshot.json`.
- Modificar: `apps/api/src/db/migrations/meta/_journal.json` — entrada idx 58.
- Modificar: `packages/modules/inbound/src/db/inbound.ts` — tabela `inboundPricingOverrides` e o check da margem do item não mora aqui; o check do item fica em `packages/modules/catalog/src/db/items.ts`.
- Modificar: `packages/modules/catalog/src/db/items.ts` — `catalog_items_gross_margin_check` passa a exigir margem nula ou `>= 0` e `< 100`.
- Modificar: `apps/api/src/modules/inbound/post.ts` — um preço por item, pela média real.
- Modificar: `apps/api/test/inbound-post.integration.test.ts` — o preço esperado deixa de ser `15.0000`.
- Criar: `apps/api/test/inbound-pricing.integration.test.ts`.
- Modificar: `apps/api/scripts/run-tests.ts` — registrar o teste novo.
- Modificar: `apps/api/src/modules/inbound/inbound.ts` — `pricingOverrides` no salvar, `GET /:id/pricing`, e os sete centavos da linha no `GET /:id`.
- Modificar: `apps/api/src/modules/catalog/items.ts` — recusar margem fora de `[0, 100)`.
- Criar: `apps/api/test/item-margin.test.ts`.
- Modificar: `apps/ui/src/components/Catalog/Items/FormItem.tsx`.
- Modificar: `apps/ui/src/services/inbound.ts`.
- Criar: `apps/ui/src/components/Inbound/FormInboundLinks.tsx`.
- Modificar: `apps/ui/src/components/Inbound/FormInbound.tsx` — botão Vínculos; fator e vínculo só leitura; busca e lápis saem da grade.
- Modificar: `apps/ui/src/App.tsx` — rota `/inbound/:id/vinculos`.

## Task 1: Fórmulas puras

**Files:**
- Create: `packages/shared/src/utils/pricing.ts`
- Create: `packages/shared/src/utils/pricing.test.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/api/src/modules/inbound/cost.ts`

- [x] **Step 1: Write the failing test**

Criar `packages/shared/src/utils/pricing.test.ts`:

```ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  listPriceFromMargin,
  marginFromListPrice,
  projectedAverage,
  syncPricing,
} from './pricing.ts';

describe('preço de lista pela margem sobre a venda', () => {
  it('projeta o custo médio do exemplo', () => {
    assert.equal(projectedAverage(10, 50, [{ quantity: 20, unitCost: 65 }]), 60);
  });

  it('calcula 45% de 60 como 109,0909 e o caminho de volta', () => {
    assert.equal(listPriceFromMargin(60, 45), 109.0909);
    assert.equal(marginFromListPrice(60, 109.0909), 45);
  });

  it('recusa margem de 100% e preço abaixo do custo', () => {
    assert.equal(listPriceFromMargin(60, 100), null);
    assert.equal(marginFromListPrice(60, 59.99), null);
  });

  it('deriva o preço quando a margem é a fonte', () => {
    assert.deepEqual(
      syncPricing({
        average: 60,
        marginPercent: 45,
        price: null,
        edited: 'none',
        emptyPriceWithoutCost: true,
      }),
      { marginPercent: 45, price: 109.0909 },
    );
  });

  it('sem custo médio na nota, informar margem deixa o preço vazio', () => {
    assert.deepEqual(
      syncPricing({
        average: 0,
        marginPercent: 45,
        price: 10,
        edited: 'margin',
        emptyPriceWithoutCost: true,
      }),
      { marginPercent: 45, price: null },
    );
  });

  it('sem custo médio no cadastro, os campos não se recalculam', () => {
    assert.deepEqual(
      syncPricing({
        average: 0,
        marginPercent: 45,
        price: 10,
        edited: 'margin',
        emptyPriceWithoutCost: false,
      }),
      { marginPercent: 45, price: 10 },
    );
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run from the repo root: `pnpm exec tsx --test packages/shared/src/utils/pricing.test.ts`

Expected: FAIL, cannot find module `./pricing.ts`.

- [x] **Step 3: Write the functions**

Criar `packages/shared/src/utils/pricing.ts`:

```ts
export function round4(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

export interface CostFlags {
  freightInCost: boolean;
  insuranceInCost: boolean;
  otherInCost: boolean;
  discountInCost: boolean;
  ipiInCost: boolean;
  stInCost: boolean;
  icmsInCost: boolean;
}

export interface LineAmounts {
  lineAmountCents: number;
  freightCents: number;
  insuranceCents: number;
  otherCents: number;
  discountCents: number;
  ipiCents: number;
  stCents: number;
  icmsCents: number;
  stockQty: number;
}

export function lineUnitCost(amounts: LineAmounts, flags: CostFlags) {
  if (amounts.stockQty <= 0) {
    throw new Error('Quantidade de estoque inválida.');
  }
  let extra = 0;
  if (flags.freightInCost) extra += amounts.freightCents;
  if (flags.insuranceInCost) extra += amounts.insuranceCents;
  if (flags.otherInCost) extra += amounts.otherCents;
  if (flags.discountInCost) extra -= amounts.discountCents;
  if (flags.ipiInCost) extra += amounts.ipiCents;
  if (flags.stInCost) extra += amounts.stCents;
  if (flags.icmsInCost) extra += amounts.icmsCents;
  return round4((amounts.lineAmountCents + extra) / 100 / amounts.stockQty);
}

export function nextAverage(
  currentQty: number,
  currentAverage: number,
  incomingQty: number,
  unitCost: number,
) {
  if (currentQty <= 0) return round4(unitCost);
  return round4(
    (currentQty * currentAverage + incomingQty * unitCost) / (currentQty + incomingQty),
  );
}

export function projectedAverage(
  currentQty: number,
  currentAverage: number,
  incoming: { quantity: number; unitCost: number }[],
) {
  let quantity = currentQty;
  let average = currentAverage;
  for (const line of incoming) {
    average = nextAverage(quantity, average, line.quantity, line.unitCost);
    quantity = round4(quantity + line.quantity);
  }
  return average;
}

export function listPriceFromMargin(average: number, marginPercent: number) {
  if (!(average > 0) || !(marginPercent >= 0) || marginPercent >= 100) return null;
  return round4(average / (1 - marginPercent / 100));
}

export function marginFromListPrice(average: number, price: number) {
  if (!(average > 0) || !(price >= average)) return null;
  return round4((1 - average / price) * 100);
}

export function syncPricing(input: {
  average: number;
  marginPercent: number | null;
  price: number | null;
  edited: 'margin' | 'price' | 'none';
  emptyPriceWithoutCost: boolean;
}) {
  if (!(input.average > 0)) {
    if (!input.emptyPriceWithoutCost) {
      return { marginPercent: input.marginPercent, price: input.price };
    }
    if (input.edited === 'price') {
      return { marginPercent: input.marginPercent, price: input.price };
    }
    return { marginPercent: input.marginPercent, price: null };
  }
  if (input.edited === 'price') {
    if (input.price == null) return { marginPercent: null, price: null };
    return {
      marginPercent: marginFromListPrice(input.average, input.price),
      price: input.price,
    };
  }
  if (input.marginPercent == null) return { marginPercent: null, price: null };
  return {
    marginPercent: input.marginPercent,
    price: listPriceFromMargin(input.average, input.marginPercent),
  };
}
```

Em `packages/shared/src/index.ts`, depois do export de `paymentPlan.ts`:

```ts
export * from './utils/pricing.ts';
```

Em `apps/api/src/modules/inbound/cost.ts`, apagar `CostFlags`, `LineAmounts`, `round4`, `lineUnitCost` e `nextAverage` (eles passam a vir do shared). Manter `reversedBalance`, `payableDocumentNumber`, `moneyToCents` e as funções da chave. No topo:

```ts
export {
  type CostFlags,
  type LineAmounts,
  lineUnitCost,
  nextAverage,
  round4,
} from '@erp-360/shared';
```

`reversedBalance` continua usando `round4` importado desse reexport. Ajustar o import local se o arquivo passar a importar `round4` de `@erp-360/shared` para uso interno:

```ts
import { round4 } from '@erp-360/shared';

export {
  type CostFlags,
  type LineAmounts,
  lineUnitCost,
  nextAverage,
  round4,
} from '@erp-360/shared';
```

- [x] **Step 4: Run the tests**

Run: `pnpm exec tsx --test packages/shared/src/utils/pricing.test.ts`

Expected: 5 passing.

Run from `apps/api`: `pnpm exec tsx --test test/inbound-cost.test.ts`

Expected: PASS. `cost.ts` still exports `lineUnitCost`, `nextAverage` and `reversedBalance`.

- [x] **Step 5: Commit**

```powershell
git add packages/shared/src/utils/pricing.ts packages/shared/src/utils/pricing.test.ts packages/shared/src/index.ts apps/api/src/modules/inbound/cost.ts
git commit -m @"
Leva a conta de custo e de preço de lista para o pacote compartilhado.

"@
```

## Task 2: Tabela de override e margem menor que 100

**Files:**
- Create: `apps/api/src/db/migrations/0058_inbound_pricing_overrides.sql`
- Modify: `apps/api/src/db/migrations/meta/_journal.json`
- Modify: `packages/modules/inbound/src/db/inbound.ts`
- Modify: `packages/modules/catalog/src/db/items.ts`

- [x] **Step 1: Add the migration**

`apps/api/src/db/migrations/0058_inbound_pricing_overrides.sql`:

```sql
CREATE TABLE "inbound_pricing_overrides" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "document_id" uuid NOT NULL,
  "item_id" uuid NOT NULL,
  "gross_margin" numeric(8, 4),
  CONSTRAINT "inbound_pricing_overrides_item_unique" UNIQUE("tenant_id","document_id","item_id"),
  CONSTRAINT "inbound_pricing_overrides_margin_check" CHECK ("gross_margin" is null OR ("gross_margin" >= 0 AND "gross_margin" < 100))
);
--> statement-breakpoint
ALTER TABLE "inbound_pricing_overrides" ADD CONSTRAINT "inbound_pricing_overrides_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "inbound_pricing_overrides" ADD CONSTRAINT "inbound_pricing_overrides_document_tenant_fk" FOREIGN KEY ("document_id","tenant_id") REFERENCES "public"."inbound_documents"("id","tenant_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "inbound_pricing_overrides" ADD CONSTRAINT "inbound_pricing_overrides_item_tenant_fk" FOREIGN KEY ("item_id","tenant_id") REFERENCES "public"."catalog_items"("id","tenant_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "catalog_items" DROP CONSTRAINT "catalog_items_gross_margin_check";
--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_gross_margin_check" CHECK ("gross_margin" is null OR ("gross_margin" >= 0 AND "gross_margin" < 100));
```

No `_journal.json`, acrescentar ao fim de `entries` o idx 58, tag `0058_inbound_pricing_overrides`, `version` `"7"`, `breakpoints` true, `when` com `Date.now()` no momento de gravar o arquivo.

- [x] **Step 2: Add the Drizzle table**

Em `packages/modules/inbound/src/db/inbound.ts`, depois de `supplierItemLinks`:

```ts
export const inboundPricingOverrides = pgTable(
  'inbound_pricing_overrides',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...tenantColumns,
    documentId: uuid('document_id').notNull(),
    itemId: uuid('item_id').notNull(),
    grossMargin: numeric('gross_margin', { precision: 8, scale: 4 }),
  },
  (table) => [
    unique('inbound_pricing_overrides_item_unique').on(
      table.tenantId,
      table.documentId,
      table.itemId,
    ),
    foreignKey({
      name: 'inbound_pricing_overrides_document_tenant_fk',
      columns: [table.documentId, table.tenantId],
      foreignColumns: [inboundDocuments.id, inboundDocuments.tenantId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'inbound_pricing_overrides_item_tenant_fk',
      columns: [table.itemId, table.tenantId],
      foreignColumns: [catalogItems.id, catalogItems.tenantId],
    }).onDelete('restrict'),
    check(
      'inbound_pricing_overrides_margin_check',
      sql`${table.grossMargin} is null or (${table.grossMargin} >= 0 and ${table.grossMargin} < 100)`,
    ),
  ],
);
```

`inboundDocuments` já está declarado acima neste arquivo. `catalogItems` já é importado.

Em `packages/modules/catalog/src/db/items.ts`, trocar o check `catalog_items_gross_margin_check` para:

```ts
sql`${table.grossMargin} is null or (${table.grossMargin} >= 0 and ${table.grossMargin} < 100)`,
```

- [x] **Step 3: Apply the migration on the test database**

`pnpm exec tsx --test` não aplica o journal. Em `apps/api`, `pnpm test` chama `prepareTestDatabase`, que migra `erp360_test`, e em seguida roda a suíte.

```powershell
pnpm test
```

Expected: a suíte existente passa com a tabela nova criada.

- [x] **Step 4: Commit**

```powershell
git add apps/api/src/db/migrations/0058_inbound_pricing_overrides.sql apps/api/src/db/migrations/meta/_journal.json packages/modules/inbound/src/db/inbound.ts packages/modules/catalog/src/db/items.ts
git commit -m @"
Guarda a margem ajustada da nota e limita a margem do item a menos de 100%.

"@
```

## Task 3: Lançamento recalcula pelo custo médio

**Files:**
- Modify: `apps/api/src/modules/inbound/post.ts`
- Modify: `apps/api/test/inbound-post.integration.test.ts`
- Create: `apps/api/test/inbound-pricing.integration.test.ts`
- Modify: `apps/api/scripts/run-tests.ts`

O teste atual espera `listPrice === '15.0000'` porque 10,00 × (1 + 50%) = 15,00. Com a conta nova, saldo zero e custo 10,00 com margem 50% dão 10 / 0,5 = 20,00. As duas asserções `15.0000` desse teste passam a `20.0000`. O estorno continua sem apagar o preço.

- [x] **Step 1: Write the failing integration test**

Criar `apps/api/test/inbound-pricing.integration.test.ts` copiando o arranjo de `inbound-post.integration.test.ts` (`createCompany`, medida, `ensureInboundSetup`, natureza `purchase_resale`).

Caso 1, exemplo da spec. Item com `grossMargin: '45.0000'` e `tracksStock: true`. Saldo já gravado em `stockBalances`: `quantity: '10.0000'`, `averageCost: '50.0000'`. Linha com `commercialQty: '20.0000'`, `factor: '1.000000'`, `unitPrice: '65.0000'`, `lineAmount: 130000`, `itemId` do item. Documento `pre_note`, `hasProtocol: true`, `totalAmount: 130000`, fornecedor e natureza de revenda, parcela de 130000. Depois de `postInboundDocument`:

```ts
assert.equal(posted.grossMargin, '45.0000');
assert.equal(posted.listPrice, '109.0909');
const [balance] = await db
  .select({ quantity: stockBalances.quantity, averageCost: stockBalances.averageCost })
  .from(stockBalances)
  .where(eq(stockBalances.itemId, item.id));
assert.equal(balance.quantity, '30.0000');
assert.equal(balance.averageCost, '60.0000');
```

Caso 2, override. Item começa com `grossMargin: '10.0000'` e `listPrice: '1.0000'`. Inserir em `inboundPricingOverrides` `{ grossMargin: '45.0000' }` para o mesmo documento e item. Mesmo saldo e mesma linha do caso 1. Depois do lançamento, `grossMargin` é `45.0000` e `listPrice` é `109.0909`.

Caso 3, margem apagada. Item com `grossMargin: '45.0000'` e `listPrice: '80.0000'`. Override com `grossMargin: null`. Depois do lançamento, `grossMargin` é `null` e `listPrice` continua `80.0000`.

Caso 4, natureza que não sugere preço. Usar a natureza `purchase_raw` (`suggestsListPrice: false`, `updatesAverageCost: true`). Override `45.0000`. O item começa com `listPrice: '80.0000'`. Depois do lançamento, `grossMargin` é `45.0000` e `listPrice` continua `80.0000`.

Caso 5, duas linhas do mesmo item. Saldo 10 a 50,00. Linha 1: quantidade 10, fator 1, `lineAmount` 80000 (custo 80,00). Linha 2: quantidade 10, fator 1, `lineAmount` 50000 (custo 50,00). Margem do item 45%. O custo médio final é (10×50 + 10×80 + 10×50) / 30 = 60,00. `listPrice` é `109.0909`. Uma só gravação: o preço não fica no custo da primeira linha.

Registrar o arquivo em `apps/api/scripts/run-tests.ts` ao lado de `test/inbound-post.integration.test.ts`.

- [x] **Step 2: Run the test to verify it fails**

Working directory: `apps/api`.

```powershell
pnpm test
```

Expected: FAIL no arquivo novo. O preço gravado ainda é o custo da linha vezes um mais a margem, não `109.0909`.

- [x] **Step 3: Change the post**

Em `apps/api/src/modules/inbound/post.ts`:

- Importar `inboundPricingOverrides` de `@erp-360/mod-inbound`.
- Importar `listPriceFromMargin` de `./cost.ts` (reexportado do shared na task 1).
- Apagar o bloco que calcula `suggestedPrice` com `unitCost * (1 + margin/100)` e o `update` de `listPrice` dentro do `for (const line of ordered)`.

Depois desse `for`, percorrer os `itemId` distintos das linhas, na ordem em que aparecem:

```ts
const seen = new Set<string>();
for (const line of ordered) {
  if (!line.itemId || seen.has(line.itemId)) continue;
  seen.add(line.itemId);
  const itemId = line.itemId;
  const [item] = await tx
    .select({
      tracksStock: catalogItems.tracksStock,
      grossMargin: catalogItems.grossMargin,
    })
    .from(catalogItems)
    .where(and(eq(catalogItems.id, itemId), eq(catalogItems.tenantId, tenantId)))
    .for('update');
  if (!item) continue;
  const [override] = await tx
    .select({ grossMargin: inboundPricingOverrides.grossMargin })
    .from(inboundPricingOverrides)
    .where(
      and(
        eq(inboundPricingOverrides.tenantId, tenantId),
        eq(inboundPricingOverrides.documentId, documentId),
        eq(inboundPricingOverrides.itemId, itemId),
      ),
    )
    .limit(1);
  let margin = item.grossMargin;
  if (override) {
    margin = override.grossMargin;
    await tx
      .update(catalogItems)
      .set({ grossMargin: override.grossMargin })
      .where(and(eq(catalogItems.id, itemId), eq(catalogItems.tenantId, tenantId)));
  }
  if (
    !nature.suggestsListPrice ||
    !nature.updatesAverageCost ||
    !item.tracksStock ||
    margin == null
  ) {
    continue;
  }
  const [balance] = await tx
    .select({ averageCost: stockBalances.averageCost })
    .from(stockBalances)
    .where(and(eq(stockBalances.itemId, itemId), eq(stockBalances.tenantId, tenantId)))
    .limit(1);
  const average = balance ? Number(balance.averageCost) : 0;
  const price = listPriceFromMargin(average, Number(margin));
  if (price == null) continue;
  await tx
    .update(catalogItems)
    .set({ listPrice: price.toFixed(4) })
    .where(and(eq(catalogItems.id, itemId), eq(catalogItems.tenantId, tenantId)));
}
```

Em `apps/api/test/inbound-post.integration.test.ts`, trocar as duas asserções `posted.listPrice` e `reversed.listPrice` de `'15.0000'` para `'20.0000'`.

- [x] **Step 4: Run the tests**

```powershell
pnpm test
```

Working directory: `apps/api`. Expected: os cinco casos novos passam, e o teste antigo passa com preço `20.0000`.

- [x] **Step 5: Commit**

```powershell
git add apps/api/src/modules/inbound/post.ts apps/api/test/inbound-post.integration.test.ts apps/api/test/inbound-pricing.integration.test.ts apps/api/scripts/run-tests.ts
git commit -m @"
Calcula o preço de lista pelo custo médio no lançamento da nota.

"@
```

## Task 4: Salvar a margem sem gravar o preço

**Files:**
- Modify: `apps/api/src/modules/inbound/inbound.ts`
- Modify: `apps/api/test/inbound-pricing.integration.test.ts`

- [x] **Step 1: Write the failing test**

No mesmo arquivo de integração, dois casos que chamam o salvar da nota. Importar o app não é obrigatório: exportar `saveInboundDraft(tenantId, documentId, body)` de `inbound.ts` se o `put` ainda não tiver função extraível, e testar essa função. Se o `put` já concentra a lógica inline, extrair `saveInboundDraft` e fazer o handler chamá-la. O teste usa a função, não o HTTP.

Caso A. Documento com uma linha vinculada e item com `listPrice: '80.0000'`. Chamar `saveInboundDraft` com as linhas atuais e:

```ts
pricingOverrides: [{ itemId: item.id, grossMargin: '45.0000' }]
```

Depois: existe uma linha em `inboundPricingOverrides` com `gross_margin = 45.0000`, e `catalog_items.list_price` continua `80.0000`. `catalog_items.gross_margin` também não muda.

Caso B. Salvar de novo sem o item na lista de linhas (trocar `itemId` da linha para `null`) e sem repetir o override. A linha de override daquele item deixa de existir. O preço de lista continua `80.0000`.

Caso C. `pricingOverrides` omitido, com o override do caso A ainda no banco e o item ainda na linha. O override permanece.

Caso D. `grossMargin: '100'` responde com erro e a mensagem `Informe a margem bruta entre 0 e 100, sem incluir 100.`

- [x] **Step 2: Run the test to verify it fails**

```powershell
pnpm test
```

Working directory: `apps/api`. Expected: FAIL porque `saveInboundDraft` não existe ou ignora `pricingOverrides`.

- [x] **Step 3: Persist overrides on save**

Em `draftBody`:

```ts
pricingOverrides: z
  .array(
    z.object({
      itemId: z.string().uuid(),
      grossMargin: z.string().nullable(),
    }),
  )
  .optional(),
```

Extrair o miolo do `PUT /:id` para `export async function saveInboundDraft(tenantId, documentId, body)`. No fim, depois de gravar linhas e de-para:

```ts
if (body.pricingOverrides) {
  for (const override of body.pricingOverrides) {
    if (override.grossMargin != null) {
      const margin = Number(override.grossMargin.replace(',', '.'));
      if (!Number.isFinite(margin) || margin < 0 || margin >= 100) {
        throw new InboundError(
          400,
          'Informe a margem bruta entre 0 e 100, sem incluir 100.',
        );
      }
    }
  }
  await db
    .delete(inboundPricingOverrides)
    .where(
      and(
        eq(inboundPricingOverrides.documentId, documentId),
        eq(inboundPricingOverrides.tenantId, tenantId),
      ),
    );
  if (body.pricingOverrides.length > 0) {
    await db.insert(inboundPricingOverrides).values(
      body.pricingOverrides.map((override) => ({
        tenantId,
        documentId,
        itemId: override.itemId,
        grossMargin: override.grossMargin,
      })),
    );
  }
}
const linkedItems = await db
  .select({ itemId: inboundDocumentLines.itemId })
  .from(inboundDocumentLines)
  .where(
    and(
      eq(inboundDocumentLines.documentId, documentId),
      eq(inboundDocumentLines.tenantId, tenantId),
    ),
  );
const ids = linkedItems.flatMap((line) => (line.itemId ? [line.itemId] : []));
await db
  .delete(inboundPricingOverrides)
  .where(
    and(
      eq(inboundPricingOverrides.documentId, documentId),
      eq(inboundPricingOverrides.tenantId, tenantId),
      ids.length > 0 ? notInArray(inboundPricingOverrides.itemId, ids) : undefined,
    ),
  );
```

Importar `notInArray` de `drizzle-orm`. Quando `ids` está vazio, apagar todos os overrides da nota em vez de passar `undefined` no `and`.

`GET /:id/pricing`, no mesmo módulo, devolve:

```ts
{
  editable: draftStatuses.has(document.status),
  discovered: document.status === 'discovered',
  suggestsListPrice: nature?.suggestsListPrice ?? false,
  updatesAverageCost: nature?.updatesAverageCost ?? false,
  costFlags: {
    freightInCost: nature?.freightInCost ?? false,
    insuranceInCost: nature?.insuranceInCost ?? false,
    otherInCost: nature?.otherInCost ?? false,
    discountInCost: nature?.discountInCost ?? false,
    ipiInCost: nature?.ipiInCost ?? false,
    stInCost: nature?.stInCost ?? false,
    icmsInCost: nature?.icmsInCost ?? false,
  },
  stock: [{ itemId, quantity, averageCost, grossMargin, code, name }],
  overrides: [{ itemId, grossMargin }],
}
```

`stock` só inclui os itens vinculados nas linhas. Saldo ausente vale quantidade `0` e custo médio `0`. Nota inexistente: 404. O `GET /:id` atual não muda.

- [x] **Step 4: Run the test**

```powershell
pnpm test
```

Working directory: `apps/api`. Expected: PASS, inclusive os casos da task 3.

- [x] **Step 5: Commit**

```powershell
git add apps/api/src/modules/inbound/inbound.ts apps/api/test/inbound-pricing.integration.test.ts
git commit -m @"
Grava a margem ajustada no rascunho sem mudar o preço de lista.

"@
```

## Task 5: API do item recusa margem de 100%

**Files:**
- Modify: `apps/api/src/modules/catalog/items.ts`
- Create: `apps/api/test/item-margin.test.ts`
- Modify: `apps/api/scripts/run-tests.ts`

- [x] **Step 1: Write the failing test**

Exportar de `items.ts` a função que o `buildItemValues` passa a chamar:

```ts
export function grossMarginRangeMessage(value: string | null | undefined) {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return null;
  const margin = Number(trimmed.replace(',', '.'));
  if (!Number.isFinite(margin) || margin < 0 || margin >= 100) {
    return 'Informe a margem bruta entre 0 e 100, sem incluir 100.';
  }
  return null;
}
```

O teste importa essa função:

```ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { grossMarginRangeMessage } from '../src/modules/catalog/items.ts';

describe('margem bruta do item', () => {
  it('recusa 100 e valor negativo', () => {
    assert.equal(
      grossMarginRangeMessage('100'),
      'Informe a margem bruta entre 0 e 100, sem incluir 100.',
    );
    assert.equal(
      grossMarginRangeMessage('-1'),
      'Informe a margem bruta entre 0 e 100, sem incluir 100.',
    );
  });

  it('aceita vazio e 45', () => {
    assert.equal(grossMarginRangeMessage(''), null);
    assert.equal(grossMarginRangeMessage('45.0000'), null);
  });
});
```

Registrar `test/item-margin.test.ts` em `run-tests.ts`.

- [x] **Step 2: Run the test to verify it fails**

```powershell
pnpm exec tsx --test test/item-margin.test.ts
```

Working directory: `apps/api`. Expected: FAIL, `grossMarginRangeMessage` is not exported.

- [x] **Step 3: Use it in buildItemValues**

Depois do `parseDecimal` da margem, se `!grossMargin.ok`, chamar `grossMarginRangeMessage(data.grossMargin)` e, quando ele retornar texto, usar esse texto. Senão, manter `Informe a margem bruta com até 4 casas decimais.` Se o parse funcionou e `grossMarginRangeMessage(grossMargin.value)` retornar texto, devolver esse texto. `buildItemValues` é o caminho do POST e do PUT do item.

- [x] **Step 4: Run the test**

```powershell
pnpm exec tsx --test test/item-margin.test.ts
```

Expected: PASS.

- [x] **Step 5: Commit**

```powershell
git add apps/api/src/modules/catalog/items.ts apps/api/test/item-margin.test.ts apps/api/scripts/run-tests.ts
git commit -m @"
Recusa margem bruta de 100% ou mais no cadastro do item.

"@
```

## Task 6: Cadastro do item recalcula

**Files:**
- Modify: `apps/ui/src/components/Catalog/Items/FormItem.tsx`

- [x] **Step 1: Couple the two fields when there is an average cost**

Importar `syncPricing` de `@erp-360/shared`.

O custo médio da tela é `Number(itemToUpdate?.averageCost ?? 0)`. Se não for finito, usar `0`.

No `onChange` do preço:

```ts
onChange={(event) => {
  const next = maskListPrice(event.target.value);
  const price = Number(listPriceForApi(next));
  const synced = syncPricing({
    average: Number(itemToUpdate?.averageCost ?? 0),
    marginPercent: Number(listPriceForApi(grossMargin)),
    price: next ? price : null,
    edited: 'price',
    emptyPriceWithoutCost: false,
  });
  setListPrice(next);
  if (synced.marginPercent == null) {
    if (!next) setGrossMargin('');
    return;
  }
  setGrossMargin(formatPercent(synced.marginPercent.toFixed(4)));
}}
```

No `onChange` da margem, o mesmo com `edited: 'margin'` e `emptyPriceWithoutCost: false`. Atualizar `listPrice` com `formatListPrice(synced.price?.toFixed(4))` quando `synced.price` não for nulo. Sem custo médio, `syncPricing` devolve os dois valores como estavam: não chamar `set` no campo que a pessoa não editou.

Trocar o parágrafo de ajuda por:

```tsx
<p className="text-sm text-zinc-500">
  Havendo custo médio, o preço de lista é esse custo dividido por um menos a margem.
</p>
```

Se o preço digitado ficar abaixo do custo médio (`syncPricing` devolve `marginPercent: null` com preço preenchido e custo maior que zero), mostrar sob o campo: `Preço de lista menor que o custo médio.` A margem anterior permanece e o botão de salvar do item fica desabilitado até o preço voltar a ser válido.

- [ ] **Step 2: Check the screen**

Com a API e o Vite que já estão no ar, abrir um item que tenha custo médio. Informar margem 45 e ver o preço virar custo / 0,55. Informar um preço e ver a margem voltar. Item sem custo médio: editar um campo não mexe no outro.

Ainda não conferido: a tela de login impediu o clique.

- [x] **Step 3: Commit**

Feito em `2470b66`.

```powershell
git add apps/ui/src/components/Catalog/Items/FormItem.tsx
git commit -m @"
Recalcula margem e preço de lista no cadastro do item.

"@
```

## Task 7: Página Vínculos

**Files:**
- Modify: `apps/ui/src/services/inbound.ts`
- Create: `apps/ui/src/components/Inbound/FormInboundLinks.tsx`
- Modify: `apps/ui/src/components/Inbound/FormInbound.tsx`
- Modify: `apps/ui/src/App.tsx`

- [x] **Step 1: Extend the client**

Em `apps/ui/src/services/inbound.ts`, o cliente ficou assim. `costFlags` usa `CostFlags` de `@erp-360/shared`.

```ts
export interface InboundPricingStock {
  itemId: string;
  code: string;
  name: string;
  quantity: string;
  averageCost: string;
  grossMargin: string | null;
}

export interface InboundPricing {
  editable: boolean;
  discovered: boolean;
  suggestsListPrice: boolean;
  updatesAverageCost: boolean;
  costFlags: CostFlags;
  stock: InboundPricingStock[];
  overrides: { itemId: string; grossMargin: string | null }[];
}

pricing: async (id: string): Promise<InboundPricing> => {
  const res = await apiFetch(`/inbound/${id}/pricing`);
  return parse(res, 'Falha ao carregar os preços da nota.');
},
```

Em `InboundDraft`, campo opcional:

```ts
pricingOverrides?: { itemId: string; grossMargin: string | null }[];
```

`inboundService.save` já envia o body. Incluir `pricingOverrides` só quando o chamador passar.

- [x] **Step 2: Build the page**

`FormInboundLinks` carrega a nota (`inboundService.get`) e `inboundService.pricing`. Se `discovered`, `navigate` para `/inbound/${id}` com o `state` recebido. Se a nota não estiver em `pending`, `pre_note` ou `divergent`, os campos ficam desabilitados. Em `posted`, `reversed` e `ignored`, margem e preço vêm do item, fator e vínculo vêm das linhas, e o custo médio projetado não é calculado: o estoque já inclui a nota. O mapa de overrides começa só com o que a API devolveu. A margem do cadastro aparece na tela, mas não vira override enquanto a pessoa não editar o campo.

Estado local: as linhas do rascunho (item e fator) e um mapa `overrides` iniciado pelos overrides da API. `edited` por item: `'margin' | 'price' | 'none'`, começando em `'none'`.

Para cada item presente nas linhas, o grupo mostra código, nome, saldo, custo médio atual, quantidade desta nota (`commercialQty * factor`), custo médio projetado e, em cada linha, o custo da entrada. A conta mora em `inboundPricing.ts`: `entryUnitCost`, `projectedAverageForItem` e `recomputePricing`, com as flags da natureza e os sete centavos da linha. Linhas sem item ficam no grupo Sem vínculo.

Margem inicial: override da nota, senão `grossMargin` do estoque/item. Preço inicial: `recomputePricing` com `edited: 'none'`.

Ao digitar margem ou preço, chamar `editPricingMargin` ou `editPricingPrice`. Se o preço ficar abaixo do custo, mostrar `Preço de lista menor que o custo médio.` e não atualizar o override. Margem vazia grava override `{ grossMargin: null }` para aquele item. Preço vazio faz o mesmo. Margem preenchida grava `grossMargin` com 4 casas, a margem derivada quando o campo editado foi o preço.

Ao mudar o fator, `recomputePricing` recalcula o custo com o `edited` daquele item. Fator menor ou igual a zero não entra no estado: o campo volta ao último fator válido.

Busca de item reutiliza `itemsService` como a grade faz hoje. O lápis abre o mesmo cadastro de item já usado em `FormInbound` (`newItemLine`). Ao vincular, a linha muda de grupo.

Salvar envia o rascunho da nota mais `pricingOverrides` com uma entrada por item que está no mapa (os carregados e os editados). Não envia preço de lista. Voltar usa o mesmo diálogo da nota quando o rascunho ou o mapa divergem do que foi carregado. O destino é `/inbound/${id}` com `location.state`.

Quando `suggestsListPrice` é falso ou `updatesAverageCost` é falso, um texto acima dos grupos diz: `O lançamento não altera o preço de lista desta natureza.`

O botão **Vínculos** fica no corpo da seção Itens de `FormInbound`, acima da grade, não dentro do botão que abre a seção. Se o formulário estiver sujo, abre o diálogo já existente; salvar navega para `/inbound/${id}/vinculos`, descartar também, continuar editando fica na nota.

Na grade, o fator vira texto. A célula de vínculo mostra o rótulo ou `Sem vínculo`, sem input de busca e sem lista. O lápis sai. Excluir de nota manual permanece.

Em `apps/ui/src/App.tsx`, rota `/inbound/:id/vinculos` com `FormInboundLinks` dentro de `Pagina`, ao lado de `/inbound/:id`.

- [ ] **Step 3: Check the screen**

Abrir uma nota editável com XML. A grade não edita fator nem busca item. **Vínculos** abre a página. Duas linhas do mesmo item formam um grupo. Margem 45% mostra preço = custo médio projetado / 0,55. Salvar e recarregar a nota: o preço de lista do item no cadastro não mudou; a margem continua na página. Lançar a nota e abrir o item: margem e preço seguem o custo médio que o estoque ficou.

Ainda não conferido: a tela de login impediu o clique.

- [x] **Step 4: Commit**

A página saiu em três commits: `3b27639`, `ceb1f7c` e `6669309`.

```powershell
git add apps/ui/src/services/inbound.ts apps/ui/src/components/Inbound/FormInboundLinks.tsx apps/ui/src/components/Inbound/FormInbound.tsx apps/ui/src/App.tsx
git commit -m @"
Abre a página de vínculos da nota com fator, margem e preço de lista.

"@
```

## O que saiu diferente dos passos

- A conta da página mora em `inboundPricing.ts`, com teste. `FormInboundLinks` chama `entryUnitCost`, `projectedAverageForItem`, `recomputePricing`, `editPricingMargin` e `editPricingPrice`. O grupo mostra a coluna **Custo da entrada**.
- `GET /:id` devolve frete, seguro, outras despesas, desconto, IPI, ST e ICMS da linha. Sem esses centavos o custo projetado zerava os extras.
- Texto que não é número (`abc`) continua com a mensagem de casas decimais. A mensagem de faixa vale para número negativo ou maior ou igual a 100. Commit `eaefa95`.
- O snapshot `0058_snapshot.json` entrou em `671706c`, depois da migration.

## Fora deste plano

Não recalcular itens que não estão sendo lançados. Não gravar preço por fornecedor. Não mudar DANFE, pagamento, CFOP nem a lista. Não commit da pasta `.superpowers/`.
