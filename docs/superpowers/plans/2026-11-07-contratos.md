# Contratos — plano de implementação (entrega 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A empresa cadastra o contrato, vê a série de vencimentos e vincula uma ordem do tipo Contrato a um contrato vigente do mesmo cliente.

**Architecture:** O schema mora em `@erp-360/mod-contracts`. A série de vencimentos mora em `@erp-360/shared`, para a ficha calcular a mesma lista que a API grava na leitura. A API numera, valida situação e cobrança, e grava o histórico na mesma transação. A ordem só ganha `contract_id`. Esta entrega não cria título.

**Tech Stack:** pnpm, Drizzle, Fastify, Zod, React Router, React Query, Tailwind.

**Spec:** `docs/superpowers/specs/2026-11-07-contratos-e-ordem-de-servico.md`

---

## Leitura fechada

Estes pontos fecham o que a spec deixa para o código decidir. A implementação segue esta leitura.

- A máscara do número tem pelo menos seis dígitos, em grupos de três: `1` vira `000.001`. Depois de `999.999` continua, como a ordem: `1.000.000`. O contador não reaproveita número.
- `contractBillingSchedule` devolve a série inteira quando há fim. Sem fim, devolve só o período mais antigo cuja `competence` não está em `billedCompetences`; lista vazia significa o primeiro período. Cada parcela traz `competence` (`YYYY-MM-01`, dia 1 do mês inicial do período) e `dueOn`. Sem cobrança, a série é vazia. A parcela não é gravada nesta entrega. Um vencimento é passado quando `dueOn` é anterior a hoje. A fila não começa no mês corrente e não pula esses vencimentos.
- Uma gravação produz no máximo uma linha `status` e no máximo uma linha `billing`. Valor e dia mudados juntos geram uma linha só. A linha guarda a cobrança depois da gravação e a situação anterior e a nova. A abertura é a linha `status` com `from_status` nulo e `to_status = draft`.
- Rascunho edita cliente, título, datas, cobrança, periodicidade, competência, forma e observação. Vigente e Suspenso editam título, fim da vigência, observação, valor do período e dia. Cliente, início, número, periodicidade, competência e forma não mudam depois da ativação.
- Encerrado e Cancelado recusam corpo diferente do que está gravado. Corpo idêntico devolve o contrato e não grava evento.
- Retomar limpa o motivo. O motivo só fica gravado enquanto a situação resultante é Suspenso. `closed_on` só existe em Encerrado e é preenchido pelo servidor com a data civil de hoje.
- Hoje, no encerramento e no aviso de vigência vencida, sai de `civilDate` com o fuso da cidade da empresa. Sem cidade ou com fuso inválido, `America/Sao_Paulo`, no mesmo gesto de `print-model.ts`.
- A forma, quando vem, é da empresa, está ativa, tem `useInServiceOrder` e o `receipt_kind` não é `store_credit`. O contrato guarda só `payment_method_id`. Não copia condição nem parcelas.
- Cliente na criação e no rascunho é pessoa ativa com `isClient`. Depois da ativação a pessoa pode deixar de ser cliente ativo e o vínculo permanece.
- Encurtar a vigência chama `assertTermKeepsBilledPeriods`. Nesta entrega a lista de competências já cobradas vai vazia. Fim nulo passa, mesmo com competências: apagar o fim não deixa período de fora. Um fim preenchido recusa quando alguma competência cair fora dele, para a entrega 2 passar a lista real.
- A lista de contratos aceita `q`, `status` e `personId`. A ordem usa `personId` com `status=active`.
- No comprovante, o número do contrato entra na célula do tipo, na linha de baixo, no mesmo lugar em que a origem aparece. O rótulo continua "Contrato". Não entra na aba dos onze campos.
- Ordem Entregue ou Cancelada compara `contractId` dentro de `sameExceptInternalNotes`. Trocar o vínculo responde a mesma recusa da nota interna.

## Arquivos

