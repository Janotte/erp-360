# Auditoria de arquitetura do ERP 360

Leitura estática do monorepo em 16 de outubro de 2026. Nenhum arquivo de aplicação foi alterado nesta auditoria. Não houve teste de carga nem plano de execução do Postgres.

Escopo lido: estrutura do monorepo, configurações, rotas Fastify, serviços de liquidação e tesouraria, schemas Drizzle, contratos em `packages/shared`, autenticação, telas React e `docker-compose.yml`. Também foi executado `tsc` da API e da interface.

Fora desta leitura: conteúdo linha a linha das migrações SQL, scripts de seed, acessibilidade de cada controle e comportamento com o servidor no ar.

## A. Diagnóstico executivo

A estrutura cabe no produto. `apps/ui` e `apps/api` estão separados. Os schemas Drizzle ficam em `packages/modules`, por domínio. Os contratos Zod e a formatação ficam em `packages/shared`. A interface não importa tabela. A autorização de verdade está no backend: cada consulta de negócio filtra `tenantId` vindo do JWT, e as chaves estrangeiras compostas (`id` + `tenant_id`) impedem vínculo com registro de outra empresa. Valores financeiros estão em centavos inteiros.

O que impede evoluir com segurança:

- a liquidação de título não trava a linha e pode baixar o mesmo título duas vezes;
- o saldo do extrato é reescrito linha a linha, sem serializar a série;
- a sessão fica no `localStorage`, sem revogação, e o cache da interface mistura empresas;
- login e cadastro não têm limite de tentativa;
- o build da API não passa no `tsc`;
- não há testes nem pipeline.

Cadastro com Drizzle direto na rota é adequado ao tamanho atual. Falta trava e teste na liquidação, não uma camada de repositório.

Contagem: 1 achado crítico, 5 altos, 7 médios, 2 baixos. Nenhum arquivo de teste.

## B. Matriz de qualidade

Nota de 0 a 10 na auditoria estática. 7 é o patamar em que o critério sustenta evolução sem refatoração prévia. Fonte: código do repositório, mais o `tsc` executado em 16 out 2026. Sem medição de runtime.

| Critério | Nota | Diagnóstico |
| --- | ---: | --- |
| Organização de diretórios | 7 | Monorepo claro. Rotas da API ainda num único diretório. |
| Arquitetura front-end | 6 | Features em pastas e TanStack Query. Listas grandes e chaves sem empresa. |
| Arquitetura back-end | 6 | Rotas Zod e serviços onde a regra pesa. `settlement.ts` concentra demais. |
| Separação de responsabilidades | 6 | UI longe do banco. SQL de cadastro permanece na rota, o que é aceitável. |
| Acoplamento | 6 | UI só depende de `shared`. Pagar e receber estão copiados. |
| Coesão | 7 | Pacotes de schema por domínio. Fluxo de caixa mora dentro da liquidação. |
| Clean Code | 7 | `strict`, sem `any` explícito, ESLint recusa `any`. Arquivos de lista passam de 500 linhas. |
| Segurança | 4 | Tenant no token e no `WHERE`. Sessão, limite de tentativa e cache ficam abertos. |
| Persistência | 7 | Centavos inteiros, enums, checks e FK composta. Falta trava na baixa. |
| Qualidade TypeScript | 6 | `strict` e sem `any` explícito. O `tsc` da API falha em dois pontos. A UI compila. |
| Testabilidade | 2 | Cálculo puro separado, porém sem teste nem CI. |
| Manutenibilidade | 6 | Convenções boas. Duplicação de pagar e receber aumenta o custo de cada mudança. |
| Escalabilidade | 5 | Um processo e recálculo de saldo proporcional ao extrato. Sem medição de carga. |

## C. Inventário de problemas

### ARQ-001 — Crítico — Liquidação sem trava de concorrência

