# Etapa 7 — plano das listas

Medição em 16 de outubro de 2026, no banco `erp360_test`, com 20.000 linhas por tabela e `ANALYZE`. A transação foi desfeita. Nada ficou gravado.

A lista padrão de títulos filtra pela empresa e ordena por vencimento e id. A lista com status e faixa de vencimento é a mesma consulta quando a tela aplica esses filtros. Pessoas ordenam por nome. O plano de contas ordena por código.

## Sem índice novo

Lista de contas a pagar, 20.000 linhas, limite 10:

- Seq Scan em `payables` e Sort por `due_on, id`
- tempo de execução: 7,7 ms

A mesma lista com status `pendente` e vencimento nos próximos 30 dias:

- Seq Scan, 19.552 linhas removidas pelo filtro
- tempo de execução: 2,1 ms

Pessoas:

- Index Scan em `persons_tenant_name_unique` (`tenant_id`, `name`)
- tempo de execução: 0,1 ms

Plano de contas:

- Index Scan em `plan_accounts_tenant_account_code_unique` (`tenant_id`, `account_code`)
- tempo de execução: 0,1 ms

## Índice candidato `(tenant_id, status, due_on)`

Na lista padrão, o plano continua Seq Scan. O status fica no meio da chave e a consulta não filtra status, então o Postgres não usa o índice para ordenar por vencimento.

Na lista com status e vencimento, o plano passa a Index Scan nesse índice. Tempo: 0,16 ms.

## Índice `(tenant_id, due_on, id)`

Lista padrão: Index Scan, tempo 0,11 ms.

Lista com status e vencimento: Index Scan no mesmo índice, tempo 0,12 ms.

## Decisão

Entram `payables_tenant_due_idx` e `receivables_tenant_due_idx`, os dois em `(tenant_id, due_on, id)`. É o índice que a lista padrão usa. A lista filtrada também usa.

Não entra `(tenant_id, status, due_on)`. A lista padrão o ignora, e o índice de vencimento já cobre o filtro.

Não entra índice novo de pessoas nem de plano de contas. A unicidade `(tenant_id, name)` e `(tenant_id, account_code)` já aparece no plano.