- Criar `packages/modules/contracts/` no molde de `packages/modules/service-orders`: `package.json`, `tsconfig.json`, `eslint.config.js`, `src/index.ts`, `src/db/contracts.ts`.
- Dependências do pacote: `@erp-360/mod-core`, `@erp-360/mod-persons`, `@erp-360/mod-financial`, `drizzle-orm`.
- Acrescentar `@erp-360/mod-contracts` em `packages/modules/service-orders/package.json` e em `apps/api/package.json`.
- Acrescentar o spread do schema em `apps/api/src/db/index.ts`.
- Modificar `packages/modules/service-orders/src/db/service-orders.ts`: coluna `contract_id`.
- Criar `packages/shared/src/utils/contractBilling.ts` e exportar em `packages/shared/src/index.ts`.
- Criar `apps/api/src/modules/contracts/rules.ts` e `contracts.ts`.
- Criar `apps/api/test/contract-rules.test.ts` e `apps/api/test/contract.integration.test.ts`.
- Modificar `apps/api/src/modules/service-orders/rules.ts`, `orders.ts` e `print-model.ts`.
- Modificar `apps/api/test/service-order-rules.test.ts` e `apps/api/test/service-order.integration.test.ts`.
- Modificar `apps/ui/src/components/ServiceOrders/serviceOrderDocument.ts` e `serviceOrderDocument.test.ts`.
- Registrar os testes novos em `apps/api/scripts/run-tests.ts`.
- Registrar rotas em `apps/api/src/app.ts`: `/contracts`.
- Criar `apps/ui/src/services/contracts.ts`.
- Criar `apps/ui/src/components/Contracts/ListContracts.tsx` e `FormContract.tsx`.
- Modificar `apps/ui/src/App.tsx`, `apps/ui/src/components/AppSidebar.tsx` e `apps/ui/src/components/ServiceOrders/FormServiceOrder.tsx`.

Os commits seguem o estilo do repositório: uma frase em português dizendo por que a mudança existe. Não usar Conventional Commits.

Comandos, a partir da raiz:

```powershell
pnpm install
pnpm --dir apps/api test
pnpm --dir apps/api db:generate
pnpm --dir apps/api db:migrate
```

`pnpm --dir apps/api test` prepara o banco `erp360_test`. Não definir `DATABASE_NAME` antes de `pnpm db:migrate`, para a migração de desenvolvimento continuar em `erp360_db`.

---

### Task 1: Pacote e tabelas

**Files:**
- Create: `packages/modules/contracts/**`
- Modify: `packages/modules/service-orders/package.json`
- Modify: `packages/modules/service-orders/src/db/service-orders.ts`
- Modify: `apps/api/package.json`
- Modify: `apps/api/src/db/index.ts`

- [ ] **Step 1: Criar o pacote**

Copiar `package.json`, `tsconfig.json` e `eslint.config.js` de `packages/modules/service-orders`. O nome é `@erp-360/mod-contracts`. `src/index.ts` reexporta `./db/contracts.ts`.

Dependências: `@erp-360/mod-core`, `@erp-360/mod-persons`, `@erp-360/mod-financial`, `drizzle-orm`. O pacote não importa `@erp-360/mod-service-orders`.

`@erp-360/mod-service-orders` passa a depender de `@erp-360/mod-contracts`.

- [ ] **Step 2: Declarar enums, contador, contrato e histórico**

Enums:

- `contract_status`: `draft`, `active`, `suspended`, `closed`, `cancelled`
- `contract_billing_kind`: `none`, `monthly`, `quarterly`, `semiannual`, `annual`
- `contract_billing_competence`: `current`, `previous`
- `contract_event_kind`: `status`, `billing`

Exportar os valores como `contractStatuses`, `contractBillingKinds`, `contractBillingCompetences` e `contractEventKinds`.

`contract_counters`: `tenant_id` chave primária, `last_number` inteiro, default 0, check `>= 0`. Apagar a empresa apaga o contador. Igual a `service_order_counters`.

`contracts`:

| Coluna | Tipo |
|---|---|
| `id` | uuid |
| `tenant_id` | `tenantColumns` |
| `number` | integer, maior que zero, único por empresa |
| `person_id` | uuid |
| `title` | varchar(120), texto depois do trim |
| `status` | enum, default `draft` |
| `started_on` | date |
| `ended_on` | date, nulo |
| `billing_kind` | enum, default `none` |
| `billing_competence` | enum, nulo |
| `period_amount` | integer, default 0 |
| `due_day` | smallint, nulo |
| `payment_method_id` | uuid, nulo |
| `notes` | text, default `''` |
| `suspension_reason` | varchar(200), nulo |
| `closed_on` | date, nulo |
| `created_at` | timestamp, default now |