- Onde: `apps/api/src/services/settlement.ts`, `settleTitle`, por volta das linhas 86–90 e 255–264.
- Evidência: a função lê o título, confere status pendente e só depois atualiza. O `UPDATE` filtra `id` e `tenantId`, sem `status = pendente` e sem `SELECT FOR UPDATE`.
- Causa: em isolamento READ COMMITTED, duas requisições leem o mesmo título pendente antes de qualquer commit. As duas seguem e gravam caixa, banco e baixa.
- Impacto: dupla baixa do mesmo título. Saldo de tesouraria e status financeiro divergem. É integridade de dinheiro, não lentidão.
- Correção: no mesmo `UPDATE`, exigir status pendente e abortar se nenhuma linha voltar. Travar a linha do título no início da transação.
- Alternativa: constraint única de liquidação por título. Sozinha não basta: não impede duas inserções se o status for atualizado duas vezes antes da constraint existir.
- Esforço: 1 dia.
- Regressão: médio. Baixas parciais, estorno e restante de título passam pelo mesmo fluxo.
- Teste: duas liquidações simultâneas do mesmo título. A segunda deve falhar e o caixa deve mover o valor uma vez.

### ARQ-002 — Alto — Saldo corrente reescrito linha a linha

- Onde: `apps/api/src/services/settlement.ts`, `recalcCashBalances` e `recalcBankBalances`, linhas 549–605.
- Evidência: cada baixa lê todos os lançamentos do caixa ou da conta, recalcula o saldo em memória e faz um `UPDATE` por linha. Não há trava da série.
- Causa: duas transações podem ler a mesma série, calcular saldos diferentes e gravar por cima uma da outra.
- Impacto: extrato e saldo de banco deixam de bater com a soma das entradas e saídas. O fluxo de caixa usa esse saldo como abertura.
- Correção: serializar o recálculo por tenant e conta, com trava da conta no início da transação. Manter o saldo corrente só na última linha, se a regra de negócio permitir.
- Alternativa: saldo derivado só na leitura, sem coluna `balance`. Mais simples a longo prazo, porém muda extrato, fluxo e conciliação de uma vez.
- Esforço: 2 a 4 dias.
- Regressão: alto. Aplicação, resgate, saldo inicial e estorno dependem do mesmo recálculo.
- Teste: duas baixas simultâneas no mesmo caixa. A soma das movimentações deve ser igual ao saldo final.

### ARQ-003 — Alto — Sessão no localStorage, sem revogação

- Onde: `apps/ui/src/utils/auth.ts` e `apps/api/src/routes/auth.ts`, linhas 63–66.
- Evidência: o JWT vai para `localStorage`. A API assina com segredo de no mínimo 32 caracteres e expiração padrão de 1 dia. Não há refresh, lista de revogação nem checagem de que o usuário ainda existe.
- Causa: `autenticarETenant` só chama `jwtVerify`. O `tenantId` do token é aceito até expirar, mesmo se o usuário for removido.
- Impacto: script no navegador lê o token. Logout não invalida a sessão nos outros aparelhos. Qualquer usuário do tenant tem acesso total: não existe perfil.
- Correção: cookie `HttpOnly`, `Secure` e `SameSite`, com CSRF no estado mutável. Enquanto o bearer permanecer, reduzir a expiração e limpar o token no 401.
- Alternativa: manter bearer e acrescentar só rotação curta. Menos mudança na UI, porém o token continua legível por script.
- Esforço: 2 a 4 dias.
- Regressão: médio. Login, cadastro e todas as rotas autenticadas.
- Teste: token antigo após logout ou exclusão do usuário deve receber 401. O documento não deve expor o segredo da sessão a script da página.

### ARQ-004 — Alto — Cache da interface mistura empresas

- Onde: `apps/ui/src/main.tsx`, linhas 12–18, e `apps/ui/src/App.tsx`, função `sair`.
- Evidência: o `QueryClient` é único, com `staleTime` de 5 minutos. As chaves, como `listaPessoas` e `financial/payable`, não incluem o tenant. Sair só apaga o token.
- Causa: o cache trata dados remotos como globais da aba. Trocar de usuário não muda a chave.
- Impacto: no mesmo navegador, a empresa seguinte pode ver listas da anterior por até 5 minutos, antes de qualquer refetch.
- Correção: `queryClient.clear()` no logout e no login. Incluir o identificador da empresa na chave, ou criar o cliente de query por sessão.
- Alternativa: `staleTime` zero. Reduz a janela, mas não elimina a leitura de cache fresco entre sessões.
- Esforço: meio dia.
- Regressão: baixo. Listas podem piscar ao entrar de novo.
- Teste: entrar como empresa A, sair, entrar como B. A primeira pintura de pessoas e títulos não pode mostrar dados de A.

