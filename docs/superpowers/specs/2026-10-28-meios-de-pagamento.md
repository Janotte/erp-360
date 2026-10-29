# Formas e meios de pagamento

Cadastro usado em orçamento, venda, PDV e ordem de serviço. O catálogo fiscal do tPag fica em `means_of_payment`, com a coluna `code`. A forma comercial, configurada por empresa, será uma tabela nova e fica com o nome `payment_methods`.

`card_brands` permanece como está: catálogo global do tBand, `code` varchar(2) e `name` varchar(60).

Identificadores em inglês, no padrão de `persons`, `receivables` e `bank_accounts`. Dinheiro em centavos (`integer`). Percentual em basis points (`integer`), como `financial_settings.lateFeeBps`: 199 = 1,99%. Tabelas da empresa usam `tenantColumns` e chave estrangeira composta `(id, tenant_id)`. Catálogo da SEFAZ e bandeira não têm tenant, no mesmo modelo de `ncms` e `card_brands`.

O meio de pagamento, a forma comercial, a tela do cadastro e o preenchimento da forma no recebível já estão no módulo. A cópia no documento continua no passo seguinte.

## Ajustes em relação ao rascunho

| Rascunho                                                       | Ajuste                                                                                  |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Uma tabela `payment_methods` misturando tPag e regra comercial | `means_of_payment` é o tPag. `payment_methods` é a forma da empresa                     |
| `paymentTypeCode`                                              | `code` varchar(2), único                                                                |
| `description` varchar(60) no meio                              | `description` varchar(100). Os textos oficiais de 05 e 22 têm 68 e 73 caracteres        |
| `meansOfPaymentId` opcional                                    | Obrigatório. Toda forma tem um tPag                                                     |
| `acquirerId` varchar (CNPJ) e `acquirerId` uuid ao mesmo tempo | Só `acquirerId` uuid para `persons`. O CNPJ da NF-e é `persons.taxId`, sem máscara      |
| `integration_type` com valores `'1'` e `'2'`                   | `integrated` e `not_integrated`, mapeados para tpIntegra 1 e 2 na emissão               |
| `interestTypeEnum` declarado e `typeInterestEnum` usado        | Um enum, `payment_interest_type`                                                        |
| `rateInterestMonthly` e `administrativeFee` em `numeric(5, 2)` | `interestRateBps` e `administrativeFeeBps` em `integer`                                 |
| `numberOfInstallments` fixo, com exemplo “até 3x” gravando 3   | `payment_method_terms`: uma linha por quantidade permitida, com taxa daquela quantidade |
| `descricao` no seed                                            | Coluna `description`                                                                    |
| `relations` apontando a forma para ela mesma                   | Junção explícita, como o dashboard já faz. Este módulo não usa `relations()`            |
| Seed parado em 01–20, 91 e 99, com o texto antigo de 05 e 18   | Tabela do Informe Técnico 2024.002 v1.11, em produção desde 04/05/2026                  |

A carência e o intervalo saem da forma e vão para a condição. “Até 3x” com uma taxa única não representa o MDR do cartão, que muda a cada parcela. “Crediário 10x pela Tabela Price” é uma condição só, com `installmentCount = 10`.

## 1. Meio de pagamento (`means_of_payment`)

Catálogo global, estático, mantido por seed. É o campo `tPag` do grupo `detPag`.

