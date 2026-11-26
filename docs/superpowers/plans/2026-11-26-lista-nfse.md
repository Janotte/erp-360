# Lista de NFS-e Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exibir a consulta de NFS-e na UI, com `GET /nfse`, menu e lista no padrão de Entradas (busca, ordenação, filtros), sem abrir detalhe nesta entrega.

**Architecture:** Novo plugin Fastify em `/nfse` lista `nfse_requests` juntando documento e pessoa. A UI ganha `ListNfse` com query na URL, cliente em `services/nfse.ts`, rota `/nfse` e item de menu de primeiro nível. Pedir/enviar continuam na ordem.

**Tech Stack:** Fastify + Zod + Drizzle, React + React Query + React Router, `ListShell` / `StatusList`, testes `node:test` via `apps/api/scripts/run-tests.ts`.

**Spec:** `docs/superpowers/specs/2026-11-26-lista-nfse-design.md`

---

## File map

| File | Responsibility |
|---|---|
| Create: `apps/api/src/modules/nfse/list.ts` | Query Zod, listagem, rota `GET /` |
| Modify: `apps/api/src/app.ts` | Registrar `nfseListRoutes` em `/nfse` |
| Create: `apps/api/test/nfse-list.integration.test.ts` | Integração da lista |
| Modify: `apps/api/scripts/run-tests.ts` | Incluir o teste |
| Create: `apps/ui/src/services/nfse.ts` | Cliente `list` |
| Create: `apps/ui/src/components/Nfse/nfseTone.ts` | Cores de status |
| Create: `apps/ui/src/components/Nfse/ListNfse.tsx` | Tela da lista |
| Modify: `apps/ui/src/components/AppSidebar.tsx` | Item NFS-e |
| Modify: `apps/ui/src/App.tsx` | Rota `/nfse` e hash legado |

---

### Task 1: Teste de integração da listagem (falha primeiro)

**Files:**
- Create: `apps/api/test/nfse-list.integration.test.ts`
- Modify: `apps/api/scripts/run-tests.ts`

- [ ] **Step 1: Criar o teste que exige `GET /nfse`**

Criar `apps/api/test/nfse-list.integration.test.ts`:

```ts
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { billingDocuments } from '@erp-360/mod-billing';
import { nfseRequests } from '@erp-360/mod-nfse';
import { persons } from '@erp-360/mod-persons';
import { serviceOrders } from '@erp-360/mod-service-orders';
import { eq } from 'drizzle-orm';

import { buildApp } from '../src/app.ts';
import { env } from '../src/config/index.ts';
import { db } from '../src/db/index.ts';
import { createCompany, removeCompany } from './fixtures.ts';

type ListItem = {
  id: string;
  dpsNumber: number | null;
  series: string | null;
  status: string;
  createdAt: string;
  customerName: string;
  serviceAmount: number;
  accessKey: string | null;
};

type ListPage = {
  data: ListItem[];
  meta: { total: number; page: number; limit: number; totalPages: number };
};

describe('lista de NFS-e', { concurrency: false }, () => {
  const app = buildApp({ logger: false });
  let token = '';
  let tenantId = '';
  let userId = '';
  let personId = '';
  let otherPersonId = '';
  let pendingId = '';
  let authorizedId = '';

  before(async () => {
    assert.equal(env.database.name, 'erp360_test', 'Os testes só rodam no banco erp360_test.');
    await app.ready();
    const company = await createCompany('Lista NFS-e');
    tenantId = company.tenantId;
    userId = company.userId;
    personId = company.personId;
    token = app.jwt.sign({ userId, tenantId });

    const [other] = await db
      .insert(persons)
      .values({
        tenantId,
        name: 'Cliente Beta',
        isClient: true,
      })
      .returning({ id: persons.id });
    if (!other) throw new Error('pessoa');
    otherPersonId = other.id;

    async function seed(input: {
      personId: string;
      number: number;
      status: 'pending' | 'authorized' | 'rejected' | 'canceled';
      serviceAmount: number;
      series: string | null;
      dpsNumber: number | null;
      accessKey: string | null;
      createdAt: Date;
    }) {
      const [order] = await db
        .insert(serviceOrders)
        .values({
          tenantId,
          number: input.number,
          openedByUserId: userId,
          personId: input.personId,
          customerName: 'Cliente',
          status: 'delivered',
        })
        .returning({ id: serviceOrders.id });
      if (!order) throw new Error('ordem');
      const [document] = await db
        .insert(billingDocuments)
        .values({
          tenantId,
          number: input.number,
          personId: input.personId,
          serviceOrderId: order.id,
          productsAmount: 0,
          servicesAmount: input.serviceAmount,
          freightAmount: 0,
          discountAmount: 0,
          surchargeAmount: 0,
          totalAmount: input.serviceAmount,
          commercialStatus: 'issued',
          fiscalStatus: input.status === 'pending' ? 'pending' : input.status,
          issuedOn: '2026-11-20',
        })
        .returning({ id: billingDocuments.id });
      if (!document) throw new Error('documento');
      const [request] = await db
        .insert(nfseRequests)
        .values({
          tenantId,
          billingDocumentId: document.id,
          status: input.status,
          serviceAmount: input.serviceAmount,
          series: input.series,
          dpsNumber: input.dpsNumber,
          dpsId: input.dpsNumber
            ? `DPS${'0'.repeat(42 - String(input.dpsNumber).length)}${input.dpsNumber}`
            : null,
          accessKey: input.accessKey,
          environment: input.dpsNumber ? 'homologation' : null,
          createdAt: input.createdAt,
        })
        .returning({ id: nfseRequests.id });
      if (!request) throw new Error('pedido');
      return request.id;
    }

    pendingId = await seed({
      personId,
      number: 1,
      status: 'pending',
      serviceAmount: 1500,
      series: null,
      dpsNumber: null,
      accessKey: null,
      createdAt: new Date('2026-11-21T15:00:00.000Z'),
    });
    authorizedId = await seed({
      personId: otherPersonId,
      number: 2,
      status: 'authorized',
      serviceAmount: 3200,
      series: '00001',
      dpsNumber: 42,
      accessKey: '1'.repeat(50),
      createdAt: new Date('2026-11-22T15:00:00.000Z'),
    });
  });

  after(async () => {
    if (tenantId) {
      await db.delete(nfseRequests).where(eq(nfseRequests.tenantId, tenantId));
      await db.delete(billingDocuments).where(eq(billingDocuments.tenantId, tenantId));
      await db.delete(serviceOrders).where(eq(serviceOrders.tenantId, tenantId));
      await removeCompany(tenantId);
    }
    await app.close();
  });

  function headers() {
    return { authorization: `Bearer ${token}` };
  }

  it('lista com ordenação padrão por DPS e página', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/nfse?limit=10',
      headers: headers(),
    });
    assert.equal(response.statusCode, 200, response.body);
    const body = response.json() as ListPage;
    assert.equal(body.meta.total, 2);
    assert.equal(body.data[0]?.id, authorizedId);
    assert.equal(body.data[0]?.dpsNumber, 42);
    assert.equal(body.data[0]?.customerName, 'Cliente Beta');
    assert.equal(body.data[1]?.id, pendingId);
    assert.equal(body.data[1]?.dpsNumber, null);
  });

  it('filtra por status e intervalo de emissão', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/nfse?status=authorized&issuedFrom=2026-11-22&issuedTo=2026-11-22',
      headers: headers(),
    });
    assert.equal(response.statusCode, 200, response.body);
    const body = response.json() as ListPage;
    assert.equal(body.meta.total, 1);
    assert.equal(body.data[0]?.id, authorizedId);
  });

  it('busca por DPS, série, cliente e chave', async () => {
    const byDps = await app.inject({
      method: 'GET',
      url: '/nfse?q=42',
      headers: headers(),
    });
    assert.equal(byDps.statusCode, 200, byDps.body);
    assert.equal((byDps.json() as ListPage).data[0]?.id, authorizedId);

    const bySeries = await app.inject({
      method: 'GET',
      url: '/nfse?q=00001',
      headers: headers(),
    });
    assert.equal((bySeries.json() as ListPage).data[0]?.id, authorizedId);

    const byCustomer = await app.inject({
      method: 'GET',
      url: '/nfse?q=Beta',
      headers: headers(),
    });
    assert.equal((byCustomer.json() as ListPage).data[0]?.id, authorizedId);

    const byKey = await app.inject({
      method: 'GET',
      url: `/nfse?q=${'1'.repeat(8)}`,
      headers: headers(),
    });
    assert.equal((byKey.json() as ListPage).data[0]?.id, authorizedId);
  });

  it('ordena por total e rejeita sort inválido', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/nfse?sortField=serviceAmount&sortOrder=desc',
      headers: headers(),
    });
    assert.equal(response.statusCode, 200, response.body);
    const body = response.json() as ListPage;
    assert.equal(body.data[0]?.serviceAmount, 3200);

    const bad = await app.inject({
      method: 'GET',
      url: '/nfse?sortField=foo',
      headers: headers(),
    });
    assert.equal(bad.statusCode, 400);
  });
});
```

