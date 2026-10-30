# Ordem de serviço — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A empresa configura os onze campos e as cinco observações, abre uma ordem de um bem, lança produto e serviço, prevê o pagamento e imprime o comprovante na folha de `doc/templates/os.html`.

**Architecture:** O schema mora em `@erp-360/mod-service-orders`. A API grava, valida e monta o modelo já formatado. A tela de lista e o formulário usam o layout do sistema. O comprovante reaproveita o CSS de `doc/templates/os.html` e monta o corpo com os mesmos nomes de classe, porque a grade depende dos campos ativos. Estoque, nota e conta a receber ficam de fora. `planDocumentPayment` não roda nesta entrega: ela exige valor maior que zero e devolve títulos.

**Tech Stack:** pnpm, Drizzle, Fastify, Zod, React Router, React Query, Tailwind.

**Spec:** `docs/superpowers/specs/2026-10-27-ordem-de-servico.md`

---

## Leitura fechada

Estes pontos fecham o que a spec deixa para o código decidir. A implementação segue esta leitura.

- `tenants.logo`, `mobile_phone` e `whatsapp` já existem. Esta entrega não cria migração de emitente.
- `doc/templates/os.html` continua o mock com dados de exemplo. Não há segunda folha, tela estreita nem cupom. O CSS sai desse arquivo. O corpo do comprovante real é montado com as classes `os-container`, `grid-row`, `field-group`, `section-title` e as tabelas do mock.
- A célula esquerda do pagamento imprime `payment_methods.name`. A direita imprime “À vista” ou “Nx”. `meansDescription` viaja no modelo e não ganha uma segunda célula.
- Trocar a forma ou a quantidade numa ordem ainda aberta regrava a cópia. Editar o cadastro da forma não regrava ordem nenhuma.
- A cópia lê `payment_methods` e a linha de `payment_method_terms` da quantidade escolhida. Entram meio, parcelas, juros, taxas, carência, intervalo, recebimento, integração, credenciadora e bandeira. Juros não entram em `totalAmount`.
- O select lista forma ativa com `useInServiceOrder`. `store_credit` é recusado. Entregue exige forma mesmo com total zero.
- Ao entregar ou cancelar, os onze endereços gravam valor, rótulo, largura e ativo, com ou sem texto. O comprovante encerrado usa esse snapshot. Título da seção, títulos das tabelas e as duas assinaturas continuam lidos da aba, como a spec deixa.
- Salvar a aba com rótulo novo, havendo ordem aberta com valor naquele endereço, responde 409 `{ code: 'label_change', slots: ['field08'] }`. O cliente reenvia com `confirmLabelChange: true`. Valor em branco, só de espaço, não conta. Entregue e cancelada ficam de fora.
- Mudar texto, ativo ou rótulo na aba vale para a próxima abertura. A ordem já aberta conserva as cinco linhas que recebeu.
- Na abertura, linha ativa copia o texto e linha inativa copia vazio. As cinco ficam na ordem e podem ser editadas. Linha vazia não imprime.
- `openedByUserId` é o usuário da sessão e não muda. `promisedAt` é data e hora, opcional, no mesmo fuso de `openedAt`.
- `originOrderId` só em Garantia e Retrabalho, outra ordem da mesma empresa, nunca ela mesma. Sair desses tipos limpa a origem. Cancelada pode ser origem.
- Ordem entregue ou cancelada só aceita mudança em `internalNotes`. Não se apaga ordem. Pronta continua editável.
- O próximo número sai com `UPDATE ... RETURNING` na mesma transação da criação. A máscara agrupa de três em três, com pelo menos nove dígitos, e continua depois de `999.999.999`.
- A semente da assistência nasce em `getOrCreate`, na primeira leitura da aba ou na primeira ordem, para empresa nova e para as que já existem.
- A busca casa o número inteiro (`1` e `000.000.001` acham a ordem 1) e faz `ilike` no nome da cópia e no texto dos onze campos. A lista vem por `number` decrescente e aceita filtro de situação.
- Rótulo de campo ativo não fica em branco. `summarySlot` aponta para um campo ativo.