```ts
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  pgEnum,
  pgTable,
  text,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/** Grupo fiscal que a emissão precisa preencher além do tPag. */
export const meansFiscalGroupEnum = pgEnum('means_fiscal_group', [
  'none',
  'card',
  'electronic',
  'other',
]);

export const meansOfPayment = pgTable(
  'means_of_payment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** tPag, dois dígitos. Ex.: 03, 17, 99. */
    code: varchar('code', { length: 2 }).notNull(),
    /** Texto oficial vigente. O maior hoje tem 73 caracteres. */
    description: varchar('description', { length: 100 }).notNull(),
    /** Observação do informe técnico. Ajuda a escolher 05, 21 e 99. */
    notes: text('notes'),
    /** none: só o tPag. card: grupo card. electronic: tpIntegra e id da transação, sem bandeira. other: xPag. */
    fiscalGroup: meansFiscalGroupEnum('fiscal_group').notNull(),
    /** Entra no select da forma comercial. 22 e 90 ficam fora. */
    isSelectable: boolean('is_selectable').default(true).notNull(),
    startsOn: date('starts_on').notNull(),
    endsOn: date('ends_on'),
  },
  (table) => [
    unique('means_of_payment_code_unique').on(table.code),
    check('means_of_payment_code_format', sql`${table.code} ~ '^[0-9]{2}$'`),
    check(
      'means_of_payment_description_not_blank',
      sql`length(trim(${table.description})) > 0`,
    ),
    check(
      'means_of_payment_validity',
      sql`${table.endsOn} is null or ${table.endsOn} >= ${table.startsOn}`,
    ),
  ],
);
```

`startsOn` e `endsOn` seguem `ncms`. Um código alterado pela SEFAZ atualiza a mesma linha. O seed faz upsert por `code`.

`fiscalGroup` evita espalhar lista de tPag pelo código:

| Grupo        | Códigos        | Efeito na emissão                                                           |
| ------------ | -------------- | --------------------------------------------------------------------------- |
| `card`       | 03, 04         | Grupo `card`: tpIntegra, CNPJ da credenciadora, tBand e cAut                |
| `electronic` | 17, 20, 23, 24 | tpIntegra e identificador da transação. Sem bandeira                        |
| `other`      | 99             | `xPag` obrigatório, de 2 a 60 caracteres, copiado de `payment_methods.name` |
| `none`       | demais         | Só o tPag                                                                   |

### Seed vigente

Fonte: Informe Técnico 2024.002 v1.11. Produção dos códigos 23 e 24 em 04/05/2026. O 91 entrou em 03/11/2025. O texto do 05 deixou de ser “Crédito de Loja”. O texto do 18 deixou de ser “Transferência bancária, Carteira Digital”.

| code | description                                                               | fiscalGroup | isSelectable | startsOn   |
| ---- | ------------------------------------------------------------------------- | ----------- | ------------ | ---------- |
| 01   | Dinheiro                                                                  | none        | sim          | 2020-01-01 |
| 02   | Cheque                                                                    | none        | sim          | 2020-01-01 |
| 03   | Cartão de Crédito                                                         | card        | sim          | 2020-01-01 |
| 04   | Cartão de Débito                                                          | card        | sim          | 2020-01-01 |
| 05   | Cartão da Loja (Private Label), Crediário Digital, Outros Crediários      | none        | sim          | 2020-01-01 |
| 10   | Vale Alimentação                                                          | none        | sim          | 2020-01-01 |
| 11   | Vale Refeição                                                             | none        | sim          | 2020-01-01 |
| 12   | Vale Presente                                                             | none        | sim          | 2020-01-01 |
| 13   | Vale Combustível                                                          | none        | sim          | 2020-01-01 |
| 14   | Duplicata Mercantil                                                       | none        | sim          | 2020-01-01 |
| 15   | Boleto Bancário                                                           | none        | sim          | 2020-01-01 |
| 16   | Depósito Bancário                                                         | none        | sim          | 2020-01-01 |
| 17   | Pagamento Instantâneo (PIX) - Dinâmico                                    | electronic  | sim          | 2020-01-01 |
| 18   | TED (Transferência Eletrônica Disponível)                                 | none        | sim          | 2020-01-01 |
| 19   | Programa de fidelidade, Cashback, Crédito Virtual                         | none        | sim          | 2020-01-01 |
| 20   | Pagamento Instantâneo (PIX) - Estático                                    | electronic  | sim          | 2024-07-01 |
| 21   | Crédito em Loja                                                           | none        | sim          | 2024-07-01 |
| 22   | Pagamento Eletrônico não Informado - falha de hardware do sistema emissor | none        | não          | 2024-07-01 |
| 23   | Pagamento Instantâneo (PIX) - Automático                                  | electronic  | sim          | 2026-05-04 |
| 24   | TEF - Book Transfer                                                       | electronic  | sim          | 2026-05-04 |
| 90   | Sem Pagamento                                                             | none        | não          | 2020-01-01 |
| 91   | Pagamento Posterior                                                       | none        | sim          | 2025-11-03 |
| 99   | Outros                                                                    | other       | sim          | 2020-01-01 |