Chaves: único `(id, tenant_id)` e `(tenant_id, number)`. Compostas, `onDelete: 'restrict'`, para `persons` e `payment_methods`. As duas já têm único `(id, tenant_id)`.

Checks:

- cobrança `none`: valor 0, dia nulo, competência nula
- cobrança recorrente: valor maior que zero, dia de 1 a 28, fim preenchido, competência preenchida
- `ended_on` nulo ou `ended_on >= started_on`
- suspenso exige motivo com texto; as outras situações exigem motivo nulo
- encerrado exige `closed_on`; as outras situações exigem `closed_on` nulo
- título com texto

`contract_events`:

| Coluna | Tipo |
|---|---|
| `id` | uuid |
| `tenant_id` | `tenantColumns` |
| `contract_id` | uuid |
| `kind` | enum |
| `from_status` | enum, nulo |
| `to_status` | enum |
| `billing_kind` | enum |
| `billing_competence` | enum, nulo |
| `period_amount` | integer, `>= 0` |
| `due_day` | smallint, nulo ou de 1 a 28 |
| `reason` | varchar(200), nulo |
| `actor_user_id` | uuid |
| `created_at` | timestamp, default now |

Único `(id, tenant_id)`. Chave `(contract_id, tenant_id)` para `contracts`, `onDelete: 'cascade'`. Chave `(actor_user_id, tenant_id)` para `users`, `onDelete: 'restrict'`. O cascade só acompanha a exclusão da empresa. Nenhuma rota apaga evento.

Check: `from_status` nulo somente quando `kind = status` e `to_status = draft`.

- [ ] **Step 3: Acrescentar o vínculo na ordem**

Em `service_orders`, `contract_id` uuid nulo. Chave `(contract_id, tenant_id)` para `contracts`, `onDelete: 'restrict'`.

Check: `contract_id` nulo ou `attendance = 'contract'`.

- [ ] **Step 4: Registrar o schema no app**

`apps/api/package.json` depende do pacote. `apps/api/src/db/index.ts` faz spread dele no objeto `schema`, junto dos outros módulos.

Na raiz, `pnpm install` atualiza o lockfile.

- [ ] **Step 5: Commit**

```powershell
git add packages/modules/contracts packages/modules/service-orders apps/api/package.json apps/api/src/db/index.ts pnpm-lock.yaml
git commit -m "Reserva as tabelas do contrato e a chave na ordem."
```

---

### Task 2: Migração

**Files:**
- Create: `apps/api/src/db/migrations/<gerada>.sql`

- [ ] **Step 1: Gerar e aplicar**

```powershell
pnpm --dir apps/api db:generate
pnpm --dir apps/api db:migrate
```

Expected: um SQL novo com os quatro enums, `contract_counters`, `contracts`, `contract_events`, a coluna `service_orders.contract_id` e as chaves. `db:migrate` termina sem erro em `erp360_db`. Nenhuma tabela `contract_billings` e nenhuma coluna em `receivables`.

- [ ] **Step 2: Commit**

```powershell
git add apps/api/src/db/migrations
git commit -m "Cria as tabelas do contrato."
```

---

### Task 3: Série, situação e cobrança