Ajuste fino: o `dpsId` precisa casar com `^DPS[0-9]{42}$`. Use exatamente 42 dígitos após `DPS`:

```ts
dpsId: input.dpsNumber
  ? `DPS${String(input.dpsNumber).padStart(42, '0')}`
  : null,
```

- [ ] **Step 2: Registrar o teste em `run-tests.ts`**

Em `apps/api/scripts/run-tests.ts`, logo após `test/nfse-send.integration.test.ts`, adicionar:

```ts
'test/nfse-list.integration.test.ts',
```

- [ ] **Step 3: Rodar o teste e confirmar falha**

Run:

```bash
pnpm exec tsx --test test/nfse-list.integration.test.ts
```

Working directory: `apps/api` (com `.env` de teste / `DATABASE_NAME=erp360_test` como os demais).

Expected: falha (rota `/nfse` inexistente ou 404).

- [ ] **Step 4: Commit**

```bash
git add apps/api/test/nfse-list.integration.test.ts apps/api/scripts/run-tests.ts
git commit -m "Adiciona o teste da lista de NFS-e, para a consulta falhar até existir o endpoint."
```

---

### Task 2: Endpoint `GET /nfse`

**Files:**
- Create: `apps/api/src/modules/nfse/list.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Implementar a listagem**

Criar `apps/api/src/modules/nfse/list.ts`:

```ts
import '../../types/fastify.ts';

import { billingDocuments } from '@erp-360/mod-billing';
import { nfseRequests } from '@erp-360/mod-nfse';
import { persons } from '@erp-360/mod-persons';
import { escapeIlike, listPageMeta, listPageSizes } from '@erp-360/shared';
import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { db } from '../../db/index.ts';
import { listPageQuery } from '../../lib/list-page.ts';

const sortFields = [
  'dpsNumber',
  'series',
  'status',
  'createdAt',
  'customerName',
  'serviceAmount',
  'accessKey',
] as const;