### ARQ-005 — Alto — Login e cadastro sem limite de tentativa

- Onde: `apps/api/src/index.ts` e `apps/api/src/routes/auth.ts`.
- Evidência: não há `@fastify/rate-limit`, nem atraso, nem bloqueio. O cadastro é público e cria tenant e usuário na mesma transação. A senha aceita 6 caracteres, com bcrypt custo 10.
- Causa: a superfície de autenticação confia só na mensagem genérica de erro e no custo do bcrypt.
- Impacto: força bruta no login e criação em massa de empresas. O bcrypt só ocorre quando o e-mail existe, então a ausência do usuário responde mais rápido.
- Correção: limite por IP e por e-mail em `/auth/login` e `/auth/register`. Comparar um hash falso quando o usuário não existe. Subir o mínimo da senha.
- Alternativa: captcha só no cadastro. Não protege o login.
- Esforço: 1 dia.
- Regressão: baixo, se o limite ficar folgado para uso humano.
- Teste: a sexta falha seguida no mesmo e-mail deve ser recusada. Usuário inexistente e senha errada devem levar tempo parecido.

### ARQ-006 — Médio — Data de hoje calculada em UTC

- Onde: `apps/api/src/services/settlement.ts`, `listCashFlow`, linhas 608–609. Também `PayModal.tsx` e `TransferModal.tsx`.
- Evidência: `toISOString().slice(0, 10)` usa o calendário UTC. O fluxo de caixa agrupa vencidos e o dia corrente com essa data.
- Causa: o processo Node e o navegador não fixam `America/Sao_Paulo`. Entre 21h e meia-noite no Brasil, o dia civil já virou no UTC.
- Impacto: títulos vencem ou entram no fluxo um dia antes. A data sugerida na baixa e na transferência erra no fim do dia.
- Correção: calcular a data civil no fuso da empresa, no servidor e nos formulários que pré-preenchem hoje.
- Alternativa: guardar o fuso no tenant. Melhor quando houver filiais. Cedo demais se todas as empresas estão no mesmo fuso.
- Esforço: 1 dia.
- Regressão: médio. Fluxo de caixa, baixa e transferência.
- Teste: com relógio em 21h de Brasília, a data sugerida e o primeiro dia do fluxo devem ser o dia local, não o dia UTC.

### ARQ-007 — Médio — 401 não encerra a tela

- Onde: `apps/ui/src/services/apiClient.ts` e `apps/ui/src/App.tsx`, `AreaLogada`.
- Evidência: a rota protegida só olha se existe token no `localStorage`. `apiFetch` devolve a resposta sem tratar 401.
- Causa: autorização de tela e validade do token são critérios diferentes. A tela usa o primeiro.
- Impacto: token expirado continua na área logada. As listas falham uma a uma, sem voltar ao login nem limpar o cache.
- Correção: um único ponto em `apiFetch`. 401 limpa token, cache e navega para `/login`.
- Alternativa: interceptor do TanStack Query. Serve se todas as chamadas passarem por `useQuery`. Hoje há `fetch` solto nos services.
- Esforço: meio dia.
- Regressão: baixo.
- Teste: resposta 401 em qualquer lista deve cair no login e não reaproveitar cache.

### ARQ-008 — Médio — Pagar e receber duplicados de ponta a ponta