**Files:**
- Create: `packages/shared/src/utils/contractBilling.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `apps/api/src/modules/contracts/rules.ts`
- Test: `apps/api/test/contract-rules.test.ts`
- Modify: `apps/api/src/modules/service-orders/rules.ts`
- Modify: `apps/api/test/service-order-rules.test.ts`
- Modify: `apps/api/scripts/run-tests.ts`

- [ ] **Step 1: Escrever os testes que falham**

Registrar `test/contract-rules.test.ts` em `run-tests.ts`.

`contractBillingSchedule` recebe início, fim, periodicidade, competência e dia, e uma lista opcional de competências já cobradas. As datas são `YYYY-MM-DD`. O primeiro período começa no mês de `startedOn`. O seguinte começa depois dos meses da periodicidade: 1, 3, 6 ou 12. Com fim, entra o período cujo mês inicial é o mês do início ou posterior, e o mês do fim ou anterior. Sem fim, devolve uma parcela: a primeira `competence` que não está na lista já cobrada.

Competência Atual vence no `dueDay` do primeiro mês do período. Anterior vence no `dueDay` do mês seguinte ao último mês do período. `competence` é o dia 1 do mês inicial.

Contrato de `2026-11-01` a `2026-10-31`, dia 20, confere a spec:

| Periodicidade | Competência | `dueOn` |
|---|---|---|
| `monthly` | `current` | `2026-11-20` … `2027-10-20`, doze datas |
| `monthly` | `previous` | `2026-12-20` … `2027-11-20`, doze datas |
| `quarterly` | `current` | `2026-11-20`, `2027-02-20`, `2027-05-20`, `2027-08-20` |
| `quarterly` | `previous` | `2027-02-20`, `2027-05-20`, `2027-08-20`, `2027-11-20` |
| `semiannual` | `current` | `2026-11-20`, `2027-05-20` |
| `semiannual` | `previous` | `2027-05-20`, `2027-11-20` |
| `annual` | `current` | `2026-11-20` |
| `annual` | `previous` | `2027-11-20` |

A primeira `competence` de cada uma dessas séries é `2026-11-01`. Na trimestral atual, a segunda é `2027-02-01`.

De `2026-11-15` a `2026-11-20`, mensal, dia 20: uma parcela, `competence` `2026-11-01`. Atual vence `2026-11-20`. Anterior vence `2026-12-20`.

`formatContractNumber(1)` é `000.001`. `formatContractNumber(1_000_000)` é `1.000.000`.

`assertTransition`: Rascunho segue para Vigente e Cancelado. Vigente segue para Suspenso e Encerrado. Suspenso segue para Vigente e Encerrado. Encerrado e Cancelado recusam qualquer saída. A mesma situação passa.

`assertBilling` aceita `none` com valor 0, dia nulo, competência nula e fim nulo. Aceita `monthly` com valor positivo, dia 20, competência `current` e fim igual ou posterior ao início, e também com fim nulo. Recusa mensal sem dia ou sem competência, dia 29, valor 0, e `none` com valor positivo.

`assertTermKeepsBilledPeriods('2026-10-31', ['2026-11-01'])` recusa. `assertTermKeepsBilledPeriods('2026-11-30', ['2026-11-01'])` passa. Fim nulo passa com ou sem competências. Lista vazia passa, com ou sem fim.

Sem fim, mensal atual, dia 20, início `2026-11-01` e sem competência cobrada, devolve `competence` `2026-11-01` e `dueOn` `2026-11-20`. Com `billedCompetences` `2026-11-01` e `2026-12-01`, devolve `2027-01-01` e `2027-01-20`. Trimestral anterior, sem fim e sem competência cobrada, vence `2027-02-20`.

`termExpired('active', '2026-10-31', '2026-11-07')` é verdadeiro. Suspenso com fim anterior a hoje também. Vigente com fim hoje ou futuro é falso. Fim nulo é falso. Encerrado com fim anterior é falso.

`assertMutable` recusa, quando a situação gravada não é Rascunho, troca de cliente, início, periodicidade, competência ou forma. Aceita troca de título, fim, observação, valor e dia. Encerrado e Cancelado recusam qualquer diferença. Corpo idêntico passa.

`assertContractLink`, em `service-orders/rules.ts`: tipo Contrato sem contrato recusa. Outro tipo com contrato recusa. Tipo Contrato com contrato passa. Avulso sem contrato passa.

As recusas lançam `Error` com `status` 400, no mesmo gesto de `assertTransition` da ordem. Mensagens:

- situação: `Esta situação não pode seguir para a escolhida.`
- recorrente incompleta: `A cobrança recorrente precisa de valor, dia e competência.`
- sem cobrança com valor, dia ou competência: `Contrato sem cobrança não leva valor, dia nem competência.`
- fim anterior ao início: `O fim da vigência não pode ser anterior ao início.`
- dia fora de 1 a 28: `O dia de vencimento vai de 1 a 28.`
- período já cobrado: `A vigência não pode deixar de fora um período que já tem título.`
- campo congelado: `Cliente, início, periodicidade, competência e forma não mudam depois da ativação.`
- encerrado: `Contrato encerrado ou cancelado não pode ser alterado.`
- ordem sem contrato: `A ordem de contrato precisa de um contrato.`
- ordem com contrato indevido: `Só o tipo Contrato aponta um contrato.`

- [ ] **Step 2: Rodar e ver falhar**

```powershell
pnpm --dir apps/api test
```

Expected: falha ao importar `contractBilling.ts` ou `rules.ts`.

- [ ] **Step 3: Implementar**

A soma de meses usa data UTC, no mesmo cuidado de `shiftMonth` em `packages/shared/src/utils/paymentPlan.ts`: mês inicial, soma o intervalo, e o dia do vencimento é o `dueDay` já validado. Não usar `Date` local.

`formatContractNumber` faz `padStart(6, '0')` quando couber em seis dígitos e insere o ponto a cada três a partir da direita.

`assertTransition` usa um mapa constante, uma lista de destinos por situação. A mesma situação retorna.

`assertBilling` olha o conjunto e não exige fim na recorrente. `assertMutable` compara o gravado com o corpo e, fora do rascunho, só deixa passar título, fim, observação, valor, dia e a situação. `assertTermKeepsBilledPeriods` retorna quando o fim é nulo. Com fim, compara o mês da competência com o mês do fim.

`assertContractLink` fica ao lado de `assertOrigin`.

- [ ] **Step 4: Rodar e ver passar**

```powershell
pnpm --dir apps/api test
```

Expected: os dois arquivos passam e a suíte anterior continua passando.

- [ ] **Step 5: Commit**

```powershell
git add packages/shared/src/utils/contractBilling.ts packages/shared/src/index.ts apps/api/src/modules/contracts/rules.ts apps/api/src/modules/service-orders/rules.ts apps/api/test/contract-rules.test.ts apps/api/test/service-order-rules.test.ts apps/api/scripts/run-tests.ts
git commit -m "Fixa a série de vencimentos e as situações do contrato antes de gravar."
```

---

### Task 4: Cadastro do contrato

**Files:**
- Create: `apps/api/src/modules/contracts/contracts.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/test/contract.integration.test.ts`
- Modify: `apps/api/scripts/run-tests.ts`

- [ ] **Step 1: Escrever o teste de integração que falha**

Usar `createCompany` de `apps/api/test/fixtures.ts`. A pessoa devolvida já é cliente. Registrar o arquivo em `run-tests.ts`.

Cobrir:

- Dois contratos seguidos recebem `000.001` e `000.002`. Cancelar o primeiro e abrir o terceiro entrega `000.003`.
- A abertura grava Rascunho e uma linha `status` com `from_status` nulo, `to_status` `draft` e o usuário da sessão.
- Pessoa inativa, pessoa sem `isClient`, ou pessoa de outra empresa responde 400.
- Mensal sem fim, início `2024-01-15`, grava, `termExpired` vem falso e a série traz só `competence` `2024-01-01` e `dueOn` `2024-01-20`. `none` com valor responde 400. `none` sem fim grava e a série vem vazia.
- Apagar o fim de um mensal de `2026-11-01` a `2027-10-31` e ativar devolve só `2026-11-20`.
- Ativar mensal de `2026-11-01` a `2027-10-31`, dia 20, competência `current`, devolve doze vencimentos, o primeiro em `2026-11-20` e o último em `2027-10-20`.
- No rascunho, trocar de mensal atual para trimestral anterior grava uma linha `billing` e a série passa a ser `2027-02-20`, `2027-05-20`, `2027-08-20`, `2027-11-20`.
- Vigente recusa troca de cliente, início, periodicidade, competência e forma. Aceita título, observação, valor e dia, e a troca de valor grava uma linha `billing` com o valor novo. O valor anterior permanece na linha de ativação.
- Suspender sem motivo responde 400. Suspender com motivo grava o motivo e uma linha `status`. Retomar limpa o motivo.
- Encerrar com fim futuro conserva o fim, grava `closed_on` com a data civil de hoje e passa a Encerrado. Encerrar um contrato sem cobrança e sem fim preenche `ended_on` com essa mesma data.
- Encerrado e Cancelado recusam título e valor. O detalhe devolve o histórico do mais recente para o mais antigo.
- Vigente com `ended_on` anterior a hoje volta `termExpired: true` e continua `active`.
- A lista, com busca `000.001` e com busca `1`, encontra o primeiro. A busca também casa título e nome do cliente. O filtro `status` e o filtro `personId` restringem.

Inserir `payment_methods` ativo com `useInServiceOrder`, como o teste da ordem. Não criar `payment_method_terms`. Forma inativa, forma sem `useInServiceOrder` e `store_credit` respondem 400 no rascunho.

- [ ] **Step 2: Rodar e ver falhar**

```powershell
pnpm --dir apps/api test
```

- [ ] **Step 3: Implementar a gravação**

Rotas, todas com `autenticarETenant` e prefixo `/contracts`:

| Método | Caminho | Papel |
|---|---|---|
| `GET` | `/` | Lista. Query `q`, `status`, `personId`. |
| `POST` | `/` | Abre o rascunho. |
| `GET` | `/:id` | Detalhe, com série, histórico e ordens. |
| `PUT` | `/:id` | Salva e, quando a situação muda, transiciona. |

O corpo leva cliente, título, início, fim, periodicidade, competência, valor em centavos, dia, forma e observação. O `PUT` leva também a situação e o motivo. Número, `closed_on` e o histórico não vêm no corpo.

`POST` trava o contador com `INSERT` do zero quando falta a linha e `UPDATE contract_counters SET last_number = last_number + 1 WHERE tenant_id = $1 RETURNING last_number`. Na mesma transação insere o contrato em `draft` e a linha de abertura. `actor_user_id` é `request.user.userId`.

`PUT` carrega o contrato da empresa. Fora de Encerrado e Cancelado, roda `assertBilling`, `assertMutable` e `assertTermKeepsBilledPeriods` com lista vazia. Situação diferente chama `assertTransition`. Suspender exige motivo com texto, até 200 caracteres. A situação resultante Suspenso grava o motivo; qualquer outra limpa. A transição para Encerrado grava `closed_on` com `civilDate` no fuso da empresa e, se `ended_on` estiver vazio, grava esse fim com a mesma data. Fim já preenchido permanece.

A mesma transação atualiza o contrato, insere a linha `status` quando a situação mudou e insere a linha `billing` quando valor, dia, periodicidade ou competência mudaram. As duas linhas levam a cobrança já atualizada.

Cliente, no rascunho, é pessoa da empresa, ativa, com `isClient`. Forma, quando vem e a situação gravada ainda é Rascunho, segue a leitura fechada. Forma de outra empresa responde 400.

A lista faz `ilike` no título e no nome da pessoa. Se `q`, sem pontuação, for só dígito, também compara com `number`. Situação e `personId`, quando vêm, filtram. Ordem de `number` descendente. Cada linha traz `numberLabel`, o nome do cliente e `termExpired`.

O detalhe acrescenta a série, os eventos com nome do usuário e as ordens que apontam o contrato: `id`, `number`, `numberLabel`, `status`, `totalAmount`, por `number` descendente. A série usa `contractBillingSchedule`. Sem cobrança, vem vazia.

Erros de regra saem com status 400 e mensagem em português. O handler já entende `error.status`.

- [ ] **Step 4: Rodar e ver passar**

```powershell
pnpm --dir apps/api test
```

- [ ] **Step 5: Commit**

```powershell
git add apps/api/src/modules/contracts/contracts.ts apps/api/src/app.ts apps/api/test/contract.integration.test.ts apps/api/scripts/run-tests.ts
git commit -m "Abre, numera e encerra o contrato sem reaproveitar número."
```

---

### Task 5: Vínculo na ordem e no comprovante

**Files:**
- Modify: `apps/api/src/modules/service-orders/orders.ts`
- Modify: `apps/api/src/modules/service-orders/print-model.ts`
- Modify: `apps/api/test/service-order.integration.test.ts`
- Modify: `apps/ui/src/components/ServiceOrders/serviceOrderDocument.ts`
- Modify: `apps/ui/src/components/ServiceOrders/serviceOrderDocument.test.ts`

- [ ] **Step 1: Acrescentar os testes que falham**

No teste de integração da ordem:

- Abrir com atendimento `contract` e sem `contractId` responde 400.
- Avulso com `contractId` responde 400.
- Contrato vigente do mesmo cliente grava o vínculo. O detalhe devolve `contractId` e `contractNumberLabel` `000.001`.
- Contrato de outro cliente, contrato que ainda é rascunho, ou contrato de outra empresa responde 400 na escolha.
- Ordem já vinculada continua salvando item e total depois que o contrato é suspenso. Trocar para outro contrato exige um vigente do mesmo cliente. Trocar o cliente e manter o contrato responde 400.
- Sair do tipo Contrato limpando `contractId` passa. Entregue ou Cancelada que mude `contractId` responde 400.
- `GET /service-orders/:id/print` de uma ordem vinculada traz `contractNumber` `000.001`. Sem vínculo, o campo vem nulo.

O teste do documento, com `contractNumber: '000.001'` e `attendanceLabel: 'Contrato'`, contém as duas linhas na célula do tipo. Sem `contractNumber`, a folha não ganha um número de contrato.

O teste de integração cria o contrato pela rota da Task 4, vigente, do cliente da ordem.

- [ ] **Step 2: Rodar e ver falhar**

```powershell
pnpm --dir apps/api test
```

- [ ] **Step 3: Gravar o vínculo e imprimir o número**

`POST` e `PUT` aceitam `contractId` uuid ou nulo. `assertContractLink` roda junto de `assertOrigin`.

Na escolha — criação, ou `contractId` diferente do gravado — o contrato é da empresa, a situação é `active` e `person_id` é o cliente da ordem. Fora isso, 400 com `Escolha um contrato vigente deste cliente.` O mesmo `contractId` não exige situação vigente.

`sameExceptInternalNotes` compara `contractId`. O detalhe e a lista da ordem devolvem `contractId`. O detalhe devolve também `contractNumberLabel`.

`buildServiceOrderPrint` lê o contrato quando há vínculo e preenche `contractNumber` com `formatContractNumber`. Sem vínculo, `null`.

`serviceOrderDocument` imprime o número na linha de baixo do tipo quando `contractNumber` existe, no mesmo bloco em que `originNumber` já entra.

- [ ] **Step 4: Rodar e ver passar**

```powershell
pnpm --dir apps/api test
```

- [ ] **Step 5: Commit**

```powershell
git add apps/api/src/modules/service-orders/orders.ts apps/api/src/modules/service-orders/print-model.ts apps/api/test/service-order.integration.test.ts apps/ui/src/components/ServiceOrders/serviceOrderDocument.ts apps/ui/src/components/ServiceOrders/serviceOrderDocument.test.ts
git commit -m "Liga a ordem do tipo Contrato a um contrato vigente e imprime o número."
```

---

### Task 6: Lista e ficha

**Files:**
- Create: `apps/ui/src/services/contracts.ts`
- Create: `apps/ui/src/components/Contracts/ListContracts.tsx`
- Create: `apps/ui/src/components/Contracts/FormContract.tsx`
- Modify: `apps/ui/src/App.tsx`
- Modify: `apps/ui/src/components/AppSidebar.tsx`

- [ ] **Step 1: Rotas e menu**

Menu "Contratos", ícone `ScrollText`, logo abaixo de "Ordens de serviço". Rota `/contracts`. Ficha em `/contracts/new` e `/contracts/:id`. As três rotas entram em `AreaLogada`, dentro de `Pagina`. O hash `#contracts` cai na lista.