Cópia do cliente, gravada na escolha e editável depois. Trocar a pessoa regrava a cópia.

| Coluna | Origem |
|---|---|
| `customerName`, `customerTaxId` | `persons.name`, `persons.taxId` |
| `customerPhone`, `customerMobilePhone`, `customerWhatsapp`, `customerEmail` | Contato `Principal` |
| `customerStreetLine` | Logradouro, número, complemento e CEP do endereço `Principal` |
| `customerNeighborhood` | Bairro |
| `customerCityLine` | `cidade / UF` |

Sem endereço ou sem contato, a ordem abre com esses campos vazios.

## Arquivos

- Criar `packages/modules/service-orders/` no molde de `packages/modules/inbound`: `package.json`, `tsconfig.json`, `eslint.config.js`, `src/index.ts`, `src/db/service-orders.ts`.
- Dependências do pacote: `@erp-360/mod-core`, `@erp-360/mod-persons`, `@erp-360/mod-catalog`, `@erp-360/mod-financial`, `drizzle-orm`.
- Acrescentar `@erp-360/mod-service-orders` em `apps/api/package.json` e o spread do schema em `apps/api/src/db/index.ts`.
- Modificar `packages/modules/core/src/db/schema.ts`: único `(id, tenant_id)` em `users`, para a chave composta do atendente.
- Gerar a migração com `pnpm --dir apps/api db:generate`. O número seguinte ao último arquivo de `apps/api/src/db/migrations/` fica a cargo do drizzle-kit.
- Criar `apps/api/src/modules/service-orders/rules.ts`, `settings.ts`, `orders.ts`, `print-model.ts`.
- Criar `apps/api/test/service-order-rules.test.ts` e `apps/api/test/service-order.integration.test.ts`.
- Registrar os dois testes em `apps/api/scripts/run-tests.ts`.
- Registrar rotas em `apps/api/src/app.ts`: configuração em `/settings`, ordem em `/service-orders`.
- Criar `apps/ui/src/services/serviceOrders.ts`.
- Criar `apps/ui/src/components/ServiceOrders/ServiceOrderSettingsForm.tsx`, `ListServiceOrders.tsx`, `FormServiceOrder.tsx`, `serviceOrderDocument.ts`, `serviceOrderDocument.test.ts`.
- Modificar `apps/ui/src/components/Settings/SettingsPage.tsx`, `apps/ui/src/App.tsx`, `apps/ui/src/components/AppSidebar.tsx`.
- Registrar `serviceOrderDocument.test.ts` em `apps/api/scripts/run-tests.ts` com caminho `../ui/src/components/ServiceOrders/serviceOrderDocument.test.ts`. O arquivo não importa Vite.

Os commits seguem o estilo do repositório: uma frase em português dizendo por que a mudança existe. Não usar Conventional Commits.

Comandos, a partir da raiz:

```powershell
pnpm --dir apps/api test
pnpm --dir apps/api db:generate
pnpm --dir apps/api db:migrate
```

`pnpm --dir apps/api test` prepara o banco `erp360_test`. Não definir `DATABASE_NAME` antes de `pnpm db:migrate`, para a migração de desenvolvimento continuar em `erp360_db`.

---

### Task 1: Pacote e tabelas

**Files:**
- Create: `packages/modules/service-orders/**`
- Modify: `packages/modules/core/src/db/schema.ts`
- Modify: `apps/api/package.json`
- Modify: `apps/api/src/db/index.ts`

- [x] **Step 1: Criar o pacote**

Copiar `package.json`, `tsconfig.json` e `eslint.config.js` de `packages/modules/inbound`. O nome é `@erp-360/mod-service-orders`. `src/index.ts` reexporta `./db/service-orders.ts`.

Em `users`, acrescentar:

```ts
unique('users_id_tenant_id_unique').on(table.id, table.tenantId),
```

- [x] **Step 2: Declarar enums, contador e configuração**

Enums `service_order_status` e `service_order_attendance` com os valores da spec.

