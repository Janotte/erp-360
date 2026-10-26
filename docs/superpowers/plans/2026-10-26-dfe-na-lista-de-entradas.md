# DF-e na lista de entradas — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A NF-e baixada da SEFAZ entra na lista de Entradas como Descoberta, e o duplo clique, após confirmação, manifesta ciência, baixa o XML completo e importa essa mesma linha.

**Architecture:** A gravação da distribuição continua em `dfe_documents`. Em seguida, um promotor cria ou atualiza `inbound_documents` sem copiar o resumo para o arquivo da nota. O duplo clique decide entre bloquear, importar, manifestar ou só baixar. A ciência é um evento 210210 assinado, enviado ao Ambiente Nacional. A importação reutiliza `parseNfeXml` e preenche a linha Descoberta. A tela DF-e sai do menu.

**Tech Stack:** pnpm, Drizzle, Fastify, Zod, node:crypto, node-forge, React Query, Tailwind.

**Spec:** `docs/superpowers/specs/2026-10-26-dfe-na-lista-de-entradas-design.md`

---

## Arquivos

- Modificar `packages/modules/inbound/src/db/inbound.ts`: situação `discovered`, manifesto e situação na SEFAZ.
- Gerar `apps/api/src/db/migrations/0043_*.sql` com `pnpm db:generate`.
- Criar `apps/api/src/modules/inbound/dfe-note.ts`: leitura do resumo, do evento e a decisão do duplo clique.
- Criar `apps/api/src/modules/inbound/dfe-promote.ts`: promoção para a lista.
- Criar `apps/api/src/modules/inbound/dfe-event.ts`: pedido assinado de ciência e leitura da resposta.
- Criar `apps/api/src/modules/inbound/persist-nfe.ts`: gravação do XML completo, nova ou sobre a Descoberta.
- Modificar `apps/api/src/modules/inbound/dfe-store.ts`, `dfe-sync.ts`, `inbound.ts`.
- Modificar `apps/ui/src/components/Inbound/InboundPage.tsx`, `apps/ui/src/services/inbound.ts`, `App.tsx`, `AppSidebar.tsx`.
- Remover `apps/ui/src/components/Inbound/DfePage.tsx`.
- Testes em `apps/api/test/dfe-note.test.ts`, `dfe-promote.test.ts`, `dfe-event.test.ts`, `dfe-discover.test.ts`.
- Registrar esses arquivos em `apps/api/scripts/run-tests.ts`.

Os commits seguem o estilo do repositório: uma frase em português dizendo por que a mudança existe. Não usar Conventional Commits.

Comandos de teste, a partir da raiz do repositório:

```powershell
pnpm --dir apps/api test
```

Esse comando prepara o banco `erp360_test`. Não definir `DATABASE_NAME` antes de `pnpm db:migrate`, para a migração do desenvolvimento continuar em `erp360_db`.

---

### Task 1: Situação Descoberta e manifesto

**Files:**
- Modify: `packages/modules/inbound/src/db/inbound.ts`
- Create: migração gerada em `apps/api/src/db/migrations/`

- [ ] **Step 1: Acrescentar os enums e as colunas**

Em `inboundStatusEnum`, incluir `'discovered'` no final da lista.

```ts
export const recipientManifestationEnum = pgEnum('recipient_manifestation', [
  'none',
  'aware',
  'confirmed',
  'unaware',
  'not_performed',
]);

export const nfeAuthorizationStatusEnum = pgEnum('nfe_authorization_status', [
  'authorized',
  'denied',
  'cancelled',
]);
```

Em `inboundDocuments`, depois de `hasProtocol`:

```ts
recipientManifestation: recipientManifestationEnum('recipient_manifestation')
  .default('none')
  .notNull(),
authorizationStatus: nfeAuthorizationStatusEnum('authorization_status')
  .default('authorized')
  .notNull(),
```

- [ ] **Step 2: Gerar e aplicar a migração**

```powershell
pnpm --dir apps/api db:generate
pnpm --dir apps/api db:migrate
```

Expected: um SQL novo com `ALTER TYPE "public"."inbound_status" ADD VALUE 'discovered'`, os dois tipos novos e as duas colunas com default. O `db:migrate` termina sem erro em `erp360_db`.

- [ ] **Step 3: Commit**

```powershell
git add packages/modules/inbound/src/db/inbound.ts apps/api/src/db/migrations
git commit -m "Permite marcar uma entrada como descoberta e guardar o manifesto do destinatário."
```

---

### Task 2: Leitura do resumo e decisão do duplo clique