- Onde: `PayableList.tsx` e `ReceivableList.tsx`, cerca de 570 linhas cada. Rotas `payables.ts` e `receivables.ts`.
- Evidência: as listas repetem filtro, ordenação, paginação, diálogo e mutações. Os services da UI já unificam o contrato em `financials.ts`. As rotas e a liquidação ainda repetem os dois lados.
- Causa: o domínio é parecido, mas a extração parou no cliente HTTP. Cada ajuste de baixa ou de grade precisa de dois arquivos.
- Impacto: correção aplicada num lado e esquecida no outro.
- Correção: uma lista parametrizada por tipo e um módulo de rotas que compartilhe schema, paginação e regras iguais. Manter campos exclusivos do receber fora desse núcleo.
- Alternativa: deixar duplicado até a segunda diferença real de regra. Aceitável só se o time parar de evoluir os dois juntos.
- Esforço: 3 a 5 dias, depois de testes da liquidação.
- Regressão: alto. É a tela mais usada do financeiro.
- Teste: os mesmos casos de listar, filtrar, baixar, estornar e replicar para os dois tipos.

### ARQ-009 — Médio — Postgres de desenvolvimento sem isolamento de segredo

- Onde: `docker-compose.yml`.
- Evidência: usuário `postgres`, senha `mysecretpassword` e banco `erp360_db` estão no arquivo. A porta 5432 é publicada. Não há healthcheck. Não existe `.env.example`, embora o `.gitignore` o preserve.
- Causa: o compose é o ambiente local e também a única definição de infraestrutura do repositório.
- Impacto: quem copiar o arquivo para um host exposto publica o banco com senha conhecida. Sem healthcheck, a API sobe antes do Postgres aceitar conexão, apesar do `wait-on` na porta.
- Correção: senha por variável, healthcheck do `pg_isready` e `.env.example` sem segredo. Manter esse compose só para desenvolvimento.
- Alternativa: compose de produção no mesmo arquivo. Mistura ciclo local e deploy. Melhor um arquivo separado quando houver deploy.
- Esforço: meio dia.
- Regressão: baixo para quem já tem `.env` apontando ao banco local.
- Teste: subir o compose e confirmar que a API espera o estado healthy, não apenas a porta aberta.

### ARQ-010 — Médio — Nenhum teste e nenhum pipeline

- Onde: repositório inteiro. Busca por `*.test.ts` e `*.spec.ts` não achou arquivos. Não há workflow de CI.
- Evidência: TypeScript `strict` e ESLint existem. `turbo lint` e `turbo build` não são disparados por integração contínua. `settlement-math.ts` é função pura e segue sem teste.
- Causa: a verificação é manual. A liquidação e o isolamento por tenant não têm rede de segurança.
- Impacto: ARQ-001 e ARQ-002 podem regressar sem falha de compilação. Refatorar pagar e receber fica arriscado.
- Correção: testes do cálculo de juros, da liquidação concorrente e de um acesso cruzado entre tenants. Um job que rode lint e esses testes.
- Alternativa: só teste de ponta no navegador. Mais lento e pior para concorrência de banco.
- Esforço: 3 a 5 dias para a primeira rede.
- Regressão: nenhum no comportamento, se os testes forem acrescentados sem mudar regra.
- Teste: o próprio job fica vermelho quando a segunda liquidação simultânea passa.

### ARQ-011 — Médio — Listagens sem índice de filtro

- Onde: `packages/modules/financial` e `packages/modules/persons`. Nenhum `index()` do Drizzle. Há `unique` e chave estrangeira.
- Evidência: pessoas, títulos e plano filtram por tenant e, nos títulos, por status e vencimento. O unique `(id, tenant)` não ordena a lista por vencimento.
- Causa: a integridade foi modelada com unique composto. O acesso de lista não ganhou índice próprio.
- Impacto: não houve medição de plano de execução. O risco é a lista crescer e o filtro por empresa passar a varrer a tabela. Não é lentidão comprovada hoje.
- Correção: depois de `EXPLAIN` nas listagens reais, índice `(tenant_id, status, due_on)` em títulos e `(tenant_id, name)` onde a ordenação já não estiver coberta pelo unique.
- Alternativa: criar índices agora, sem medição. Pode ser índice morto. Esta auditoria não recomenda isso.
- Esforço: 1 dia, depois da medição.
- Regressão: baixo. Migração aditiva.
- Teste: `EXPLAIN` da listagem paginada usa o índice novo no volume de teste.

### ARQ-012 — Médio — Sessão não confere o usuário no banco