`service_order_counters`: `tenant_id` chave primária, `last_number` inteiro, default 0, check `>= 0`. Apagar a empresa apaga o contador.

`service_order_settings`: `tenant_id` chave primária. Colunas `section_title`, `products_title`, `services_title`, `technician_signature_label`, `customer_signature_label` (`varchar(60)`, não vazias) e `summary_slot` (`varchar(7)`). O slot obedece a `^field(0[1-9]|1[01])$`.

`service_order_fields`: onze linhas por empresa. `slot`, `label` até 60, `is_active`, `is_required`, `width`. Único em `(tenant_id, slot)` e em `(id, tenant_id)`. Largura só 4, 6 ou 12. Campo ativo tem rótulo com texto.

`service_order_note_lines`: cinco linhas. `slot` `line01` … `line05`, `body` até 500, `is_active`. Único em `(tenant_id, slot)` e em `(id, tenant_id)`.

- [x] **Step 3: Declarar a ordem, os valores, as observações e as linhas**

`service_orders` leva o núcleo da spec, a cópia do cliente, os totais, a cópia do pagamento e `label_frozen_at`.

Colunas da cópia do pagamento, todas nulas quando não há forma: `payment_method_id`, `payment_installments`, `means_of_payment_id`, `interest_type`, `interest_rate_bps`, `administrative_fee_bps`, `fixed_fee_amount`, `first_due_days`, `interval_days`, `receipt_kind`, `integration_type`, `acquirer_id`, `card_brand_id`. Reusar os enums já publicados em `@erp-360/mod-financial`.

Checks:

- número maior que zero, único por empresa
- totais e componentes em centavos, cada um `>= 0`
- `total_amount = products_amount + services_amount + freight_amount - discount_amount + surcharge_amount`
- parcelas nulas ou entre 1 e 48
- origem só com atendimento `warranty` ou `rework`
- `delivered_at` preenchido exatamente quando a situação é `delivered`
- `label_frozen_at` preenchido exatamente quando a situação é `delivered` ou `cancelled`

Chaves compostas com `onDelete: 'restrict'` para cliente, atendente, origem, forma, credenciadora, item e técnico. Meio e bandeira usam a chave simples do catálogo global. Linhas filhas usam `onDelete: 'cascade'`.

`service_order_field_values`: `slot`, `value` até 2000, e `label`, `width`, `is_active` nulos até o congelamento. Único em `(tenant_id, order_id, slot)`. `field01` … `field07` recusam valor acima de 120 caracteres.

`service_order_notes`: `slot`, `body` até 500. Único em `(tenant_id, order_id, slot)`.

`service_order_lines`: `line_number`, `kind` (`product` ou `service`), `item_id`, `code` de seis dígitos, `description` até 120, `quantity` e `unit_price` em `numeric(15, 4)`, `line_amount` em centavos, `technician_person_id`, `technician_name`. Quantidade maior que zero. Preço e total `>= 0`. Linha de produto guarda técnico nulo. Único em `(tenant_id, order_id, line_number)`.

- [x] **Step 4: Registrar o schema no app**

`apps/api/package.json` depende do pacote. `apps/api/src/db/index.ts` faz spread dele no objeto `schema`, junto dos outros módulos.

- [x] **Step 5: Commit**

```powershell
git add packages/modules/service-orders packages/modules/core/src/db/schema.ts apps/api/package.json apps/api/src/db/index.ts pnpm-lock.yaml
git commit -m "Reserva as tabelas da ordem de serviço e a chave composta do atendente."
```

---

### Task 2: Migração

**Files:**
- Create: `apps/api/src/db/migrations/<gerada>.sql`

- [x] **Step 1: Gerar e aplicar**

```powershell
pnpm --dir apps/api db:generate
pnpm --dir apps/api db:migrate
```

Expected: um SQL novo com os enums, as oito tabelas, o único de `users (id, tenant_id)` e as chaves estrangeiras. `db:migrate` termina sem erro em `erp360_db`. Nenhuma coluna nova em `tenants`.

- [x] **Step 2: Commit**