**Files:**
- Create: `apps/api/src/modules/inbound/dfe-note.ts`
- Test: `apps/api/test/dfe-note.test.ts`
- Modify: `apps/api/scripts/run-tests.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { discoveryAction, readDfeNote } from '../src/modules/inbound/dfe-note.ts';

const key = '42261018371298000101550010000021161300002070';

describe('nota descoberta a partir do DF-e', () => {
  it('lê número, série, emitente, valor e situação do resumo', () => {
    const note = readDfeNote(
      'summary',
      `<resNFe><chNFe>${key}</chNFe><CNPJ>18371298000101</CNPJ><xNome>Fornecedor</xNome><dhEmi>2026-10-23T10:00:00-03:00</dhEmi><vNF>1358.10</vNF><cSitNFe>1</cSitNFe></resNFe>`,
    );
    assert.deepEqual(note, {
      role: 'nfe',
      accessKey: key,
      emitterTaxId: '18371298000101',
      emitterName: 'Fornecedor',
      issueOn: '2026-10-23',
      number: '2116',
      series: '1',
      amount: 135810,
      authorizationStatus: 'authorized',
      manifestation: null,
      eventAt: null,
    });
  });

  it('lê cancelada, denegada e o evento de ciência', () => {
    assert.equal(
      readDfeNote('summary', `<resNFe><chNFe>${key}</chNFe><CNPJ>18371298000101</CNPJ><cSitNFe>3</cSitNFe></resNFe>`)
        .authorizationStatus,
      'cancelled',
    );
    assert.equal(
      readDfeNote('summary', `<resNFe><chNFe>${key}</chNFe><CNPJ>18371298000101</CNPJ><cSitNFe>2</cSitNFe></resNFe>`)
        .authorizationStatus,
      'denied',
    );
    const event = readDfeNote(
      'event',
      `<procEventoNFe><infEvento><chNFe>${key}</chNFe><tpEvento>210210</tpEvento><dhEvento>2026-10-26T14:00:00-03:00</dhEvento><nSeqEvento>1</nSeqEvento></infEvento></procEventoNFe>`,
    );
    assert.equal(event.role, 'event');
    assert.equal(event.manifestation, 'aware');
    assert.equal(event.eventAt, '2026-10-26T14:00:00-03:00');
  });

  it('escolhe a confirmação do duplo clique', () => {
    assert.equal(
      discoveryAction({
        status: 'discovered',
        authorizationStatus: 'cancelled',
        recipientManifestation: 'none',
        hasCompleteXml: false,
      }).kind,
      'blocked',
    );
    assert.equal(
      discoveryAction({
        status: 'discovered',
        authorizationStatus: 'authorized',
        recipientManifestation: 'none',
        hasCompleteXml: true,
      }).kind,
      'import',
    );
    assert.equal(
      discoveryAction({
        status: 'discovered',
        authorizationStatus: 'authorized',
        recipientManifestation: 'none',
        hasCompleteXml: false,
      }).kind,
      'manifest',
    );
    assert.equal(
      discoveryAction({
        status: 'discovered',
        authorizationStatus: 'authorized',
        recipientManifestation: 'aware',
        hasCompleteXml: false,
      }).kind,
      'download',
    );
    assert.equal(
      discoveryAction({
        status: 'pre_note',
        authorizationStatus: 'authorized',
        recipientManifestation: 'none',
        hasCompleteXml: true,
      }).kind,
      'none',
    );
  });
});
```

Incluir `'test/dfe-note.test.ts'` na lista de `apps/api/scripts/run-tests.ts`, ao lado de `test/dfe-sync.test.ts`.

- [ ] **Step 2: Rodar o teste e ver a falha**

Run: `pnpm --dir apps/api test`

Expected: FAIL com módulo `dfe-note.ts` ausente.

- [ ] **Step 3: Implementar a leitura**

Criar `apps/api/src/modules/inbound/dfe-note.ts`:

```ts
export type RecipientManifestation = 'none' | 'aware' | 'confirmed' | 'unaware' | 'not_performed';
export type NfeAuthorizationStatus = 'authorized' | 'denied' | 'cancelled';

export interface DfeNoteView {
  role: 'nfe' | 'event' | 'ignore';
  accessKey: string | null;
  emitterTaxId: string | null;
  emitterName: string | null;
  issueOn: string | null;
  number: string | null;
  series: string | null;
  amount: number | null;
  authorizationStatus: NfeAuthorizationStatus;
  manifestation: Exclude<RecipientManifestation, 'none'> | null;
  eventAt: string | null;
}

const manifestByEvent = {
  '210200': 'confirmed',
  '210210': 'aware',
  '210220': 'unaware',
  '210240': 'not_performed',
} as const;

function tag(xml: string, name: string) {
  return xml.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1]?.trim() || null;
}

function digitsFromKey(accessKey: string, start: number, length: number) {
  return accessKey.slice(start, start + length).replace(/^0+/, '') || '0';
}

export function readDfeNote(kind: string, xml: string): DfeNoteView {
  const accessKey = tag(xml, 'chNFe') ?? xml.match(/Id="NFe([0-9]{44})"/)?.[1] ?? null;
  const base = {
    accessKey,
    emitterTaxId: tag(xml, 'CNPJ'),
    emitterName: tag(xml, 'xNome'),
    issueOn: tag(xml, 'dhEmi')?.slice(0, 10) ?? null,
    number: accessKey ? digitsFromKey(accessKey, 25, 9) : null,
    series: accessKey ? digitsFromKey(accessKey, 22, 3) : null,
    amount: null as number | null,
    authorizationStatus: 'authorized' as NfeAuthorizationStatus,
    manifestation: null,
    eventAt: tag(xml, 'dhEvento'),
  };
  const amountText = tag(xml, 'vNF');
  const parsedAmount = amountText == null ? Number.NaN : Number(amountText);
  if (Number.isFinite(parsedAmount)) base.amount = Math.round(parsedAmount * 100);
  const situation = tag(xml, 'cSitNFe');
  if (situation === '2') base.authorizationStatus = 'denied';
  if (situation === '3') base.authorizationStatus = 'cancelled';
  const eventCode = tag(xml, 'tpEvento');
  if (kind === 'event' || kind === 'event_summary') {
    return {
      ...base,
      role: 'event',
      manifestation: manifestByEvent[eventCode as keyof typeof manifestByEvent] ?? null,
    };
  }
  if ((kind === 'summary' || kind === 'nfe') && accessKey && base.emitterTaxId) {
    return { ...base, role: 'nfe' };
  }
  return { ...base, role: 'ignore' };
}

export function discoveryAction(input: {
  status: string;
  authorizationStatus: NfeAuthorizationStatus;
  recipientManifestation: RecipientManifestation;
  hasCompleteXml: boolean;
}):
  | { kind: 'blocked'; message: string }
  | { kind: 'import' | 'manifest' | 'download' | 'none' } {
  if (input.status !== 'discovered') return { kind: 'none' };
  if (input.authorizationStatus === 'cancelled') {
    return { kind: 'blocked', message: 'Esta NF-e está cancelada na SEFAZ.' };
  }
  if (input.authorizationStatus === 'denied') {
    return { kind: 'blocked', message: 'Esta NF-e está denegada na SEFAZ.' };
  }
  if (input.hasCompleteXml) return { kind: 'import' };
  if (input.recipientManifestation === 'none') return { kind: 'manifest' };
  return { kind: 'download' };
}
```