- Onde: `apps/api/src/index.ts`, linhas 40–46, e `apps/api/src/routes/auth.ts`, linhas 53–60.
- Evidência: login devolve 401 com a mesma frase para e-mail ausente e senha errada, mas só chama bcrypt quando acha o usuário. O hook de autenticação não relê o usuário.
- Causa: o token é a única prova de identidade depois do login.
- Impacto: enumeração por tempo de resposta. Usuário excluído continua autorizado até o token expirar.
- Correção: comparar hash fictício no usuário ausente. Em rotas sensíveis, confirmar que o usuário do token ainda pertence ao tenant.
- Alternativa: consulta ao banco em toda requisição. Corrige revogação com custo fixo. Aceitável no volume atual. Cache curto se isso aparecer na medição.
- Esforço: 1 dia.
- Regressão: baixo.
- Teste: usuário apagado recebe 401. Tempos de e-mail inexistente e senha inválida ficam na mesma ordem.

### ARQ-013 — Baixo — Corpo de erro em dois formatos

- Onde: `apps/api/src/index.ts` usa `{ error }`. `persons.ts` usa `{ error }` no GET e `{ message }` no PUT. O handler central usa `{ message }`.
- Evidência: o cliente lê `erro.message` e cai numa frase genérica quando o campo vem como `error`.
- Causa: rotas antigas e o handler novo não fecharam o contrato.
- Impacto: a tela mostra falha genérica em 401 de rota e em pessoa não encontrada no GET.
- Correção: um único objeto `{ message }` no handler, inclusive no 401 do JWT.
- Alternativa: adaptar cada service da UI. Espalha o conhecimento do contrato.
- Esforço: meio dia.
- Regressão: baixo. Conferir toasts que leem `message`.
- Teste: 401, 404 e 409 devolvem `message`. A UI mostra esse texto.

### ARQ-014 — Baixo — Resíduos que confundem a fronteira

- Onde: `apps/api/src/config/config.plugin.ts`, `app-env.schema.ts` (`APP_NAME` padrão `tax-engine-api`) e `apps/ui/pnpm-lock.yaml`.
- Evidência: o plugin de config não é registrado. O nome padrão da aplicação é de outro produto. A UI tem um lockfile próprio dentro do workspace pnpm.
- Causa: código de um esboço anterior permaneceu ao lado da configuração que realmente vale, `env.ts`.
- Impacto: quem for alterar configuração pode editar o plugin morto. O lockfile aninhado pode instalar versão diferente da UI.
- Correção: apagar o plugin não usado, corrigir o nome padrão e remover o lockfile da UI se o workspace da raiz é a fonte.
- Alternativa: registrar o plugin e passar a ler `app.config`. Só vale se alguma rota precisar de env injetado. Hoje `env.ts` já é explícito.
- Esforço: meio dia.
- Regressão: baixo.
- Teste: `pnpm install` na raiz e build da UI sem o lockfile interno.

### ARQ-015 — Alto — O build da API não compila

- Onde: `apps/api/src/services/cnpj-lookup.ts`, linhas 88–94. `apps/api/src/services/settlement.ts`, linhas 245–250.
- Evidência: `tsc -p apps/api/tsconfig.app.json` falhou em 16 out 2026. `pickStateRegistration` e `fromOffice` ficam `any` implícito por recursão. O insert de `bankEntries` recebe `bankAccountId` como `string | null | undefined`, e a coluna não aceita `undefined`. A UI compilou limpa em `apps/ui/tsconfig.app.json`.
- Causa: o dev da API usa `tsx`, que não exige o typecheck. O script de build chama `tsc`. O ESLint barra `any` explícito, mas não estes dois erros do compilador.
- Impacto: `pnpm build` da API quebra. A baixa em banco está na região que o compilador recusa, então uma correção apressada de tipo pode mudar a gravação do lançamento.
- Correção: anotar o retorno de `pickStateRegistration` como `string | null`. No insert, usar `input.bankAccountId` só depois de estreitar para `string`, o que o `if` da linha 244 já garante.
- Alternativa: afrouxar `strict` ou excluir esses arquivos do build. Esconde o erro e o script de build deixa de ser critério.
- Esforço: meio dia.
- Regressão: médio no settlement, baixo na consulta de CNPJ.
- Teste: `tsc -p apps/api/tsconfig.app.json` termina sem erro. Uma baixa em conta bancária ainda grava `bankAccountId`.