```powershell
git add apps/api/src/db/migrations
git commit -m "Cria as tabelas da ordem de serviço."
```

---

### Task 3: Regras puras

**Files:**
- Create: `apps/api/src/modules/service-orders/rules.ts`
- Test: `apps/api/test/service-order-rules.test.ts`
- Modify: `apps/api/scripts/run-tests.ts`

- [x] **Step 1: Escrever os testes que falham**

Cobrir, com `node:test`:

- Aberta segue para Em análise, Aguardando aprovação, Aguardando peça, Em execução e Cancelada, e recusa Pronta e Entregue.
- Em análise segue para Pronta. Aguardando peça recusa Pronta. Pronta segue para Entregue e Em execução. Entregue e Cancelada recusam qualquer saída.
- `lineAmountCents('1.0000', '10.0050')` é `1001`. `lineAmountCents('1.0000', '10.0040')` é `1000`. `lineAmountCents('1.0000', '0.0050')` é `1`.
- Desconto acima de produtos + serviços + frete + acréscimo é recusado. Total zero passa.
- `formatServiceOrderNumber(1)` é `000.000.001`. `formatServiceOrderNumber(1_000_000_000)` é `1.000.000.000`.
- “À vista” quando a quantidade é 1 e a carência é 0. “3x” nos demais, inclusive 1 com carência 30.
- Rótulo alterado com ordem aberta e valor pede confirmação. O mesmo rótulo, valor em branco, ou ordem já entregue, não pede.
- Garantia sem origem passa. Avulso com origem é recusado. Origem igual à própria ordem é recusada.
- Campo obrigatório ativo e vazio é recusado. O mesmo campo inativo passa.
- Produto com técnico é recusado. Serviço com item produto é recusado.

Registrar o arquivo em `run-tests.ts`.

- [x] **Step 2: Rodar e ver falhar**

```powershell
pnpm --dir apps/api test
```

Expected: falha ao importar `rules.ts`.

- [x] **Step 3: Implementar as regras**

Transições num mapa constante, uma lista de destinos por situação.

`lineAmountCents` trabalha em inteiro. Quantidade e preço, na escala 4, viram bigint. O produto está na escala 8. Centavos são esse produto dividido por `1_000_000`, com meio para cima: `(produto + 500_000n) / 1_000_000n`.

`formatServiceOrderNumber` faz `padStart(9, '0')` quando couber em nove dígitos e insere o ponto a cada três a partir da direita.

`installmentsLabel(count, firstDueDays)` devolve `À vista` só quando `count === 1 && firstDueDays === 0`.

`labelChangeSlots(before, after, openValues)` devolve os slots cujo rótulo mudou e cujo `openValues[slot]` é verdadeiro.

`assertTransition`, `assertTotals`, `assertOrigin`, `assertRequiredFields` e `assertLine` lançam `Error` com `status` 400, no mesmo gesto de `planDocumentPayment`.

- [x] **Step 4: Rodar e ver passar**

```powershell
pnpm --dir apps/api test
```

Expected: o arquivo novo passa e a suíte anterior continua passando.

- [x] **Step 5: Commit**

```powershell
git add apps/api/src/modules/service-orders/rules.ts apps/api/test/service-order-rules.test.ts apps/api/scripts/run-tests.ts
git commit -m "Fixa situação, centavos, número e rótulo da ordem antes de gravar."
```

---

### Task 4: Aba e semente

**Files:**
- Create: `apps/api/src/modules/service-orders/settings.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/test/service-order.integration.test.ts`

- [x] **Step 1: Escrever o teste de integração da semente**

Usar `createCompany` de `apps/api/test/fixtures.ts`. A primeira leitura cria a assistência: `field01` Descrição, largura 12, obrigatório; `field08` Problema reclamado, obrigatório; `summary_slot` `field01`; `line01` e `line02` ativas com o texto da spec; `line03` … `line05` inativas e vazias. A segunda leitura devolve a mesma linha, sem duplicar.

Gravar os rótulos da oficina (`field01` Marca, `field04` Placa obrigatório, `summary_slot` `field04`) e ler de volta.