- [ ] **Step 4: Rodar o teste e ver o sucesso**

Run: `pnpm --dir apps/api test`

Expected: PASS, inclusive `nota descoberta a partir do DF-e`.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/src/modules/inbound/dfe-note.ts apps/api/test/dfe-note.test.ts apps/api/scripts/run-tests.ts
git commit -m "Permite ler o resumo do DF-e e decidir o que o duplo clique ainda precisa fazer."
```

---

### Task 3: Promover o documento baixado para a entrada

**Files:**
- Create: `apps/api/src/modules/inbound/dfe-promote.ts`
- Test: `apps/api/test/dfe-promote.test.ts`
- Modify: `apps/api/scripts/run-tests.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { tenants } from '@erp-360/mod-core';
import { inboundDocuments } from '@erp-360/mod-inbound';
import { eq } from 'drizzle-orm';

import { db } from '../src/db/index.ts';
import { promoteDfeNotes } from '../src/modules/inbound/dfe-promote.ts';
import { createCompany } from './fixtures.ts';

const key = '42261018371298000101550010000021161300002070';
const summary = `<resNFe><chNFe>${key}</chNFe><CNPJ>18371298000101</CNPJ><xNome>Fornecedor</xNome><dhEmi>2026-10-23T10:00:00-03:00</dhEmi><vNF>1358.10</vNF><cSitNFe>1</cSitNFe></resNFe>`;

async function tenantCnpj(tenantId: string) {
  const [row] = await db
    .select({ cnpj: tenants.cnpj })
    .from(tenants)
    .where(eq(tenants.id, tenantId));
  return row.cnpj;
}

describe('promoção do DF-e para a entrada', () => {
  it('cria a descoberta e não duplica a chave', async () => {
    const company = await createCompany('DF-e descoberta');
    const cnpj = await tenantCnpj(company.tenantId);
    assert.notEqual(cnpj, '18371298000101');
    await promoteDfeNotes(db, company.tenantId, 'homologation', cnpj, [
      { kind: 'summary', accessKey: key, xml: summary },
    ]);
    await promoteDfeNotes(db, company.tenantId, 'homologation', cnpj, [
      { kind: 'summary', accessKey: key, xml: summary },
    ]);
    const rows = await db
      .select()
      .from(inboundDocuments)
      .where(eq(inboundDocuments.tenantId, company.tenantId));
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.status, 'discovered');
    assert.equal(rows[0]?.number, '2116');
    assert.equal(rows[0]?.series, '1');
    assert.equal(rows[0]?.totalAmount, 135810);
    assert.equal(rows[0]?.recipientManifestation, 'none');
  });

  it('ignora nota da própria empresa e evento sem nota', async () => {
    const company = await createCompany('DF-e própria');
    const cnpj = await tenantCnpj(company.tenantId);
    const ownKey = `42${key.slice(2, 6)}${cnpj}${key.slice(20)}`.slice(0, 44);
    await promoteDfeNotes(db, company.tenantId, 'homologation', cnpj, [
      {
        kind: 'summary',
        accessKey: ownKey,
        xml: summary.replaceAll('18371298000101', cnpj).replaceAll(key, ownKey),
      },
      {
        kind: 'event',
        accessKey: key,
        xml: `<procEventoNFe><infEvento><chNFe>${key}</chNFe><tpEvento>210210</tpEvento><dhEvento>2026-10-26T14:00:00-03:00</dhEvento></infEvento></procEventoNFe>`,
      },
    ]);
    const rows = await db
      .select({ id: inboundDocuments.id })
      .from(inboundDocuments)
      .where(eq(inboundDocuments.tenantId, company.tenantId));
    assert.equal(rows.length, 0);
  });

  it('grava a ciência na nota existente e não rebaixa quem já saiu de descoberta', async () => {
    const company = await createCompany('DF-e manifesto');
    const cnpj = await tenantCnpj(company.tenantId);
    await promoteDfeNotes(db, company.tenantId, 'homologation', cnpj, [
      { kind: 'summary', accessKey: key, xml: summary },
    ]);
    await db
      .update(inboundDocuments)
      .set({ status: 'pre_note' })
      .where(eq(inboundDocuments.tenantId, company.tenantId));
    await promoteDfeNotes(db, company.tenantId, 'homologation', cnpj, [
      {
        kind: 'event',
        accessKey: key,
        xml: `<procEventoNFe><infEvento><chNFe>${key}</chNFe><tpEvento>210210</tpEvento><dhEvento>2026-10-26T15:00:00-03:00</dhEvento></infEvento></procEventoNFe>`,
      },
    ]);
    const [row] = await db
      .select({
        status: inboundDocuments.status,
        recipientManifestation: inboundDocuments.recipientManifestation,
      })
      .from(inboundDocuments)
      .where(eq(inboundDocuments.tenantId, company.tenantId));
    assert.equal(row.status, 'pre_note');
    assert.equal(row.recipientManifestation, 'aware');
  });
});
```

`tenants` é exportado por `@erp-360/mod-core`. Importar `{ tenants } from '@erp-360/mod-core'` e `{ inboundDocuments } from '@erp-360/mod-inbound'`.

Registrar `test/dfe-promote.test.ts` em `run-tests.ts`.

- [ ] **Step 2: Rodar e ver a falha**

Run: `pnpm --dir apps/api test`

Expected: FAIL com `promoteDfeNotes` indefinido.

- [ ] **Step 3: Implementar o promotor**

Criar `apps/api/src/modules/inbound/dfe-promote.ts`. `client` aceita `db` ou a transação de `dfe-store.ts` (`DbTransaction`).

```ts
import { dfeDocuments, inboundDocuments } from '@erp-360/mod-inbound';
import type { CertificateEnvironment } from '@erp-360/shared';
import { and, eq, inArray } from 'drizzle-orm';