## D. Mapa arquitetural

Dependência permitida: UI aponta para `shared`. API aponta para `shared` e para os schemas. O schema financeiro referencia pessoas. A UI não referencia Drizzle.

```text
apps/ui
  services (apiFetch + Zod de shared)
  components/Auth | Persons | Financial | ui
        |
        v
packages/shared          contratos Zod, formatação, tipos públicos
        ^
        |
apps/api
  routes + services
        |
        v
packages/modules/core | persons | financial     tabelas Drizzle
        |
        v
PostgreSQL 16
```

| Funcionalidade | Onde mora | Risco de mudança | Por quê |
| --- | --- | --- | --- |
| Autenticação | `routes/auth.ts`, `Auth/Login`, `utils/auth` | Alto | Sessão global. Mexer no token afeta todas as rotas. |
| Pessoas | `mod-persons`, `routes/persons.ts`, `components/Persons` | Médio | Títulos apontam para pessoa com FK composta. |
| Pagar e receber | rotas gêmeas, `financials.ts`, duas listas | Alto | A mesma regra está copiada. |
| Liquidação | `settlement.ts` e `settlement-math.ts` | Alto | Dinheiro, estorno, saldo e fluxo. |
| Tesouraria | `treasury.ts`, `treasury-transfer.ts`, `opening-balance.ts` | Alto | Usa o mesmo recálculo de saldo. |
| Plano e DRE | `plan-accounts.ts`, `income-statement.ts` | Médio | DRE lê `dreLine` dos lançamentos de caixa e banco. |
| Contratos | `packages/shared` | Médio | Mudança de schema Zod quebra API e UI juntas. |
| Componentes visuais | `components/ui` | Baixo | shadcn isolado de regra de negócio. |

### Três fluxos

Listar pessoas. `ListPersons` usa `useQuery` com a chave `listaPessoas`. `persons.ts` chama `apiFetch` `GET /persons`. A rota valida a query com Zod, lê `tenantId` do JWT e consulta `persons` com `eq(tenantId)`. O erro HTTP não passa por um contrato único. O cache não sabe qual empresa gerou a lista.

Criar e baixar um título. `PayableForm` envia o corpo pelo `financialService`. A rota `payables` valida com Zod local, grava `tenantId` do token e a FK composta impede credor de outra empresa. A baixa chama `settleTitle`, que abre transação, calcula juros em `settlement-math` e reescreve o saldo. O schema `payableTitleSchema` em `shared` valida a resposta na UI. A rota Fastify não usa esse schema na saída.

Entrar e abrir tela protegida. `Login` chama `POST /auth/login`. A API compara bcrypt e assina `userId` e `tenantId`. O token fica no `localStorage`. `AreaLogada` só verifica se o token existe. As rotas de negócio chamam `autenticarETenant`. Autorização de verdade está no backend. A tela não distingue token expirado de sessão válida.

## E. Organização recomendada

Manter `apps/ui`, `apps/api` e `packages`. Não criar packages novos. Não transformar schema Drizzle em serviço. A mudança útil é colocar cada domínio da API numa pasta com rotas e serviço, e cada feature da UI numa pasta com componentes e chamadas.

Preservar:

- `apps/ui` sem dependência dos módulos de banco.
- `packages/shared` só com Zod, tipos e formatação.
- `packages/modules` só com tabelas Drizzle.
- Chave estrangeira composta por `id` e `tenant`.
- Valor monetário em centavos inteiros.

Reagrupar:

- `routes/persons`, `person-addresses` e `person-contacts` na pasta `modules/persons` da API.
- `payables`, `receivables` e `settlement` na pasta `modules/titles`.
- `treasury`, transferência e `income-statement` na pasta `modules/treasury`.
- Listas de pagar e receber num componente só, com o tipo por parâmetro.
- Chaves de query num único módulo, sempre com a empresa.