Tentar apontar `summary_slot` para um campo inativo e receber 400. Tentar rótulo ativo em branco e receber 400.

Registrar o teste em `run-tests.ts`.

- [x] **Step 2: Rodar e ver falhar**

```powershell
pnpm --dir apps/api test
```

- [x] **Step 3: Implementar `getOrCreate` e o `PUT`**

`getOrCreateServiceOrderSettings(tenantId)` insere, na mesma transação, a configuração, os onze campos e as cinco linhas com o conteúdo da spec. Se a linha já existe, devolve o conjunto.

`PUT /settings/service-order` valida o corpo com Zod e grava os dois blocos, os títulos e o `summarySlot` na mesma transação. Antes de gravar, procura ordem cuja situação não é `delivered` nem `cancelled` e cujo valor daquele slot, depois do `trim`, não é vazio. Havendo rótulo diferente e o corpo sem `confirmLabelChange: true`, responde 409:

```json
{ "code": "label_change", "slots": ["field08"] }
```

Com a confirmação, grava. Ordem entregue ou cancelada não entra na busca.

Registrar em `app.ts` com prefixo `/settings` e `autenticarETenant`, ao lado de `nfeSettingsRoutes`.

- [x] **Step 4: Rodar e ver passar**

```powershell
pnpm --dir apps/api test
```

- [x] **Step 5: Commit**

```powershell
git add apps/api/src/modules/service-orders/settings.ts apps/api/src/app.ts apps/api/test/service-order.integration.test.ts apps/api/scripts/run-tests.ts
git commit -m "Abre a aba da ordem com a assistência e confirma a troca de rótulo."
```

---

### Task 5: Ordem, linhas e encerramento

**Files:**
- Create: `apps/api/src/modules/service-orders/orders.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/test/service-order.integration.test.ts`

- [x] **Step 1: Acrescentar os testes que falham**

No mesmo arquivo de integração:

- Duas ordens seguidas recebem `000.000.001` e `000.000.002`. Cancelar a primeira e abrir a terceira entrega `000.000.003`.
- A abertura copia `line01` ativa. Mudar o texto na aba não altera a ordem já aberta. Uma ordem aberta depois disso recebe o texto novo.
- Desligar `field06`, gravar um valor, religar e ler o valor de volta.
- Linha de serviço com item produto responde 400. Linha de produto com técnico responde 400.
- Desconto maior que a soma responde 400.
- Entregar sem forma responde 400. Entregar com total zero e forma ativa de ordem de serviço grava `delivered_at` e `label_frozen_at`.
- Depois de entregue, mudar rótulo na aba não muda o rótulo lido nessa ordem. Mudar item, cliente, total ou observação responde 400. Mudar `internalNotes` passa.
- Cancelada também recusa item e total.
- Avulso com `originOrderId` responde 400.
- A lista, com busca `000.000.001` e com busca `1`, encontra a primeira ordem.

Criar medida e item como `inbound-post.integration.test.ts` faz, um `product` e um `service`. A pessoa de `createCompany` já é cliente.

- [x] **Step 2: Rodar e ver falhar**

```powershell
pnpm --dir apps/api test
```

- [x] **Step 3: Implementar a gravação**

Rotas, todas com `autenticarETenant` e prefixo `/service-orders`:

| Método | Caminho | Papel |
|---|---|---|
| `GET` | `/` | Lista. Query `q` e `status`. |
| `POST` | `/` | Abre a ordem. |
| `GET` | `/:id` | Detalhe, com campos, notas, linhas e rótulos vigentes. |
| `PUT` | `/:id` | Salva cabeçalho, cópia, campos, notas, linhas, totais, pagamento e situação. |

`POST` chama `getOrCreate`, trava o contador com `INSERT` do zero quando falta a linha e `UPDATE service_order_counters SET last_number = last_number + 1 WHERE tenant_id = $1 RETURNING last_number`, e insere a ordem, onze valores vazios e cinco notas na mesma transação. `opened_at` é `now()`. `opened_by_user_id` é `request.user.userId`. Situação nasce `open`. Atendimento ausente vira `walk_in`.