import type { db, DbTransaction } from '../../db/index.ts';
import { readDfeNote, type RecipientManifestation } from './dfe-note.ts';

type Client = typeof db | DbTransaction;

export async function promoteDfeNotes(
  client: Client,
  tenantId: string,
  environment: CertificateEnvironment,
  tenantCnpj: string,
  documents: { kind: string; accessKey: string | null; xml: string }[],
) {
  const byKey = new Map<string, ReturnType<typeof readDfeNote>[]>();
  for (const document of documents) {
    const note = readDfeNote(document.kind, document.xml);
    if (!note.accessKey || note.role === 'ignore') continue;
    const group = byKey.get(note.accessKey) ?? [];
    group.push(note);
    byKey.set(note.accessKey, group);
  }

  const keys = [...byKey.keys()];
  if (keys.length > 0) {
    const archived = await client
      .select({
        kind: dfeDocuments.kind,
        accessKey: dfeDocuments.accessKey,
        xml: dfeDocuments.xml,
      })
      .from(dfeDocuments)
      .where(
        and(
          eq(dfeDocuments.tenantId, tenantId),
          eq(dfeDocuments.environment, environment),
          inArray(dfeDocuments.accessKey, keys),
          inArray(dfeDocuments.kind, ['event', 'event_summary']),
        ),
      );
    for (const document of archived) {
      const note = readDfeNote(document.kind, document.xml);
      if (!note.accessKey || note.role !== 'event') continue;
      byKey.get(note.accessKey)?.push(note);
    }
  }

  for (const [accessKey, notes] of byKey) {
    const nfe = notes.find((note) => note.role === 'nfe');
    if (nfe?.emitterTaxId === tenantCnpj) continue;
    const events = notes
      .filter((note) => note.role === 'event' && note.manifestation)
      .sort((left, right) => (left.eventAt ?? '').localeCompare(right.eventAt ?? ''));
    const manifestation = events.at(-1)?.manifestation ?? null;
    const [existing] = await client
      .select({
        id: inboundDocuments.id,
        status: inboundDocuments.status,
      })
      .from(inboundDocuments)
      .where(
        and(
          eq(inboundDocuments.tenantId, tenantId),
          eq(inboundDocuments.accessKey, accessKey),
        ),
      )
      .limit(1);

    if (!existing && nfe) {
      await client.insert(inboundDocuments).values({
        tenantId,
        status: 'discovered',
        accessKey,
        number: nfe.number || '0',
        series: nfe.series || '0',
        issueOn: nfe.issueOn || '1970-01-01',
        supplierTaxId: nfe.emitterTaxId,
        supplierName: nfe.emitterName?.slice(0, 120) ?? null,
        totalAmount: nfe.amount ?? 0,
        recipientManifestation: (manifestation ?? 'none') as RecipientManifestation,
        authorizationStatus: nfe.authorizationStatus,
      });
      continue;
    }
    if (!existing) continue;
    const patch: {
      recipientManifestation?: RecipientManifestation;
      authorizationStatus?: typeof nfe.authorizationStatus;
      supplierName?: string | null;
      totalAmount?: number;
    } = {};
    if (manifestation) patch.recipientManifestation = manifestation;
    if (existing.status === 'discovered' && nfe) {
      patch.authorizationStatus = nfe.authorizationStatus;
      if (nfe.emitterName) patch.supplierName = nfe.emitterName.slice(0, 120);
      if (nfe.amount != null) patch.totalAmount = nfe.amount;
    }
    if (Object.keys(patch).length > 0) {
      await client
        .update(inboundDocuments)
        .set(patch)
        .where(eq(inboundDocuments.id, existing.id));
    }
  }
}
```

Se `issueOn` vier vazio num resumo sem `dhEmi`, não inserir a nota: pular esse `nfe`. A coluna é obrigatória e a data `1970-01-01` não deve aparecer na lista. Ajustar o `if (!existing && nfe)` para exigir `nfe.issueOn`.

- [ ] **Step 4: Rodar e ver o sucesso**

Run: `pnpm --dir apps/api test`

Expected: PASS, inclusive `promoção do DF-e para a entrada`.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/src/modules/inbound/dfe-promote.ts apps/api/test/dfe-promote.test.ts apps/api/scripts/run-tests.ts
git commit -m "Cria a entrada descoberta a partir do DF-e sem duplicar a chave."
```

---

### Task 4: Promover ao gravar a distribuição

**Files:**
- Modify: `apps/api/src/modules/inbound/dfe-store.ts`
- Modify: `apps/api/test/dfe-sync.test.ts`

- [ ] **Step 1: Acrescentar o teste no describe `gravação da busca de DF-e`**

O XML do teste que já grava o lote precisa incluir CNPJ, nome, emissão, valor e `cSitNFe`, senão a promoção não tem data. No teste novo:

```ts
it('abre uma entrada descoberta ao gravar o resumo', async () => {
  const company = await createCompany('DF-e grava descoberta');
  const key = '42261018371298000101550010000021161300002070';
  await runDfeSync({
    tenantId: company.tenantId,
    environment: 'homologation',
    cnpj,
    cUF: '42',
    query: { kind: 'cursor' },
    now,
    fetch: async () =>
      soap(
        '000000000000001',
        '000000000000001',
        '138',
        `<resNFe><chNFe>${key}</chNFe><CNPJ>18371298000101</CNPJ><xNome>Fornecedor</xNome><dhEmi>2026-10-23T10:00:00-03:00</dhEmi><vNF>1358.10</vNF><cSitNFe>1</cSitNFe></resNFe>`,
      ),
  });
  const [row] = await db
    .select({ status: inboundDocuments.status, number: inboundDocuments.number })
    .from(inboundDocuments)
    .where(eq(inboundDocuments.tenantId, company.tenantId));
  assert.equal(row.status, 'discovered');
  assert.equal(row.number, '2116');
});
```

Importar `inboundDocuments` se o arquivo de teste ainda não importar.

- [ ] **Step 2: Rodar e ver a falha**

Run: `pnpm --dir apps/api test`

Expected: FAIL porque `row` é `undefined`.

- [ ] **Step 3: Chamar o promotor dentro da transação**

Em `saveDfeDistribution`, depois de atualizar o cursor e antes de encerrar a transação, carregar o CNPJ do tenant e chamar `promoteDfeNotes` com o mesmo `tx` e `distribution.documents`.

```ts
const [tenant] = await tx
  .select({ cnpj: tenants.cnpj })
  .from(tenants)
  .where(eq(tenants.id, tenantId))
  .limit(1);
await promoteDfeNotes(
  tx,
  tenantId,
  environment,
  tenant?.cnpj ?? '',
  distribution.documents,
);
```

`tenants` vem de `@erp-360/mod-core`. O cursor continua avançando na mesma transação. Um resumo sem data não cria nota e também não desfaz o arquivo de DF-e: `promoteDfeNotes` apenas pula esse item.

- [ ] **Step 4: Rodar e ver o sucesso**

Run: `pnpm --dir apps/api test`

Expected: PASS. Os testes antigos de cursor e de lista de DF-e continuam verdes.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/src/modules/inbound/dfe-store.ts apps/api/test/dfe-sync.test.ts
git commit -m "Abre a entrada descoberta quando a distribuição de DF-e grava um resumo."
```

---

### Task 5: Filtros da lista de entradas

**Files:**
- Modify: `apps/api/src/modules/inbound/inbound.ts` no `GET /`
- Test: `apps/api/test/dfe-promote.test.ts`

- [ ] **Step 1: Escrever o teste da busca**

No mesmo arquivo de promoção, depois de criar uma descoberta:

```ts
it('encontra a nota pelo número, pela chave e pelo emitente', async () => {
  const company = await createCompany('DF-e filtro');
  const cnpj = await tenantCnpj(company.tenantId);
  await promoteDfeNotes(db, company.tenantId, 'homologation', cnpj, [
    { kind: 'summary', accessKey: key, xml: summary },
  ]);
  const byNumber = await listInboundDocuments(company.tenantId, { search: '2116' });
  const byKey = await listInboundDocuments(company.tenantId, { search: key });
  const byName = await listInboundDocuments(company.tenantId, { search: 'Fornecedor' });
  const byStatus = await listInboundDocuments(company.tenantId, { status: 'posted' });
  assert.equal(byNumber.length, 1);
  assert.equal(byKey.length, 1);
  assert.equal(byName[0]?.supplierName, 'Fornecedor');
  assert.equal(byStatus.length, 0);
});
```

Exportar `listInboundDocuments(tenantId, query)` de `inbound.ts` e usar essa função no `GET /`.

- [ ] **Step 2: Rodar e ver a falha**

Run: `pnpm --dir apps/api test`

Expected: FAIL com `listInboundDocuments` indefinido.

- [ ] **Step 3: Implementar a consulta**

A função recebe:

```ts
{
  search?: string;
  issueFrom?: string;
  issueTo?: string;
  inboundFrom?: string;
  inboundTo?: string;
  status?: 'pending' | 'pre_note' | 'divergent' | 'posted' | 'reversed' | 'ignored' | 'discovered';
}
```

Ela mantém o `ensureInboundSetup` e o `orderBy` atuais. Acrescenta `natureName: operationNatures.name`, `recipientManifestation` e `authorizationStatus` no `select`. Faz `leftJoin` de `operationNatures` por `inboundDocuments.natureId`.

Filtros, todos opcionais:

- `status` igual à coluna.
- `issueFrom` / `issueTo` com `gte` / `lte` em `issueOn`.
- `inboundFrom` / `inboundTo` com `gte` / `lte` em `inboundOn`. Nota sem data de entrada fica de fora desse filtro.
- `search` com texto: `ilike` em `supplierName` e em `persons.name`. Se restarem dígitos, também `like` em `number` e em `accessKey`.

O `GET /` valida a query com Zod. Datas são `^\d{4}-\d{2}-\d{2}$`. `search` tem no máximo 120 caracteres.

- [ ] **Step 4: Rodar e ver o sucesso**

Run: `pnpm --dir apps/api test`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/src/modules/inbound/inbound.ts apps/api/test/dfe-promote.test.ts
git commit -m "Permite buscar a entrada por número, chave ou emitente e filtrar emissão, entrada e situação."
```

---

### Task 6: Pedido assinado de ciência