`endsOn` fica nulo em todos. Notas que mudam a escolha do código:

- 05: crediário e private label. Cartão de loja bandeirado usa 03 ou 04.
- 17: QR Code ou URL dinâmicos. Há UF que exige o identificador da transação.
- 18: transferência entre bancos diferentes.
- 20: QR estático, chave Pix, ou agência e conta. A chave em si fica em `bank_accounts`, que já tem `pixKey`.
- 21: crédito da loja por adiantamento ou devolução. É consumo de saldo, distinto do crediário do 05.
- 22: contingência de hardware. Fica no catálogo para a NF-e e fora do cadastro comercial.
- 24: transferência entre contas do mesmo banco, via TEF.
- 90: documento sem pagamento. A entrada de NF-e já ignora esse tPag.
- 91: o pagamento ocorre depois da emissão. Cabe em ordem de serviço e em venda a faturar.
- 99: a descrição livre vai em `xPag`.

## 2. Forma de pagamento (`payment_methods`)

O que a empresa cadastra e o operador escolhe. Cada linha é um botão: “Dinheiro”, “PIX balcão”, “Crédito Stone”, “Crediário 10x”. Parcelas, juros e taxas ficam nas condições.

```ts
import { tenantColumns } from '@erp-360/mod-core';
import { persons } from '@erp-360/mod-persons';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  integer,
  pgEnum,
  pgTable,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { bankAccounts } from './bank_accounts.ts';
import { cardBrands } from './card_brands.ts';
import { meansOfPayment } from './means_of_payment.ts';

/** Para onde o valor vai no financeiro. */
export const paymentReceiptKindEnum = pgEnum('payment_receipt_kind', [
  'cash',
  'bank',
  'customer_receivable',
  'acquirer_receivable',
  'store_credit',
]);

/** tpIntegra: integrated = 1, not_integrated = 2. */
export const paymentIntegrationTypeEnum = pgEnum('payment_integration_type', [
  'integrated',
  'not_integrated',
]);

export const paymentMethods = pgTable(
  'payment_methods',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...tenantColumns,
    /** Atalho do PDV. Gravado em maiúsculas. Ex.: DIN, PIX, CREDITO. */
    code: varchar('code', { length: 15 }).notNull(),
    /** Rótulo do select e, no tPag 99, o xPag. Máximo fiscal do xPag: 60. */
    name: varchar('name', { length: 60 }).notNull(),
    meansOfPaymentId: uuid('means_of_payment_id')
      .notNull()
      .references(() => meansOfPayment.id, { onDelete: 'restrict' }),
    isActive: boolean('is_active').default(true).notNull(),
    receiptKind: paymentReceiptKindEnum('receipt_kind').notNull(),
    /**
     * Dias até o crédito da credenciadora quando o parcelado é do emissor
     * e existe um único título. Nas demais formas fica nulo e o vencimento
     * sai da condição.
     */
    settlementDays: integer('settlement_days'),
    integrationType: paymentIntegrationTypeEnum('integration_type'),
    /** Credenciadora. Pessoa da empresa com isFinancialInstitution. */
    acquirerId: uuid('acquirer_id'),
    /** Bandeira padrão. No TEF integrado pode nascer vazia e vir da captura. */
    cardBrandId: uuid('card_brand_id').references(() => cardBrands.id, {
      onDelete: 'restrict',
    }),
    /** Conta usada no PIX, no depósito e na liquidação do cartão. */
    bankAccountId: uuid('bank_account_id'),
    useInQuote: boolean('use_in_quote').default(true).notNull(),
    useInSale: boolean('use_in_sale').default(true).notNull(),
    useInPos: boolean('use_in_pos').default(true).notNull(),
    useInServiceOrder: boolean('use_in_service_order').default(true).notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
  },
  (table) => [
    unique('payment_methods_id_tenant_id_unique').on(table.id, table.tenantId),
    unique('payment_methods_tenant_code_unique').on(table.tenantId, table.code),
    unique('payment_methods_tenant_name_unique').on(table.tenantId, table.name),
    foreignKey({
      name: 'payment_methods_acquirer_tenant_fk',
      columns: [table.acquirerId, table.tenantId],
      foreignColumns: [persons.id, persons.tenantId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'payment_methods_bank_account_tenant_fk',
      columns: [table.bankAccountId, table.tenantId],
      foreignColumns: [bankAccounts.id, bankAccounts.tenantId],
    }).onDelete('restrict'),
    check(
      'payment_methods_code_format',
      sql`${table.code} ~ '^[A-Z0-9][A-Z0-9-]{0,14}$'`,
    ),
    check('payment_methods_name_not_blank', sql`length(trim(${table.name})) > 0`),
    check(
      'payment_methods_settlement_days_check',
      sql`${table.settlementDays} is null or ${table.settlementDays} between 0 and 365`,
    ),
    check(
      'payment_methods_settlement_days_kind_check',
      sql`${table.receiptKind} = 'acquirer_receivable' or ${table.settlementDays} is null`,
    ),
    check(
      'payment_methods_acquirer_kind_check',
      sql`${table.receiptKind} <> 'acquirer_receivable' or ${table.acquirerId} is not null`,
    ),
    check(
      'payment_methods_integrated_acquirer_check',
      sql`${table.integrationType} is distinct from 'integrated' or ${table.acquirerId} is not null`,
    ),
    check(
      'payment_methods_channel_check',
      sql`${table.useInQuote} or ${table.useInSale} or ${table.useInPos} or ${table.useInServiceOrder}`,
    ),
  ],
);
```