A escolha da pessoa copia nome e documento da pessoa e, quando existem, o contato `Principal` e o endereço `Principal`. `customerCityLine` usa `cities.name` e `states.abbreviation`. CEP entra em `customerStreetLine` com `formatPostalCode`.

Cada salvamento substitui as linhas pelo array recebido e renumera `lineNumber` de 1 a n. Totais de produto e serviço são a soma de `lineAmount`. O preço inicial, quando o cliente não manda preço, é `listPrice` ou zero. Item inativo é recusado. Técnico, quando vem, é pessoa ativa com `isEmployee`; o nome é copiado nessa hora.

Forma de pagamento, quando vem, precisa estar ativa, com `useInServiceOrder`, com `receipt_kind` diferente de `store_credit`, e a quantidade precisa existir na condição. A cópia substitui a anterior. Forma vazia zera a cópia. Isso vale enquanto a ordem não encerrou.

Entregar preenche `delivered_at` se estiver vazio, exige forma e congela os onze slots com o rótulo, a largura e o ativo da aba naquela transação. Cancelar congela do mesmo modo e deixa `delivered_at` nulo. Os dois recusam qualquer campo que não seja `internalNotes`.

A lista faz `ilike` em `customer_name` e nos onze `value`. Se `q`, sem pontuação, for só dígito, também compara com `number`. Situação, quando vem, filtra. Ordem de `number` descendente.

Erros de regra saem com status 400 e mensagem em português. O handler já entende `error.status`.

- [x] **Step 4: Rodar e ver passar**

```powershell
pnpm --dir apps/api test
```

- [x] **Step 5: Commit**

```powershell
git add apps/api/src/modules/service-orders/orders.ts apps/api/src/app.ts apps/api/test/service-order.integration.test.ts
git commit -m "Abre, numera e encerra a ordem sem reaproveitar número nem reescrever a cópia."
```

---

### Task 6: Modelo do comprovante

**Files:**
- Create: `apps/api/src/modules/service-orders/print-model.ts`
- Create: `apps/ui/src/components/ServiceOrders/serviceOrderDocument.ts`
- Create: `apps/ui/src/components/ServiceOrders/serviceOrderDocument.test.ts`
- Modify: `apps/api/src/modules/service-orders/orders.ts`
- Modify: `apps/api/scripts/run-tests.ts`
- Modify: `apps/api/test/service-order.integration.test.ts`

- [x] **Step 1: Testar o modelo e o HTML**

`GET /service-orders/:id/print` devolve o modelo formatado. O teste de integração confere:

- número `000.000.001`
- logo vazia produz `logoText` com o nome fantasia e `logoUrl` nulo
- celular e WhatsApp vazios vêm `null`; telefone de 10 ou 11 dígitos vem mascarado com `formatPhone`
- campo ativo vazio vem na lista, com valor `''`
- campo inativo não vem
- ordem entregue devolve o rótulo congelado, mesmo depois de a aba mudar
- `internalNotes` não existe na resposta
- linha de observação vazia não vem
- `installmentsLabel` e `methodDescription`
- `adjustmentAmount` é acréscimo menos desconto, em centavos, com sinal

O teste do documento, sem Vite, recebe um CSS curto e o modelo:

- a folha contém a classe `os-container` e o número
- sem URL, o espaço da logo mostra o nome fantasia
- com URL, a folha contém `<img` e não executa o endereço como HTML
- o texto de uma nota interna, se alguém o colocar no modelo à força, não é o contrato: o teste do modelo já garante a ausência; o HTML escapa `<` do nome do cliente

- [x] **Step 2: Rodar e ver falhar**

```powershell
pnpm --dir apps/api test
```

- [x] **Step 3: Montar o modelo na API**

`buildServiceOrderPrint` lê a ordem, a empresa, a cidade, o estado, o usuário atendente e a forma. Datas usam `cities.timezone` e, sem fuso ou sem cidade, `America/Sao_Paulo`, no formato `dd/MM/yyyy HH:mm`.