**Files:**
- Create: `apps/api/src/modules/inbound/dfe-event.ts`
- Test: `apps/api/test/dfe-event.test.ts`
- Modify: `apps/api/scripts/run-tests.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { describe, it } from 'node:test';

import forge from 'node-forge';

import {
  awarenessEventRequest,
  nfeEventTimestamp,
  parseAwarenessEvent,
} from '../src/modules/inbound/dfe-event.ts';

const key = '42261018371298000101550010000021161300002070';

function material() {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const certificate = forge.pki.createCertificate();
  certificate.publicKey = forge.pki.publicKeyFromPem(pair.publicKey.export({ type: 'spki', format: 'pem' }).toString());
  certificate.serialNumber = '01';
  certificate.validity.notBefore = new Date('2026-01-01T00:00:00Z');
  certificate.validity.notAfter = new Date('2027-01-01T00:00:00Z');
  const attrs = [{ name: 'commonName', value: 'ERP 360' }];
  certificate.setSubject(attrs);
  certificate.setIssuer(attrs);
  certificate.sign(forge.pki.privateKeyFromPem(pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()), forge.md.sha256.create());
  return {
    privateKeyPem: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    certificatePem: forge.pki.certificateToPem(certificate),
  };
}

describe('ciência da operação', () => {
  it('assina o evento 210210 para o Ambiente Nacional', () => {
    const keys = material();
    const request = awarenessEventRequest({
      environment: 'homologation',
      cnpj: '18371298000101',
      accessKey: key,
      at: nfeEventTimestamp(new Date('2026-10-26T17:00:00.000Z')),
      privateKeyPem: keys.privateKeyPem,
      certificatePem: keys.certificatePem,
    });
    assert.equal(
      request.endpoint,
      'https://hom1.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx',
    );
    assert.match(request.body, /<cOrgao>91<\/cOrgao>/);
    assert.match(request.body, /<tpAmb>2<\/tpAmb>/);
    assert.match(request.body, /<tpEvento>210210<\/tpEvento>/);
    assert.match(request.body, /<descEvento>Ciencia da Operacao<\/descEvento>/);
    assert.match(request.body, new RegExp(`Id="ID210210${key}01"`));
    assert.match(request.body, /<Signature xmlns="http:\/\/www.w3.org\/2000\/09\/xmldsig#">/);
    assert.equal(request.headers['Content-Type']?.includes('application/soap+xml'), true);
  });

  it('aceita o evento registrado e a duplicidade', () => {
    assert.deepEqual(
      parseAwarenessEvent(
        '<retEnvEvento><cStat>128</cStat><retEvento><infEvento><cStat>135</cStat><xMotivo>Evento registrado</xMotivo></infEvento></retEvento></retEnvEvento>',
      ),
      { accepted: true, status: '135', reason: 'Evento registrado' },
    );
    assert.equal(
      parseAwarenessEvent('<retEnvEvento><cStat>128</cStat><retEvento><infEvento><cStat>573</cStat><xMotivo>Duplicidade</xMotivo></infEvento></retEvento></retEnvEvento>')
        .accepted,
      true,
    );
    const refused = parseAwarenessEvent(
      '<retEnvEvento><cStat>128</cStat><retEvento><infEvento><cStat>999</cStat><xMotivo>Rejeicao</xMotivo></infEvento></retEvento></retEnvEvento>',
    );
    assert.equal(refused.accepted, false);
    assert.equal(refused.reason, 'Rejeicao');
  });
});
```

Registrar `test/dfe-event.test.ts`.

- [ ] **Step 2: Rodar e ver a falha**

Run: `pnpm --dir apps/api test`

Expected: FAIL com módulo `dfe-event.ts` ausente.

- [ ] **Step 3: Implementar o pedido**

Criar `dfe-event.ts`. O horário do evento é `America/Sao_Paulo`, no formato `YYYY-MM-DDTHH:mm:ss-03:00`.

```ts
export function nfeEventTimestamp(now: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
  return `${pick('year')}-${pick('month')}-${pick('day')}T${pick('hour')}:${pick('minute')}:${pick('second')}-03:00`;
}
```

O `infEvento` leva `xmlns="http://www.portalfiscal.inf.br/nfe"` e o `Id` nessa ordem, sem espaço entre as tags. O digest SHA-1 é dessa string exata. `SignedInfo` usa C14N 20010315, RSA-SHA1 e a referência `#ID210210{chave}01`, com os transforms enveloped-signature e C14N. Assinar `SignedInfo` com `crypto.createSign('RSA-SHA1')`. `X509Certificate` é só o primeiro bloco PEM, sem cabeçalho e sem quebra de linha. `readPfxMaterial` devolve a folha nesse primeiro bloco.

URLs:

- produção: `https://www1.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx`
- homologação: `https://hom1.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx`

SOAP 1.2, namespace `http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4`, ação `nfeRecepcaoEvento`. O corpo interno é `envEvento` versão `1.00`, com `idLote` `1`, `nSeqEvento` `1` e `verEvento` `1.00`. `tpAmb` é `1` em produção e `2` em homologação.

`parseAwarenessEvent` lê o `cStat` e o `xMotivo` de `infEvento`, não o `cStat` 128 do lote. Aceita `135`, `136` e `573`. Qualquer outro código volta `accepted: false` com o motivo. XML sem `infEvento` volta `accepted: false` e motivo `A resposta da ciência da operação não pôde ser lida.`

- [ ] **Step 4: Rodar e ver o sucesso**

Run: `pnpm --dir apps/api test`