O item ativo do menu trata `/contracts` como `/service-orders`: a lista e a ficha acendem o mesmo item.

- [ ] **Step 2: Lista**

Colunas: número formatado, cliente, título, situação, vigência e a cobrança. A cobrança mostra "Sem cobrança" ou o valor com a periodicidade: Mensal, Trimestral, Semestral, Anual. Sem fim, a vigência mostra o início seguido de "indeterminado". Vigência vencida aparece na linha quando `termExpired` vem verdadeiro. A mais recente primeiro. Busca e filtro de situação disparam `q` e `status`. Linha vazia explica que ainda não há contrato.

Rótulos: Rascunho, Vigente, Suspenso, Encerrado, Cancelado.

- [ ] **Step 3: Ficha**

A ficha usa a página do formulário da ordem: seção em cartão, grade de doze colunas, `PersonSearchSelect` com `type="cliente"`.

Campos: título, início, fim, periodicidade, competência, valor do período, dia e forma. A forma vem de `GET /payment-methods?channel=serviceOrder&isActive=true`. Valor usa `formatCurrencyInput` e `parseCurrencyToCents`. Dia é inteiro de 1 a 28.

Periodicidade `none` esconde competência, valor, dia e forma, e o salvamento manda valor 0, dia nulo e competência nula. As outras periodicidades exigem competência Atual ou Anterior.