`receiptKind` diz o efeito financeiro. O `indPag` da NF-e sai da condição escolhida no documento, porque “à vista para o cliente” e “recebível da credenciadora” convivem no mesmo cartão.

| receiptKind           | Efeito                                                  | Exemplos de tPag     |
| --------------------- | ------------------------------------------------------- | -------------------- |
| `cash`                | Entra no caixa. Sem título                              | 01                   |
| `bank`                | Entra na conta informada. Sem título                    | 16, 18, 20, 24       |
| `customer_receivable` | Um título por parcela, contra o cliente                 | 02, 05, 14, 15, 91   |
| `acquirer_receivable` | Título contra a credenciadora, líquido lançado na baixa | 03, 04, 17 integrado |
| `store_credit`        | Consome saldo do cliente. Sem título novo               | 21                   |

O saldo de crédito do cliente ainda não existe. A forma com `store_credit` pode ser cadastrada. Orçamento, venda e PDV recusam confirmar esse pagamento enquanto o saldo não existir.

Regras que atravessam o meio e ficam na aplicação, porque o grupo fiscal está em outra tabela:

- Meio com `isSelectable = false` fica de fora da forma.
- `fiscalGroup = card`: `integrationType` preenchido. Em `not_integrated`, `cardBrandId` também. No integrado, bandeira e cAut vêm da captura e podem ficar vazios aqui.
- `fiscalGroup = electronic`: `integrationType` preenchido.
- `fiscalGroup = other`: `name` com 2 a 60 caracteres, porque esse texto vai em `xPag`.
- `integrated` exige adquirente com `isFinancialInstitution` e `taxId` de CNPJ com 14 dígitos.
- `receiptKind = bank` pede `bankAccountId` antes de usar a forma no PDV.
- Condição `issuer` em forma `acquirer_receivable` exige `settlementDays`, que é o vencimento do único título da credenciadora.