const listQuery = z.object({
  ...listPageQuery,
  q: z.string().max(120).optional(),
  status: z.enum(['pending', 'authorized', 'rejected', 'canceled']).optional(),
  issuedFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  issuedTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  sortField: z.enum(sortFields).default('dpsNumber'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export const nfseListRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('preHandler', fastify.autenticarETenant);

  fastify.get('/', { schema: { querystring: listQuery } }, async (request) => {
    const { tenantId } = request.user;
    const {
      page,
      limit: rawLimit,
      q,
      status,
      issuedFrom,
      issuedTo,
      sortField,
      sortOrder,
    } = request.query;
    const limit = rawLimit ?? 10;
    const offset = (page - 1) * limit;

    const personJoin = and(
      eq(persons.id, billingDocuments.personId),
      eq(persons.tenantId, billingDocuments.tenantId),
    );
    const documentJoin = and(
      eq(billingDocuments.id, nfseRequests.billingDocumentId),
      eq(billingDocuments.tenantId, nfseRequests.tenantId),
    );

    const filters = [eq(nfseRequests.tenantId, tenantId)];
    if (status) filters.push(eq(nfseRequests.status, status));
    if (issuedFrom) {
      filters.push(
        sql`((${nfseRequests.createdAt} AT TIME ZONE 'America/Sao_Paulo')::date >= ${issuedFrom}::date)`,
      );
    }
    if (issuedTo) {
      filters.push(
        sql`((${nfseRequests.createdAt} AT TIME ZONE 'America/Sao_Paulo')::date <= ${issuedTo}::date)`,
      );
    }
    const term = q?.trim();
    if (term) {
      const like = `%${escapeIlike(term)}%`;
      const matches = [
        sql`cast(${nfseRequests.dpsNumber} as text) ilike ${like}`,
        ilike(nfseRequests.series, like),
        sql`unaccent(${persons.name}) ilike unaccent(${like})`,
        ilike(nfseRequests.accessKey, like),
      ];
      const match = or(...matches);
      if (match) filters.push(match);
    }

    const direction = sortOrder === 'asc' ? 'ASC' : 'DESC';
    const sortSql = {
      dpsNumber: sql`${nfseRequests.dpsNumber} ${sql.raw(direction)} NULLS LAST`,
      series: sql`${nfseRequests.series} ${sql.raw(direction)} NULLS LAST`,
      status: sql`${nfseRequests.status} ${sql.raw(direction)}`,
      createdAt: sql`${nfseRequests.createdAt} ${sql.raw(direction)}`,
      customerName: sql`${persons.name} ${sql.raw(direction)}`,
      serviceAmount: sql`${nfseRequests.serviceAmount} ${sql.raw(direction)}`,
      accessKey: sql`${nfseRequests.accessKey} ${sql.raw(direction)} NULLS LAST`,
    } as const;

    const where = and(...filters);
    const rows = await db
      .select({
        id: nfseRequests.id,
        dpsNumber: nfseRequests.dpsNumber,
        series: nfseRequests.series,
        status: nfseRequests.status,
        createdAt: nfseRequests.createdAt,
        customerName: persons.name,
        serviceAmount: nfseRequests.serviceAmount,
        accessKey: nfseRequests.accessKey,
      })
      .from(nfseRequests)
      .innerJoin(billingDocuments, documentJoin)
      .innerJoin(persons, personJoin)
      .where(where)
      .orderBy(sortSql[sortField], asc(nfseRequests.id))
      .limit(limit)
      .offset(offset);

    const [totalRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(nfseRequests)
      .innerJoin(billingDocuments, documentJoin)
      .innerJoin(persons, personJoin)
      .where(where);

    const total = Number(totalRow?.count || 0);
    return {
      data: rows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
      })),
      meta: listPageMeta(total, page, limit),
    };
  });
};
```

Remova imports não usados (`asc`/`desc` se só usar `sql.raw`, e `listPageSizes` se não for referenciado). Mantenha só o necessário para o TypeScript limpo.

- [ ] **Step 2: Registrar a rota em `app.ts`**

Em `apps/api/src/app.ts`:

```ts
import { nfseListRoutes } from './modules/nfse/list.ts';
```

Perto dos demais registers:

```ts
fastify.register(nfseListRoutes, { prefix: '/nfse' });
```

Coloque após `nfseSettingsRoutes` ou junto das rotas de serviço.

- [ ] **Step 3: Rodar o teste e confirmar sucesso**

Run:

```bash
pnpm exec tsx --import tsx --test test/nfse-list.integration.test.ts
```

Ou o fluxo do projeto (`pnpm` script de testes da api, se for o habitual). Expected: todos os casos PASS.

Se o filtro de data falhar por fuso, ajuste `createdAt` das seeds para horários que caiam no dia civil `America/Sao_Paulo` desejado (ex.: `2026-11-22T15:00:00.000Z` = 12:00 em SP).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/nfse/list.ts apps/api/src/app.ts
git commit -m "Lista a NFS-e com busca, ordenação e filtro, para a consulta sair da ordem e entrar no módulo."
```

---

### Task 3: Cliente da UI

**Files:**
- Create: `apps/ui/src/services/nfse.ts`

- [ ] **Step 1: Criar o serviço**