A série vem de `contractBillingSchedule` e aparece assim que início, periodicidade, competência e dia fecham uma cobrança válida. O fim é opcional. Abaixo dele, o texto "Em branco, o prazo fica indeterminado." Com fim, cada data sai em `dd/MM/yyyy`. Sem fim, a ficha mostra "Próximo vencimento" com essa data e "Sem data de fim, a cobrança segue um período por vez." Sem cobrança, a ficha diz "Sem cobrança". Salvar volta à lista.

Rascunho mostra Salvar, Ativar e Cancelar. Vigente mostra Salvar, Suspender e Encerrar. Suspenso mostra Salvar, Retomar e Encerrar. Suspender pede o motivo antes de enviar. Encerrado e Cancelado deixam os campos desabilitados.

O histórico fica na própria ficha, do mais recente para o mais antigo. Situação mostra a anterior e a nova. Abertura mostra só Rascunho. Cobrança mostra periodicidade, competência, valor e dia. Motivo aparece quando a linha traz um.

Abaixo do histórico, as ordens vinculadas mostram número, situação e total, e abrem `/service-orders/:id`. Sem ordem, a seção explica que nenhuma ordem aponta este contrato.

- [ ] **Step 4: Commit**

```powershell
git add apps/ui/src/services/contracts.ts apps/ui/src/components/Contracts apps/ui/src/App.tsx apps/ui/src/components/AppSidebar.tsx
git commit -m "Abre a lista e a ficha do contrato no layout do sistema."
```