Controller, repositório e use case para cada CRUD seriam indireção sem responsabilidade nova. O Drizzle nas rotas de cadastro pode continuar.

Estrutura atual, resumida:

```text
apps/ui/src/components/{Auth,Persons,Financial,ui}
apps/ui/src/services
apps/api/src/{routes,services,db,config}
packages/shared
packages/modules/{core,persons,financial}
```

Estrutura proposta, só reagrupando o que já existe:

```text
apps/ui/src/features/{auth,persons,titles,treasury,plan-accounts}
apps/ui/src/components/ui
apps/ui/src/lib
apps/api/src/modules/{auth,persons,titles,treasury,plan-accounts}
apps/api/src/{db,config,plugins}
packages/shared
packages/modules/{core,persons,financial}
```

## F. Plano de refatoração

| Etapa | Objetivo | Arquivos | Risco | Pronto quando |
| --- | --- | --- | --- | --- |
| 1. Integridade e sessão | Travar baixa e saldo. Limpar cache. Limitar login. Unificar erro 401. Fazer o `tsc` da API passar. | `settlement.ts`, `cnpj-lookup.ts`, `auth.ts`, `apiClient.ts`, `App.tsx`, `main.tsx` | Alto na liquidação | Segunda baixa simultânea falha, a troca de empresa não mostra dados da anterior, e o `tsc` da API termina sem erro. |
| 2. Fronteiras | Data civil no fuso local. Sessão inválida volta ao login. Hash fictício no login. | `settlement.ts`, `PayModal`, `TransferModal`, `apiClient`, `auth.ts` | Médio | Depois das 21h o fluxo usa o dia de Brasília. 401 sai da área logada. |
| 3. Módulos | Mover arquivos para pastas de domínio sem mudar regra. | `apps/api/src/routes` e `services` | Baixo | Build e lint iguais aos de antes da mudança. |
| 4. Duplicação | Uma lista e um núcleo de rotas para pagar e receber. | `PayableList`, `ReceivableList`, `payables.ts`, `receivables.ts` | Alto | Os dois tipos passam nos mesmos casos de filtro, baixa e estorno. |
| 5. Contratos | Resposta Fastify usa os schemas que a UI já importa de `shared`. | `financialContracts.ts` e rotas de título | Médio | Campo inesperado na resposta é recusado pelo serializer. |
| 6. Testes | Cálculo, concorrência e tenant cruzado no CI. | `settlement-math` e um banco de teste | Baixo | O pipeline falha se a baixa duplicada passar. |
| 7. Medição | `EXPLAIN` das listas e healthcheck do Postgres. Índice só com evidência. | `docker-compose.yml` e migração aditiva | Baixo | Healthcheck verde e plano de execução anexado à decisão de índice. |

A etapa 1 inclui ARQ-001, ARQ-002, ARQ-004, ARQ-005, ARQ-013 e ARQ-015. A etapa 2 inclui ARQ-006, ARQ-007 e ARQ-012. A etapa 3 é só pasta. A etapa 4 é o ARQ-008. A etapa 6 cobre o ARQ-010 e protege as anteriores. A etapa 7 cobre ARQ-009 e ARQ-011. ARQ-003 (cookie HttpOnly) pode entrar na etapa 2 se a troca de bearer for aceita. ARQ-014 entra em qualquer folga da etapa 3.

## G. O que deve permanecer inalterado

- Monorepo pnpm e Turbo.
- Pacotes de schema separados de contrato.
- Zod na borda do Fastify e na variável de ambiente.
- bcrypt.
- Transação no cadastro, na baixa e na transferência.
- Componentes shadcn sem regra de negócio.
- TanStack Query sem Redux.
- Centavos inteiros.
- FK composta de tenant.
- Drizzle direto nas rotas de cadastro.

Cedo demais para este produto: microsserviços, event sourcing, GraphQL, repositório genérico, quebra de pagar e receber em pacotes separados, e lazy de rota. O `App.tsx` ainda importa poucas telas. Code split só quando o build mostrar peso.