```ts
import { apiFetch } from './apiClient';

export type NfseListStatus = 'pending' | 'authorized' | 'rejected' | 'canceled';

export type NfseListSortField =
  | 'dpsNumber'
  | 'series'
  | 'status'
  | 'createdAt'
  | 'customerName'
  | 'serviceAmount'
  | 'accessKey';

export type NfseListItem = {
  id: string;
  dpsNumber: number | null;
  series: string | null;
  status: NfseListStatus;
  createdAt: string;
  customerName: string;
  serviceAmount: number;
  accessKey: string | null;
};

export type NfseListFilter = {
  page?: number;
  limit?: number;
  q?: string;
  status?: NfseListStatus;
  issuedFrom?: string;
  issuedTo?: string;
  sortField?: NfseListSortField;
  sortOrder?: 'asc' | 'desc';
};

export type NfseListPage = {
  data: NfseListItem[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};

export const nfseStatusLabel: Record<NfseListStatus, string> = {
  pending: 'Pendente',
  authorized: 'Autorizada',
  rejected: 'Recusada',
  canceled: 'Cancelada',
};

function buildQuery(filter: NfseListFilter) {
  const params = new URLSearchParams();
  if (filter.page && filter.page > 1) params.set('page', String(filter.page));
  if (filter.limit && filter.limit !== 10) params.set('limit', String(filter.limit));
  if (filter.q) params.set('q', filter.q);
  if (filter.status) params.set('status', filter.status);
  if (filter.issuedFrom) params.set('issuedFrom', filter.issuedFrom);
  if (filter.issuedTo) params.set('issuedTo', filter.issuedTo);
  if (filter.sortField && filter.sortField !== 'dpsNumber') {
    params.set('sortField', filter.sortField);
  }
  if (filter.sortOrder && filter.sortOrder !== 'asc') {
    params.set('sortOrder', filter.sortOrder);
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

export const nfseService = {
  list: async (filter: NfseListFilter = {}): Promise<NfseListPage> => {
    const res = await apiFetch(`/nfse${buildQuery(filter)}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body.message || body.error || 'Falha ao carregar a NFS-e.');
    }
    return body as NfseListPage;
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add apps/ui/src/services/nfse.ts
git commit -m "Adiciona o cliente da lista de NFS-e, para a UI consultar o novo endpoint."
```

---

### Task 4: Tela `ListNfse`

**Files:**
- Create: `apps/ui/src/components/Nfse/nfseTone.ts`
- Create: `apps/ui/src/components/Nfse/ListNfse.tsx`

- [ ] **Step 1: Tons de status**

`apps/ui/src/components/Nfse/nfseTone.ts`:

```ts
import { type StatusTone } from '@/components/ui/statusTone';
import { type NfseListStatus } from '@/services/nfse';

export const nfseStatusTone: Record<NfseListStatus, StatusTone> = {
  pending: {
    background: '#EFF6FF',
    hover: '#DBEAFE',
    border: '#2563EB',
    text: '#1D4ED8',
  },
  authorized: {
    background: '#ECFDF5',
    hover: '#D1FAE5',
    border: '#059669',
    text: '#047857',
  },
  rejected: {
    background: '#FEF2F2',
    hover: '#FEE2E2',
    border: '#DC2626',
    text: '#B91C1C',
  },
  canceled: {
    background: '#F8FAFC',
    hover: '#F1F5F9',
    border: '#64748B',
    text: '#475569',
  },
};
```

- [ ] **Step 2: Lista**

Criar `apps/ui/src/components/Nfse/ListNfse.tsx` no espírito de `ListInbounds` / `PayableList`:

- `ListPageHeader` título **NFS-e**, descrição: consulta dos pedidos; sem botão de nova nota.
- `ListPanel` título **Notas**.
- Atalhos **Hoje** e **Este mês** só preenchem `issuedFrom`/`issuedTo` (use helpers de data civil SP se já existirem em inbound; senão copie `todayInSaoPaulo` / `monthRange` de `inboundQuery.ts` para um helper local mínimo, ou importe de lá se forem exportados).
- `ListSearch` placeholder `DPS, série, cliente ou chave`, query `q`.
- `ListFilter` de status com `nfseStatusLabel`.
- Dois `Input type="date"` para emissão de/até (`issuedFrom`, `issuedTo`).
- Colunas: DPS | NFS-e/Série | Status | Emissão | Cliente | Total | Chave.
- Cabeçalhos ordenáveis (`sortField` / `sortOrder` na URL). Padrão DPS asc: omitir params default como em pagar.
- Linha **sem** `onClick` de navegação.
- NFS-e/Série: `row.status === 'authorized' ? row.series : '—'`.
- DPS: `row.dpsNumber ?? '—'`.
- Emissão: formatar `createdAt` com `Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' })`.
- Total: `formatCurrency(row.serviceAmount)`.
- Chave: `…` + últimos 8; `title` com chave completa; clique copia (`navigator.clipboard.writeText`) e `toast.success`; sem navegar (`data-row-ignore` / `stopPropagation` se a linha tiver handler futuro).
- `ListPagination` com `meta`.
- `useDebouncedSearch` 400 ms.
- Query key `['nfse', filter]`, `keepPreviousData`.