Ordem aberta lê rótulo, largura e ativo da aba. Ordem com `label_frozen_at` lê o snapshot dos onze valores. Telefone com tamanho diferente de 10 ou 11 sai em dígitos. Inscrição estadual vazia e telefones vazios saem `null`. Dinheiro sai em centavos, para a tela formatar com `formatCurrencyInput`.

`GET /:id/print` devolve esse objeto.

- [x] **Step 4: Pintar a folha**

`serviceOrderDocument(model, css)` devolve um HTML completo. O componente que imprimir passa o conteúdo de `<style>` de `doc/templates/os.html`, importado com `?raw` só no componente, não no teste.

O corpo repete a ordem do mock: emitente, selo do número, atendente, abertura, previsão, tipo, situação, cliente, seção do objeto, campos na grade de 12, tabela de produtos, tabela de serviços, totais, pagamento, observações com texto e as duas assinaturas. Campo ativo vazio ocupa a largura, com o valor em branco. A largura é `grid-column: span N`.

Não criar media query nova nem empilhar bloco para tela estreita.

- [x] **Step 5: Rodar e ver passar**

```powershell
pnpm --dir apps/api test
```

- [x] **Step 6: Commit**

```powershell
git add apps/api/src/modules/service-orders/print-model.ts apps/api/src/modules/service-orders/orders.ts apps/api/test/service-order.integration.test.ts apps/api/scripts/run-tests.ts apps/ui/src/components/ServiceOrders/serviceOrderDocument.ts apps/ui/src/components/ServiceOrders/serviceOrderDocument.test.ts
git commit -m "Monta o comprovante na folha atual, com o rótulo congelado e sem nota interna."
```

---

### Task 7: Aba na tela de configurações

**Files:**
- Create: `apps/ui/src/services/serviceOrders.ts`
- Create: `apps/ui/src/components/ServiceOrders/ServiceOrderSettingsForm.tsx`
- Modify: `apps/ui/src/components/Settings/SettingsPage.tsx`

- [x] **Step 1: Cliente HTTP**

`serviceOrdersService` fala com `/settings/service-order` e `/service-orders`. No 409 com `code: 'label_change'`, a função deixa o chamador decidir, em vez de transformar isso num erro genérico.

- [x] **Step 2: Formulário da aba**

A aba fica em Configurações, depois de Financeiro. A descrição da página passa a citar a ordem de serviço.

Um salvamento manda campos, linhas, títulos, assinaturas e `summarySlot`. Cada campo mostra o código (“Campo 07”), ativo, rótulo, obrigatório e largura 4, 6 ou 12. O código não é input. Cada linha mostra o código, ativo e texto.

Quando a API devolve `label_change`, um diálogo lista os endereços e só reenvia com `confirmLabelChange: true` se a pessoa confirmar.

- [x] **Step 3: Commit**

```powershell
git add apps/ui/src/services/serviceOrders.ts apps/ui/src/components/ServiceOrders/ServiceOrderSettingsForm.tsx apps/ui/src/components/Settings/SettingsPage.tsx
git commit -m "Expõe a aba da ordem ao lado de Emitente, Certificado, NF-e e Financeiro."
```

---

### Task 8: Lista e formulário

**Files:**
- Create: `apps/ui/src/components/ServiceOrders/ListServiceOrders.tsx`
- Create: `apps/ui/src/components/ServiceOrders/FormServiceOrder.tsx`
- Modify: `apps/ui/src/App.tsx`
- Modify: `apps/ui/src/components/AppSidebar.tsx`

- [x] **Step 1: Rotas e menu**

Menu “Ordens de serviço”, rota `/service-orders`. Formulário em `/service-orders/new` e `/service-orders/:id`. As três rotas entram em `AreaLogada`, dentro de `Pagina`. O hash `#service-orders` cai na lista. A descrição do item no `rotasPorHash` acompanha as outras entradas.

- [x] **Step 2: Lista**