Troco só existe para o meio 01. Isso se deduz do código, sem coluna.

## 3. Condição (`payment_method_terms`)

Uma forma tem uma ou mais condições. A quantidade de parcelas é a quantidade que o operador pode escolher. O documento grava a condição escolhida.

```ts
import { tenantColumns } from '@erp-360/mod-core';
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  integer,
  pgEnum,
  pgTable,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { paymentMethods } from './payment_methods.ts';

/**
 * none: sem juros.
 * simple: juros simples da loja, taxa ao mês sobre o principal, vezes a quantidade.
 * price: Tabela Price, taxa ao mês.
 * flat: um percentual sobre o principal, sem multiplicar pela quantidade.
 * issuer: juros do emissor. A loja não altera o total da venda.
 */
export const paymentInterestTypeEnum = pgEnum('payment_interest_type', [
  'none',
  'simple',
  'price',
  'flat',
  'issuer',
]);

export const paymentMethodTerms = pgTable(
  'payment_method_terms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...tenantColumns,
    paymentMethodId: uuid('payment_method_id').notNull(),
    /** De 1 a 48. 1 é à vista quando firstDueDays também é 0. */
    installmentCount: integer('installment_count').notNull(),
    /** Dias até a primeira parcela. 0 = no dia da venda. */
    firstDueDays: integer('first_due_days').default(0).notNull(),
    /** Dias entre uma parcela e a seguinte. 0 somente quando a quantidade é 1. */
    intervalDays: integer('interval_days').default(0).notNull(),
    interestType: paymentInterestTypeEnum('interest_type').default('none').notNull(),
    /** 199 = 1,99%. Ao mês em simple e price. Sobre o principal em flat. */
    interestRateBps: integer('interest_rate_bps').default(0).notNull(),
    /** MDR da loja, uma vez, sobre o principal. 250 = 2,50%. */
    administrativeFeeBps: integer('administrative_fee_bps').default(0).notNull(),
    /**
     * Centavos por título. Se a forma não gera título, centavos do pagamento.
     * PIX de R$ 0,50 = 50. Boleto de R$ 2,00 por carnê = 200 em cada título.
     */
    fixedFeeAmount: integer('fixed_fee_amount').default(0).notNull(),
  },
  (table) => [
    unique('payment_method_terms_id_tenant_id_unique').on(table.id, table.tenantId),
    unique('payment_method_terms_method_count_unique').on(
      table.tenantId,
      table.paymentMethodId,
      table.installmentCount,
    ),
    foreignKey({
      name: 'payment_method_terms_method_tenant_fk',
      columns: [table.paymentMethodId, table.tenantId],
      foreignColumns: [paymentMethods.id, paymentMethods.tenantId],
    }).onDelete('cascade'),
    check(
      'payment_method_terms_installment_count_check',
      sql`${table.installmentCount} between 1 and 48`,
    ),
    check(
      'payment_method_terms_first_due_days_check',
      sql`${table.firstDueDays} between 0 and 365`,
    ),
    check(
      'payment_method_terms_interval_days_check',
      sql`(
        (${table.installmentCount} = 1 and ${table.intervalDays} = 0)
        or (${table.installmentCount} > 1 and ${table.intervalDays} between 1 and 365)
      )`,
    ),
    check(
      'payment_method_terms_interest_rate_check',
      sql`${table.interestRateBps} between 0 and 10000 and (
        (${table.interestType} in ('none', 'issuer') and ${table.interestRateBps} = 0)
        or (${table.interestType} in ('simple', 'price', 'flat') and ${table.interestRateBps} > 0)
      )`,
    ),
    check(
      'payment_method_terms_administrative_fee_check',
      sql`${table.administrativeFeeBps} between 0 and 10000`,
    ),
    check('payment_method_terms_fixed_fee_check', sql`${table.fixedFeeAmount} >= 0`),
  ],
);
```

