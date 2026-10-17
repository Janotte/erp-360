# Plano de contas para balanço e DRE

## Objetivo

O plano de contas passa a sustentar dois demonstrativos. O balanço totaliza pelo grupo patrimonial. A DRE totaliza por uma linha de resultado fixa. Subtotais como receita líquida, lucro bruto e lucro líquido são calculados. Eles não são contas.

O cadastro de hoje guarda um único tipo operacional: `revenue`, `expense`, `bank` ou `withdrawal`, em `packages/modules/financial/src/db/plan_accounts.ts`. Esse tipo classifica o movimento de caixa. Ele não separa custo de despesa, nem dedução de despesa operacional, nem conta patrimonial de conta de resultado.

A hierarquia continua em `parentAccountCode`. O código da conta tem até 15 caracteres e comporta níveis como `1.1.01.001`.

## Dois campos de classificação

Cada conta ganha `nature`. Conta de receita ou de despesa ganha também `dreLine`. Conta patrimonial deixa `dreLine` vazio.

### Natureza

A natureza define o grupo do balanço e o saldo normal.

| Valor | Grupo | Saldo normal |
|---|---|---|
| `asset` | Ativo | Devedor |
| `liability` | Passivo | Credor |
| `equity` | Patrimônio líquido | Credor |
| `revenue` | Receita | Credor |
| `expense` | Custo e despesa | Devedor |

### Linha da DRE

| Valor | Onde entra |
|---|---|
| `gross_revenue` | Faturamento bruto |
| `deduction` | Impostos sobre a receita, devoluções e abatimentos |
| `cost` | CMV e CSP |
| `operating_expense` | Despesas administrativas, comerciais e de pessoal |
| `financial_income` | Juros e outros rendimentos financeiros |
| `financial_expense` | Tarifas, IOF e juros pagos |
| `other_income` | Outras receitas |
| `other_expense` | Outras despesas |

`dreLine` só existe quando `nature` é `revenue` ou `expense`. Nas demais naturezas o campo fica vazio.

Receita usa `gross_revenue`, `financial_income` ou `other_income`. Despesa usa `deduction`, `cost`, `operating_expense`, `financial_expense` ou `other_expense`.

### Conta que recebe lançamento

`acceptsEntries` marca a conta analítica. Só ela recebe lançamento. A conta sintética agrupa as filhas pelo `parentAccountCode` e o saldo dela é a soma dos filhos.

## Fórmula da DRE

A ordem é fixa. O agrupamento pelo pai serve para abrir o detalhe de cada linha. Ele não redefine o subtotal.

```text
Receita líquida        = gross_revenue − deduction
Lucro bruto            = Receita líquida − cost
Resultado operacional  = Lucro bruto − operating_expense
Resultado financeiro   = financial_income − financial_expense
Lucro líquido          = Resultado operacional + Resultado financeiro
                         + other_income − other_expense
```

## O que fica fora da DRE

O lucro líquido do período é transferido, no encerramento, para a conta **Lucros acumulados** (`equity`). As contas de resultado zeram nesse lançamento. O valor não entra no caixa por ser lucro.

A retirada dos sócios usa a conta **Distribuição de lucros** (`equity`). Ela reduz lucros acumulados e o caixa. Não tem `dreLine`. Com a contabilidade regular, esse valor é a distribuição isenta de imposto de renda. O tipo `withdrawal` de hoje corresponde a essa conta.

O Fator R decide o anexo do Simples Nacional da receita (Anexo III ou Anexo V). Ele é atributo da conta de receita, ou do documento de faturamento, no campo `taxAnnex`. A alíquota efetiva define o valor lançado na conta de DAS. A linha da DRE dessa conta continua `deduction`.

## Migração dos tipos atuais

| Tipo atual | Natureza | Linha da DRE |
|---|---|---|
| `revenue` | `revenue` | `gross_revenue`, salvo quando a conta for financeira ou outra receita |
| `expense` | `expense` | escolhida conta a conta: `cost`, `deduction`, `operating_expense` ou `financial_expense` |
| `bank` | `asset` | vazio |
| `withdrawal` | `equity` | vazio |

Conta que era `bank` também fica com `isTreasury` verdadeiro. As demais ficam com `isTreasury` falso. A tela de conta bancária lista só contas ativas, analíticas e com esse marcador. Natureza `asset` sozinha inclui clientes e estoque, então o marcador preserva o filtro da tesouraria. Ele só pode ser verdadeiro em conta de ativo. No formulário, o campo aparece como "Conta de caixa ou banco".

A tarifa de cartão entra em `operating_expense` quando a empresa a trata como despesa comercial. A mesma conta passa a `financial_expense` quando a empresa a quer no resultado financeiro. A fórmula não muda.