Colunas: número formatado, cliente, valor de `summarySlot` com o rótulo atual desse campo no cabeçalho, abertura, previsão e situação. A mais recente primeiro. Busca e filtro de situação disparam `q` e `status`. Linha vazia explica que ainda não há ordem.

- [x] **Step 3: Formulário**

O formulário usa a grade do sistema, doze colunas, com `span` vindo da largura do campo. Ordem aberta lê rótulo e largura da aba. Ordem entregue ou cancelada lê o snapshot que o detalhe já traz e deixa tudo desabilitado, menos `internalNotes`.

Cliente é uma pessoa ativa com `isClient`. Ao escolher, o formulário mostra a cópia e permite corrigi-la. Tipo de atendimento nasce Avulso. Garantia e Retrabalho mostram a ordem de origem.

Campos `field01` … `field07` são input. `field08` … `field11` são textarea. Campo inativo não aparece. Obrigatório, só se ativo, impede o submit.

Produtos e serviços são duas tabelas. O item vem do catálogo do tipo certo e ativo. O código aparece e não edita. A descrição edita. Serviço aceita técnico, pessoa ativa com `isEmployee`. Produto não mostra técnico.

Frete, desconto e acréscimo são centavos, no mesmo padrão visual do restante do financeiro. O total exibido é produtos + serviços + frete − desconto + acréscimo.

A forma vem de `GET /payment-methods?channel=serviceOrder&isActive=true`, sem `store_credit`. A condição é uma quantidade que essa forma tem. Os dois podem ficar vazios até a entrega.

A situação só oferece os destinos que `rules.ts` aceita. Entregar com o botão correspondente, que manda `status: 'delivered'`.

- [x] **Step 4: Commit**

```powershell
git add apps/ui/src/components/ServiceOrders/ListServiceOrders.tsx apps/ui/src/components/ServiceOrders/FormServiceOrder.tsx apps/ui/src/App.tsx apps/ui/src/components/AppSidebar.tsx
git commit -m "Abre a lista e o formulário da ordem no layout do sistema."
```

---

### Task 9: Imprimir e conferir na tela

**Files:**
- Modify: `apps/ui/src/components/ServiceOrders/FormServiceOrder.tsx`
- Create: o trecho do componente que chama `serviceOrderDocument` pode morar no próprio formulário se continuar pequeno

- [x] **Step 1: Botão Imprimir**

O botão pede `GET /service-orders/:id/print`, monta o HTML com o CSS de `doc/templates/os.html` e abre essa folha para impressão. A ordem nova é salva antes, para o número já existir.

- [x] **Step 2: Conferir no navegador**

Com `pnpm dev` no ar, percorrer:

- Configurações mostra a aba com Descrição, Problema reclamado, as duas observações ativas e o restante da assistência.
- Gravar os rótulos da oficina pede confirmação se já existe ordem aberta com valor; a ordem aberta passa a mostrar Marca, Placa e o checklist. A ordem entregue conserva o rótulo antigo.
- Desligar um campo esconde e religar devolve o valor.
- Mudar `line01` na aba não muda a ordem já aberta.
- Abrir uma ordem, lançar um produto e um serviço, recusar produto no serviço e técnico no produto, estourar o desconto e ver o total fechar.
- Entregar sem forma é recusado. Entregar com forma trava item, cliente, campo, observação e total, e ainda permite a nota interna.
- Imprimir mostra a folha do mock, a logo ou o nome fantasia, omite celular e WhatsApp vazios, e não mostra a nota interna.
- A lista encontra `000.000.001` e o número `1`. Cancelar não devolve o número à ordem seguinte.
- A largura da janela do sistema pode mudar. A folha impressa não ganha uma segunda disposição.

- [x] **Step 3: Commit**

```powershell
git add apps/ui/src/components/ServiceOrders
git commit -m "Imprime a ordem na folha combinada com o cliente."
```

---

## Fora deste plano

Estoque, NFS-e, NF-e, conta a receber, vários bens, foto, vistoria item a item, assinatura capturada, WhatsApp, cupom, tela estreita e o botão que grava o modelo da oficina de uma vez. O texto de `field10` continua um dos onze campos.