Grid sugerido:

```ts
const columns =
  'grid grid-cols-[88px_110px_120px_110px_minmax(160px,1.4fr)_110px_minmax(120px,1fr)]';
```

Use `StatusListHeader` / `StatusListRow` + `statusToneStyle(nfseStatusTone[row.status])` como Entradas/OS.

- [ ] **Step 3: Conferência manual rápida**

Com `pnpm dev` rodando: abrir `/nfse` logado. Expected: lista carrega (vazia ou com dados), filtros na URL, Enter/ordenação não quebram.

- [ ] **Step 4: Commit**

```bash
git add apps/ui/src/components/Nfse/nfseTone.ts apps/ui/src/components/Nfse/ListNfse.tsx
git commit -m "Mostra a lista de NFS-e, para consultar pedidos com busca, ordenação e filtro sem abrir detalhe."
```

---

### Task 5: Menu e rota

**Files:**
- Modify: `apps/ui/src/components/AppSidebar.tsx`
- Modify: `apps/ui/src/App.tsx`

- [ ] **Step 1: Item de menu**

Em `AppSidebar.tsx`, importar um ícone adequado (ex.: `FileSpreadsheet` ou `Receipt` de `lucide-react`) e, **logo após** Ordens de serviço:

```ts
{ title: 'NFS-e', icon: FileSpreadsheet, url: '/nfse' },
```

- [ ] **Step 2: Rota e hash**

Em `App.tsx`:

```ts
import { ListNfse } from './components/Nfse/ListNfse';
```

No mapa de hash legado:

```ts
'#nfse': '/nfse',
```

Na árvore de rotas autenticadas, perto de service-orders:

```tsx
<Route
  path="/nfse"
  element={
    <Pagina>
      <ListNfse />
    </Pagina>
  }
/>
```

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/components/AppSidebar.tsx apps/ui/src/App.tsx
git commit -m "Inclui a NFS-e no menu e na rota, para a consulta ficar ao lado das ordens de serviço."
```

---

### Task 6: Verificação final

- [ ] **Step 1: Rodar o teste de lista**

```bash
pnpm exec tsx --import tsx --test test/nfse-list.integration.test.ts
```

Working directory: `apps/api`. Expected: PASS.

- [ ] **Step 2: Checagem visual**

Abrir `/nfse`: menu ativo, colunas na ordem da spec, atalhos Hoje/Este mês, status e intervalo, busca e sort. Linha não navega. Série só em Autorizada.

- [ ] **Step 3: Se houver ajuste residual, commitar**

Mensagem no estilo do repositório, só se existir diff.

---

## Spec coverage checklist

| Spec | Task |
|---|---|
| `GET /nfse` + paginação | 1–2 |
| Busca DPS/série/cliente/chave | 1–2 |
| Filtro status + intervalo `createdAt` | 1–2, 4 |
| Ordenação qualquer coluna, default DPS | 1–2, 4 |
| Colunas e regras de exibição | 4 |
| Menu primeiro nível + `/nfse` | 5 |
| Sem detalhe / sem pedir-enviar | 4–5 (sem links) |
| Padrão visual Entradas | 4 |
| Teste integração | 1, 6 |