Expected: PASS, inclusive `ciência da operação`.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/src/modules/inbound/dfe-event.ts apps/api/test/dfe-event.test.ts apps/api/scripts/run-tests.ts
git commit -m "Permite assinar e ler a ciência da operação no Ambiente Nacional."
```

---

### Task 7: Duplo clique manifesta, baixa e importa a mesma linha

**Files:**
- Create: `apps/api/src/modules/inbound/persist-nfe.ts`
- Create: `apps/api/src/modules/inbound/dfe-discover.ts`
- Test: `apps/api/test/dfe-discover.test.ts`
- Modify: `apps/api/src/modules/inbound/inbound.ts`
- Modify: `apps/api/scripts/run-tests.ts`

- [ ] **Step 1: Extrair a gravação do XML**

Mover o miolo da transação de `POST /inbound/xml` para `persistParsedNfe` em `persist-nfe.ts`. A função recebe o cliente da transação, `tenantId`, o `ParsedNfe`, o `Buffer` do XML, o nome do arquivo e um `documentId` opcional.

Quando `documentId` está ausente, ela insere a nota como hoje: `pre_note` com protocolo e `divergent` sem protocolo. Quando `documentId` existe, ela atualiza essa linha com os mesmos campos e só segue se o status atual for `discovered`. Nesse caso apaga linhas e parcelas anteriores dessa nota antes de inserir as novas. O arquivo da nota é inserido com o buffer recebido, sem reescrever o XML. Linhas, vínculo de item, CFOP de entrada e parcelas permanecem o código que hoje está em `inbound.ts` por volta das linhas 617–674.

`POST /inbound/xml` passa a abrir a transação, chamar `persistParsedNfe` sem `documentId` e manter o 409 quando a chave já existe.

- [ ] **Step 2: Escrever o teste da ação**

```ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { tenants } from '@erp-360/mod-core';
import { inboundDocuments } from '@erp-360/mod-inbound';
import { eq } from 'drizzle-orm';

import { db } from '../src/db/index.ts';
import { discoverInboundDocument } from '../src/modules/inbound/dfe-discover.ts';
import { promoteDfeNotes } from '../src/modules/inbound/dfe-promote.ts';
import { createCompany } from './fixtures.ts';

const key = '42261018371298000101550010000021161300002070';
const summary = `<resNFe><chNFe>${key}</chNFe><CNPJ>18371298000101</CNPJ><xNome>Fornecedor</xNome><dhEmi>2026-10-23T10:00:00-03:00</dhEmi><vNF>1358.10</vNF><cSitNFe>1</cSitNFe></resNFe>`;

async function tenantCnpj(tenantId: string) {
  const [row] = await db.select({ cnpj: tenants.cnpj }).from(tenants).where(eq(tenants.id, tenantId));
  return row.cnpj;
}