---

### Task 7: Escolha na ordem e conferência na tela

**Files:**
- Modify: `apps/ui/src/components/ServiceOrders/FormServiceOrder.tsx`
- Modify: `apps/ui/src/services/serviceOrders.ts`

- [ ] **Step 1: Escolha do contrato**

O cliente HTTP da ordem envia e lê `contractId`. O detalhe também lê `contractNumberLabel`.

Com tipo Contrato, o formulário busca `GET /contracts?personId=&status=active`. Sem cliente, a escolha fica desabilitada. Trocar o cliente limpa o contrato quando ele não pertence ao cliente novo. Sair do tipo Contrato limpa `contractId`. Entrar no tipo Contrato limpa a ordem de origem.

A opção já gravada permanece na lista mesmo suspensa ou encerrada, com o `contractNumberLabel` do detalhe. Escolher outra continua restrita às vigentes.

Abaixo da escolha, o texto fixo: "A cobrança do período não abate os itens desta ordem."

- [ ] **Step 2: Conferir no navegador**

Com `pnpm dev` no ar, percorrer:

- O menu mostra Contratos abaixo de Ordens de serviço. A lista vazia explica que ainda não há contrato.
- Abrir um rascunho sem cobrança, com início e sem fim. O número sai `000.001`.
- Trocar para mensal, competência Atual, dia 20, vigência de 01/11/2026 a 31/10/2027. A série mostra doze vencimentos, de 20/11/2026 a 20/10/2027. Apagar o fim: a ficha mostra só o próximo vencimento, 20/11/2026, e o texto de um período por vez. A lista, depois de salvar, mostra o início seguido de "indeterminado". Ativar com o fim preenchido de novo.
- Trocar a competência para Anterior e ver a recusa. Trocar o valor e ver o histórico guardar o valor anterior e o novo.
- Suspender sem motivo é recusado. Suspender com motivo, retomar e ver o motivo sumir da ficha e permanecer no histórico.
- Encerrar. A ficha fica só leitura.
- Na ordem, sem cliente, a escolha do contrato fica desabilitada. Com o cliente do contrato vigente, o tipo Contrato lista esse contrato. Avulso não envia vínculo.
- Salvar a ordem vinculada, imprimir e ver "Contrato" com `000.001` na célula do tipo.
- Suspender o contrato e salvar de novo a mesma ordem, com o mesmo vínculo. Trocar para outro contrato que não está vigente é recusado.
- Entregar a ordem e confirmar que o vínculo não muda.
- A lista de contratos encontra `000.001` e `1`. Cancelar um rascunho não devolve o número ao contrato seguinte.
- A ficha do contrato lista a ordem vinculada, com número, situação e total.

- [ ] **Step 3: Commit**

```powershell
git add apps/ui/src/components/ServiceOrders/FormServiceOrder.tsx apps/ui/src/services/serviceOrders.ts
git commit -m "Escolhe o contrato vigente na ordem e deixa a cobrança do período fora dos itens."
```

---

## Fora deste plano

Gerar a conta a receber, `contract_billings`, repetir parcela, cobertura, franquia, marcador de linha coberta e qualquer mudança no total da ordem. O botão "Gerar próxima cobrança" não entra na ficha. Worker, proporcionalidade, reajuste, aditivo, assinatura e contrato de fornecedor continuam fora.