Gravar a forma e ao menos uma condição na mesma transação. A exclusão da forma remove as condições. Documento já emitido referencia a forma com `onDelete: restrict`, então forma usada não sai.

O vencimento da parcela k, com k a partir de 1, é a data da venda mais `firstDueDays + (k - 1) * intervalDays`.

| Condição                   | count       | firstDueDays              | intervalDays              | interestType   | interestRateBps |
| -------------------------- | ----------- | ------------------------- | ------------------------- | -------------- | --------------- |
| À vista                    | 1           | 0                         | 0                         | none           | 0               |
| Boleto 30/60/90            | 3           | 30                        | 30                        | none           | 0               |
| Entrada + 30 + 60          | 3           | 0                         | 30                        | none           | 0               |
| Crediário 10x a 1,99% a.m. | 10          | 30                        | 30                        | price          | 199             |
| Cartão 1x, 2x e 3x         | três linhas | 0 na de 1x; 30 nas outras | 0 na de 1x; 30 nas outras | none ou issuer | 0               |

Juros e taxa administrativa são contas diferentes. O juros de `simple`, `price` e `flat` aumenta o total do cliente. A taxa administrativa e o `fixedFeeAmount` são custo da loja: o título nasce pelo valor bruto e a despesa entra na baixa. No `issuer`, o total da venda permanece o principal e a loja recebe um título da credenciadora.

Quantidade de títulos:

- `customer_receivable`: um título por parcela da condição.
- `acquirer_receivable` com `issuer`: um título, vencimento em `settlementDays`. A quantidade da condição só vai impressa para o cliente.
- `acquirer_receivable` com outro juros: um título por parcela, nas datas da condição. É o parcelado lojista, ainda sem o calendário real da credenciadora.
- `cash`, `bank` e `store_credit`: nenhum título.

`indPag` na emissão, a partir da condição escolhida: 0 quando `installmentCount = 1` e `firstDueDays = 0`. Nos outros casos, 1. O cartão em 1x para o cliente continua 0, mesmo que a loja receba em D+30.

## 4. O que o documento grava

Orçamento, venda, PDV e ordem de serviço apontam para `payment_methods` e para a quantidade escolhida, que precisa existir em `payment_method_terms`. A especificação da ordem de serviço hoje trata `payment_methods` como o meio e limita a condição a 12. Na ordem, `paymentMethodId` passa a ser a forma comercial. O tPag é o `meansOfPaymentId` dessa forma. O teto de parcelas passa a ser o da condição, até 48.

Cada pagamento do documento copia os números da condição no momento da escolha. Taxa ou adquirente alterados depois valem para os pagamentos seguintes. A cópia leva:

- `paymentMethodId` e `meansOfPaymentId`
- `installmentCount`, `interestType`, `interestRateBps`, `administrativeFeeBps`, `fixedFeeAmount`
- `firstDueDays` e `intervalDays`
- `receiptKind`, `integrationType`, `acquirerId`, `cardBrandId`
- na captura: cAut, identificador da transação e a bandeira devolvida pelo TEF, quando vierem

Ainda não existe tabela de pagamento de venda nem de parcelas geradas a partir daqui. O que já existe, e serve de modelo da cópia, é `inbound_document_installments`: número, vencimento, valor em centavos e o título gerado. `receivables` já guarda bandeira, autorização, instituição financeira e valor da parcela.

## 5. Recebíveis e catálogo já publicados

`receivables.payment_method_id` hoje aponta para o tPag. Na mesma migração do rename:

- a tabela `payment_methods` vira `means_of_payment`
- `payment_type_code` vira `code`
- `description` passa de varchar(60) para varchar(100)
- `receivables.payment_method_id` vira `means_of_payment_id`

Entram, nulos, `receivables.payment_method_id` para a forma comercial e as colunas novas do meio (`notes`, `fiscal_group`, `is_selectable`, `starts_on`, `ends_on`). Título lançado à mão continua podendo ter só o meio.