describe('duplo clique da descoberta', () => {
  it('recusa nota cancelada sem chamar a SEFAZ', async () => {
    const company = await createCompany('DF-e cancelada');
    const cnpj = await tenantCnpj(company.tenantId);
    await promoteDfeNotes(db, company.tenantId, 'homologation', cnpj, [
      {
        kind: 'summary',
        accessKey: key,
        xml: summary.replace('<cSitNFe>1</cSitNFe>', '<cSitNFe>3</cSitNFe>'),
      },
    ]);
    const [row] = await db
      .select({ id: inboundDocuments.id })
      .from(inboundDocuments)
      .where(eq(inboundDocuments.tenantId, company.tenantId));
    let calls = 0;
    await assert.rejects(
      () => discoverInboundDocument(company.tenantId, row.id, async () => {
        calls += 1;
        return '';
      }),
      /cancelada na SEFAZ/,
    );
    assert.equal(calls, 0);
  });
});
```

O segundo teste monta um `procNFe` mínimo já aceito por `parseNfeXml` (com `infNFe`, chave, emitente, destinatário, um item e protocolo), grava esse XML em `dfe_documents` com `kind: 'nfe'`, ambiente `homologation` e NSU `000000000000009`, promove o resumo antes, e chama `discoverInboundDocument`. O fetch não é chamado. A linha fica `pre_note` quando o XML tem protocolo, o id não muda e existe uma linha de item.

O terceiro teste, sem `procNFe`, usa um fetch que na primeira chamada devolve o retorno de ciência `cStat` 135 e na segunda devolve o SOAP da distribuição sem `docZip`, só com `cStat` 137. O manifesto fica `aware`, o status fica `discovered` e o resultado é `{ outcome: 'aware' }`.

O quarto teste faz o fetch devolver `cStat` 999 na ciência. O manifesto permanece `none` e a rejeição traz o motivo.

Registrar `test/dfe-discover.test.ts`.

- [ ] **Step 3: Rodar e ver a falha**

Run: `pnpm --dir apps/api test`

Expected: FAIL com `discoverInboundDocument` indefinido.

- [ ] **Step 4: Implementar a ação**

`discoverInboundDocument(tenantId, documentId, post: (request) => Promise<string>)`:

1. Carrega a nota do tenant. Se não existir, `InboundError` 404 `Nota não encontrada.`
2. Calcula `hasCompleteXml` com um `dfe_documents` de `kind = 'nfe'` para a chave, no ambiente atual de `getOrCreateNfeSettings`.
3. Chama `discoveryAction`. `blocked` lança `InboundError` 400 com a mensagem. `none` lança 400 `Esta nota não está descoberta.`
4. `import`: lê o XML `nfe` arquivado e chama `persistParsedNfe` na transação com o id existente. Devolve `{ outcome: 'imported', document }` pelo `loadDocument`.
5. `manifest`: monta `awarenessEventRequest` com o certificado de `certificateMaterial` e o CNPJ/UF de `emitterStateCode`. Reutiliza as mesmas mensagens de certificado, UF e CNPJ que `syncTenantDfe`. Envia com `postCertificate`. Se `parseAwarenessEvent` recusar, grava nada e lança 502 com o motivo. Se aceitar, grava `recipientManifestation = 'aware'`.
6. Depois da ciência aceita, ou quando a ação já era `download`, consulta a chave com `dfeDistributionRequest` e `parseDfeDistribution`. Grava a resposta com `saveDfeDistribution`. Se o lote trouxer `procNFe`, importa na mesma linha e devolve `imported`. Se não trouxer, devolve `{ outcome: 'aware', message: 'A ciência foi registrada. O XML completo ainda não está disponível.' }` quando o manifesto ficou Ciente. No download sem XML novo, a mensagem é `O XML completo ainda não está disponível.`

A rota `POST /inbound/:id/discover` chama essa função com `postCertificate` como transporte. O retorno 200 é o objeto da ação.

Exportar `certificateMaterial` e `emitterStateCode` de `dfe-sync.ts`. Não copiar a validação do certificado.

- [ ] **Step 5: Rodar e ver o sucesso**

Run: `pnpm --dir apps/api test`

Expected: PASS, inclusive `duplo clique da descoberta`. A suíte antiga de importação de XML continua verde.

- [ ] **Step 6: Commit**

```powershell
git add apps/api/src/modules/inbound/persist-nfe.ts apps/api/src/modules/inbound/dfe-discover.ts apps/api/src/modules/inbound/inbound.ts apps/api/src/modules/inbound/dfe-sync.ts apps/api/test/dfe-discover.test.ts apps/api/scripts/run-tests.ts
git commit -m "Importa a NF-e descoberta na mesma linha depois da ciência e do download."
```

---

### Task 8: Lista de Entradas e saída da tela DF-e

**Files:**
- Modify: `apps/ui/src/services/inbound.ts`
- Modify: `apps/ui/src/components/Inbound/InboundPage.tsx`
- Modify: `apps/ui/src/App.tsx`
- Modify: `apps/ui/src/components/AppSidebar.tsx`
- Delete: `apps/ui/src/components/Inbound/DfePage.tsx`
- Modify: `apps/ui/src/services/dfe.ts` só se o botão de busca ainda precisar do `sync`

- [ ] **Step 1: Estender o serviço**

`InboundStatus` ganha `'discovered'`. O rótulo é `Descoberta`.

`InboundListItem` ganha `natureName: string | null`, `recipientManifestation` e `authorizationStatus`.

`list` envia a query:

```ts
list: async (filter: InboundListFilter): Promise<InboundListItem[]> => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filter)) {
    if (value) params.set(key, value);
  }
  const query = params.size > 0 ? `?${params.toString()}` : '';
  const res = await apiFetch(`/inbound${query}`);
  return parse(res, 'Falha ao carregar entradas.');
}
```

`discover` faz `POST /inbound/${id}/discover`.

Rótulos do manifesto: `none` Sem manifesto, `aware` Ciente, `confirmed` Confirmada, `unaware` Desconhecida, `not_performed` Não realizada.

As frases de confirmação são exatamente:

- `import`: `Importar esta NF-e?`
- `manifest`: `Manifestar ciência desta NF-e e baixar o XML completo?`
- `download`: `Baixar o XML completo?`

- [ ] **Step 2: Montar a lista**

Colunas: Número, Emitente, Emissão, Entrada, Valor, Natureza, Manifesto do destinatário, Situação.

Acima da tabela, um formulário com busca, emissão de/até, entrada de/até e situação. O estado aplicado só muda no submit. A query do React Query usa esse filtro.

O botão **Buscar na SEFAZ** chama `dfeService.sync`, mostra o mesmo aviso de espera ou de documentos recebidos que a tela DF-e mostrava, e invalida a lista de entradas.

Um clique numa linha que não é Descoberta continua abrindo o detalhe. Um clique numa Descoberta carrega a nota e mostra chave, emitente, emissão, valor e manifesto, sem itens e sem parcelas. Se `discoveryAction` for `blocked`, mostra a mensagem.

Duplo clique só na Descoberta. Se a ação for `blocked`, `toast.error` com a mensagem. Nos outros casos, `window.confirm` com a frase correspondente e, se o usuário aceitar, `POST /discover`. `imported` abre o detalhe atualizado. `aware` mostra a mensagem e mantém a Descoberta. Erro de API vai para `toast.error`.

- [ ] **Step 3: Remover a tela DF-e**

Apagar a rota `/inbound/dfe`, o hash `#inbound-dfe`, o import de `DfePage` e o item de menu DF-e. Apagar `apps/ui/src/components/Inbound/DfePage.tsx`. O serviço `dfe.ts` fica só com `sync`, usado pelo botão.

- [ ] **Step 4: Verificar**

`pnpm --dir apps/ui exec eslint src/components/Inbound/InboundPage.tsx src/services/inbound.ts src/App.tsx src/components/AppSidebar.tsx src/services/dfe.ts` termina sem erro.

No navegador, em `http://localhost:5173/inbound`, conferir as colunas, a busca, os filtros e o botão Buscar na SEFAZ. Se o navegador cair em `/login`, registrar que a sessão não estava disponível e não inventar credencial.

- [ ] **Step 5: Commit**

```powershell
git add apps/ui/src/components/Inbound/InboundPage.tsx apps/ui/src/services/inbound.ts apps/ui/src/services/dfe.ts apps/ui/src/App.tsx apps/ui/src/components/AppSidebar.tsx
git add -u apps/ui/src/components/Inbound/DfePage.tsx
git commit -m "Mostra a NF-e descoberta na lista de entradas e pede confirmação no duplo clique."
```

---

## Cobertura da spec

- Busca na SEFAZ e promoção: Tasks 3 e 4.
- Ignorar CNPJ próprio, evento sem nota e não rebaixar status: Task 3.
- Manifesto a partir do evento mais recente: Task 3, pela ordem de `eventAt`.
- Número, série, emissão, valor e situação SEFAZ: Task 2.
- Colunas, busca e filtros: Tasks 5 e 8.
- Confirmação do duplo clique: Tasks 2, 7 e 8.
- Ciência 210210, órgão 91, sem justificativa: Task 6.
- XML completo importa a mesma linha e não reescreve o arquivo: Task 7.
- Ciência recusada ou aceita sem XML: Task 7.
- Tela DF-e removida: Task 8.
- CT-e, confirmação manual, desconhecimento e operação não realizada ficam de fora. Nenhum task implementa esses botões.