## Exemplo de um mês

Empresa no Simples Nacional. Faturamento híbrido: R$ 20.000,00 de comércio (Anexo I, alíquota efetiva 4%) e R$ 50.000,00 de serviços (R$ 25.000,00 de hospedagem e R$ 25.000,00 de licenciamento, Anexo III, alíquota efetiva 6%).

| Conta | Natureza | Linha | Valor |
|---|---|---|---|
| Vendas de comércio | `revenue` | `gross_revenue` | 20.000,00 |
| Hospedagem | `revenue` | `gross_revenue` | 25.000,00 |
| Licenciamento de software | `revenue` | `gross_revenue` | 25.000,00 |
| DAS sobre comércio | `expense` | `deduction` | 800,00 |
| DAS sobre serviços | `expense` | `deduction` | 3.000,00 |
| CMV — reposição de estoque | `expense` | `cost` | 10.000,00 |
| CSP — licenças para revenda | `expense` | `cost` | 8.000,00 |
| Salários, pró-labore, aluguel, luz e taxas de cartão | `expense` | `operating_expense` | 25.000,00 |
| Juros recebidos | `revenue` | `financial_income` | reduz a perda de 350,00 |
| Tarifas e IOF | `expense` | `financial_expense` | compõe a perda de 350,00 |

Resultado calculado:

| Linha | Valor |
|---|---|
| Faturamento bruto | 70.000,00 |
| Impostos (DAS) | 3.800,00 |
| Receita líquida | 66.200,00 |
| Custos (CMV + CSP) | 18.000,00 |
| Lucro bruto | 48.200,00 |
| Despesas operacionais | 25.000,00 |
| Resultado financeiro líquido | −350,00 |
| Lucro líquido | 22.850,00 |

A margem líquida sobre o faturamento bruto é 32,6% (22.850 / 70.000). Os R$ 22.850,00 vão para **Lucros acumulados**. A ida desse valor para a conta bancária dos sócios é lançamento de **Distribuição de lucros**, fora da DRE.

## Esboço do plano

```text
1   Ativo                         asset
1.1   Caixa e bancos              asset, acceptsEntries
1.2   Clientes                    asset
1.3   Estoques                    asset
2   Passivo                       liability
2.1   Fornecedores                liability
2.2   Impostos a recolher         liability
2.3   Obrigações com pessoal      liability
3   Patrimônio líquido            equity
3.1   Capital social              equity
3.2   Lucros acumulados           equity
3.3   Distribuição de lucros      equity, acceptsEntries
4   Receitas                      revenue
4.1   Receita bruta de vendas     revenue, gross_revenue
4.2   Receita bruta de serviços   revenue, gross_revenue
4.3   Deduções da receita         expense, deduction
4.4   Receitas financeiras        revenue, financial_income
5   Custos e despesas             expense
5.1   Custos                      expense, cost
5.2   Despesas operacionais       expense, operating_expense
5.3   Despesas financeiras        expense, financial_expense
```

Os nós numerados só com o grupo são sintéticos. As contas que recebem título, cliente, fornecedor, DAS, folha ou banco são analíticas, filhas desses nós.

## DRE pelo caixa

`GET /financial/income-statement?from=YYYY-MM-DD&to=YYYY-MM-DD` soma, no período, os movimentos de caixa e de banco cuja conta tem `dreLine`.

O valor de uma conta de receita é entrada menos saída. O valor de uma conta de despesa é saída menos entrada. A fórmula dos subtotais é a deste documento. Conta sem linha, saldo inicial e transferência entre caixa e banco ficam de fora.

Quando a baixa lança a diferença numa conta do plano, o título recebe o valor devido e a conta da diferença recebe o que falta ou o que excede. No cartão, a receita fica com o valor da nota e a tarifa sai na conta de despesa. O caixa ou o banco movimenta só o líquido. Sem essa conta de diferença, o valor liquidado permanece inteiro na conta do título.

## Saldo no plano de contas

A listagem calcula o saldo a partir dos movimentos de caixa e de banco ligados à conta. Receita, passivo e patrimônio usam entradas menos saídas. Despesa e ativo usam saídas menos entradas. A conta sintética soma as filhas da mesma natureza pelo código do pai.

Receita e despesa usam o mês corrente. Ativo, passivo e patrimônio acumulam desde o início. Saldo inicial e transferência entre caixa e banco ficam de fora. O saldo de caixa e de banco continua na tesouraria, porque a baixa classifica o valor na conta do título.

## Fora deste desenho

O encerramento do período em lucros acumulados e a distribuição de lucros ficam para quando houver lançamento contábil.