O catálogo de meios fica em `GET /means-of-payment` e devolve `code` e `description`, só os códigos selecionáveis e vigentes. `GET /payment-methods` fica livre para a forma comercial. O rótulo do meio na interface é `${code} - ${description}`.

O rename ficou em `packages/modules/financial/src/db/means_of_payment.ts`, `receivables.ts`, `packages/shared/src/financialContracts.ts`, `apps/api/src/modules/plan-accounts/financial-catalogs.ts`, `apps/api/src/modules/dashboard/dashboard.ts` e o select de recebíveis na interface.

## 6. Exemplos

Dinheiro e a condição à vista nascem na mesma transação:

```ts
const [method] = await db
  .insert(paymentMethods)
  .values({
    tenantId,
    code: 'DIN',
    name: 'Dinheiro',
    meansOfPaymentId: dinheiroId, // code 01
    receiptKind: 'cash',
  })
  .returning({ id: paymentMethods.id });

await db.insert(paymentMethodTerms).values({
  tenantId,
  paymentMethodId: method.id,
  installmentCount: 1,
  firstDueDays: 0,
  intervalDays: 0,
});
```

PIX de balcão, meio 20, sem integração:

```ts
await db.insert(paymentMethods).values({
  tenantId,
  code: 'PIX',
  name: 'PIX balcão',
  meansOfPaymentId: pixEstaticoId,
  receiptKind: 'bank',
  integrationType: 'not_integrated',
  bankAccountId,
});
```

Crédito com três condições e MDR diferente. A descrição “até 3x” fica no nome. O 3 não é uma coluna da forma.

```ts
await db.insert(paymentMethodTerms).values([
  {
    tenantId,
    paymentMethodId,
    installmentCount: 1,
    firstDueDays: 0,
    intervalDays: 0,
    administrativeFeeBps: 250,
  },
  {
    tenantId,
    paymentMethodId,
    installmentCount: 2,
    firstDueDays: 30,
    intervalDays: 30,
    administrativeFeeBps: 299,
  },
  {
    tenantId,
    paymentMethodId,
    installmentCount: 3,
    firstDueDays: 30,
    intervalDays: 30,
    administrativeFeeBps: 350,
  },
]);
```

Crediário em 10x a 1,99% ao mês pela Tabela Price. A taxa vai em basis points. 199 representa 1,99%.

```ts
await db.insert(paymentMethodTerms).values({
  tenantId,
  paymentMethodId,
  installmentCount: 10,
  firstDueDays: 30,
  intervalDays: 30,
  interestType: 'price',
  interestRateBps: 199,
});
```

Consulta da tela, com o tPag junto:

```ts
await db
  .select({
    id: paymentMethods.id,
    code: paymentMethods.code,
    name: paymentMethods.name,
    meansCode: meansOfPayment.code,
    meansDescription: meansOfPayment.description,
  })
  .from(paymentMethods)
  .innerJoin(meansOfPayment, eq(meansOfPayment.id, paymentMethods.meansOfPaymentId))
  .where(
    and(
      eq(paymentMethods.tenantId, tenantId),
      eq(paymentMethods.isActive, true),
      eq(paymentMethods.useInPos, true),
    ),
  )
  .orderBy(paymentMethods.sortOrder, paymentMethods.name);
```

## 7. Evolução posterior

Ficam fora deste cadastro, para não antecipar tabela sem uso:

- Taxa de antecipação da credenciadora. É decisão de caixa, por título, e varia com os dias antecipados.
- Vencimento irregular, do tipo 7/21/45. O intervalo fixo cobre à vista, 30/60/90 e entrada mais parcelas. O dia avulso pede uma lista de prazos na condição.
- Calendário real da credenciadora, como D+14 e D+30 por parcela. O parcelado lojista usa, por enquanto, as datas da condição.
- Ledger do crédito em loja, que destrava o `receiptKind = store_credit`.
- Conta do plano para a despesa da taxa. A configuração financeira da empresa já tem as contas globais de caixa, desconto e multa.
- Condição de pagamento a fornecedor. `payables` não usa este cadastro.
