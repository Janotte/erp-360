# Vínculo do item, margem e preço de lista

Implementado em `master`, fast-forward até `6669309`. A conferência na tela continua em aberto.

## Objetivo

A nota de entrada ganha uma página só para vincular o item, informar o fator e simular margem e preço de lista. A grade da nota continua com quantidade, CFOP e valores. Margem e preço deixam de ser um acréscimo sobre o custo e passam a ser a fatia do preço de venda.

Esta entrega é a tela que a spec da lista e do formulário deixou de fora. O de-para `supplier_item_links` continua gravando item, unidade e fator. Margem e preço de lista continuam no cadastro do item (`catalog_items.gross_margin` e `catalog_items.list_price`). Não há memória nova de preço por fornecedor.

## Conta

A quantidade de estoque da linha é a quantidade comercial vezes o fator. O custo da entrada é o custo unitário que o lançamento já calcula em `lineUnitCost`: valor da linha, com frete, seguro, outras despesas, desconto, IPI, ST e ICMS conforme as flags da natureza, dividido pela quantidade de estoque.

O custo médio projetado percorre as linhas daquele item em ordem de número, com `nextAverage`, a partir do saldo e do custo médio atuais. Sem saldo, o custo médio projetado é o custo da entrada. Duas linhas do mesmo item entram na mesma média. Linha sem item não entra em média nenhuma.

Exemplo: 10 × 50,00 mais 20 × 65,00 dá 1.800,00 para 30 unidades, custo médio 60,00.

A margem é percentual do preço de venda, com 4 casas. O preço de lista tem 4 casas, o mesmo arredondamento de `round4`.

- Informar a margem recalcula o preço: preço = custo médio / (1 − margem / 100). 45% sobre 60,00 dá 109,0909.
- Informar o preço recalcula a margem: margem = (1 − custo médio / preço) × 100. 109,0909 sobre 60,00 dá 45,0000.
- O último campo editado manda. Se nenhum dos dois foi editado nesta visita, a margem é a fonte e o preço é derivado. Ao reabrir, a margem do override ou a margem do item volta a ser a fonte.
- Mudar o fator recalcula o custo da entrada e o custo médio projetado, e em seguida o campo que não foi o último editado.
- Custo médio zero não recalcula. A margem pode ser informada e o preço fica vazio.

Margem negativa e margem de 100% ou mais são rejeitadas. Preço menor que o custo médio usado na conta também, porque a margem ficaria negativa. Preço igual ao custo médio é margem zero e é válido.

Uma margem já gravada muda de leitura: 45% deixa de significar custo × 1,45 e passa a significar 45% do preço de venda. Isso vale no próximo lançamento que recalcula o preço e quando alguém edita margem ou preço no cadastro do item. Abrir o cadastro e salvar sem editar esses dois campos não reescreve o par.

## Página

Rota `/inbound/:id/vinculos`, componente `FormInboundLinks`. O botão **Vínculos** fica na seção Itens de `FormInbound`. **Voltar** retorna a `/inbound/:id` com o mesmo `location.state.from` da lista.

Situações editáveis: `pending`, `pre_note` e `divergent`. `posted`, `reversed` e `ignored` abrem a página só para leitura: margem e preço vêm do item, fator e vínculo vêm das linhas, e o custo médio projetado não é recalculado, porque o estoque já inclui a nota. Nota `discovered` não mostra o botão; a rota volta para a nota.

Se a nota no formulário estiver suja, o aviso atual (salvar, descartar ou continuar editando) aparece antes de abrir a página. A página tem o mesmo aviso ao voltar suja.

Cada item vinculado é um grupo:

- Código e nome do item.
- Saldo atual, custo médio atual, quantidade desta nota e custo médio projetado, somente leitura.
- Margem (%) e preço de lista, editáveis nas situações editáveis. Os dois se recalculam como na conta acima, usando o custo médio projetado.
- Linhas do grupo: número, código do fornecedor, descrição, unidade, quantidade comercial, fator e custo da entrada. O fator é editável. O custo da entrada acompanha o fator.

Linhas sem `itemId` ficam no grupo **Sem vínculo**, com busca de item, fator e o lápis de cadastrar item. Ao escolher o item, a linha entra no grupo dele e a média dos dois lados é recalculada.

Na grade de `FormInbound`, item vinculado e fator passam a ser somente leitura. Saem da grade a busca, a edição do fator e o lápis. Quantidade, CFOP, unitário, total e excluir de nota manual permanecem na grade.

Quando a natureza não sugere preço de lista ou não atualiza o custo médio, a página mostra a simulação e avisa que o lançamento não altera o preço de lista.

## O que grava

**Salvar**, na página ou na nota, grava vínculo e fator como hoje: linhas do rascunho e `supplier_item_links`. Não altera `list_price` nem `gross_margin` do item.

A margem ajustada fica no rascunho, uma por item, na tabela `inbound_pricing_overrides` (`tenant_id`, `document_id`, `item_id`, `gross_margin` nulo), com chave única em tenant, nota e item. A presença da linha significa que alguém mexeu naquele item nesta nota. Salvar rejeita margem negativa ou maior ou igual a 100. Margem nula é o valor apagado e é válida.

- Sem linha: no lançamento vale a margem que o item já tem.
- Linha com margem: no lançamento essa margem substitui a do item.
- Linha com margem nula: a margem foi apagada. No lançamento a margem do item fica nula e o preço de lista não muda.

Salvar sem editar margem nem preço não cria linha. Editar o preço grava a margem derivada, não o preço. Se o item some da nota, a linha de override daquele item sai no salvar. O salvar da nota preserva os overrides dos itens que continuam nela.

**Lançar** atualiza estoque e custo médio como hoje. Em seguida, por item:

1. Se existe override, grava essa margem no item. Nula zera a margem.
2. Sem override, usa a margem que o item já tem.
3. Recalcula o preço de lista só quando a natureza sugere preço, a natureza atualiza o custo médio, o item controla estoque, a margem usada não é nula e o custo médio resultante é maior que zero. O preço usa o custo médio que o estoque ficou, não o custo da linha: preço = custo médio / (1 − margem / 100).
4. Há uma atualização de preço por item, depois de todas as linhas dele. O lançamento deixa de gravar um preço por linha a partir do custo da linha.

O preço visto na página é simulação. Se o saldo mudar antes do lançamento, o preço gravado acompanha o custo médio real e a margem que ficou no rascunho.

## Cadastro do item

`FormItem` usa a mesma conta, com o custo médio atual do item no lugar do custo médio projetado. Ao editar a margem, o preço é recalculado. Ao editar o preço, a margem é recalculada. Sem custo médio, ou com custo médio zero, os dois campos continuam editáveis e não se recalculam.

O texto de ajuda deixa de dizer que o preço sugerido é o custo da nota vezes um mais a margem. Passa a dizer que, havendo custo médio, o preço de lista é esse custo dividido por um menos a margem.

A API do item rejeita margem menor que zero ou maior ou igual a 100, com a mensagem `Informe a margem bruta entre 0 e 100, sem incluir 100.` A restrição `catalog_items_gross_margin_check` passa a exigir margem nula ou margem maior ou igual a zero e menor que 100. O preço de lista continua maior ou igual a zero.

## Fórmula compartilhada

`round4`, `CostFlags`, `LineAmounts`, `lineUnitCost`, `nextAverage`, `projectedAverage`, `listPriceFromMargin(average, marginPercent)`, `marginFromListPrice(average, price)` e `syncPricing` ficam em `packages/shared/src/utils/pricing.ts` e saem por `@erp-360/shared`.

`cost.ts` reexporta `CostFlags`, `LineAmounts`, `round4`, `lineUnitCost` e `nextAverage`. O lançamento importa `listPriceFromMargin` de `@erp-360/shared`.

A página usa `packages/shared/src/utils/inboundPricing.ts`: `entryUnitCost`, `projectedAverageForItem`, `recomputePricing`, `editPricingMargin` e `editPricingPrice`. O `GET /:id` devolve frete, seguro, outras despesas, desconto, IPI, ST e ICMS da linha para essa conta. O cadastro do item usa `syncPricing`.

## Testes

Em `pricing.test.ts`, com o exemplo desta spec:

- 10 a 50,00 e entrada de 20 a 65,00 produzem custo médio 60,00.
- Margem 45% produz preço 109,0909.
- Preço 109,0909 produz margem 45,0000.
- Margem 100 e preço abaixo do custo médio retornam nulo.

Em `inboundPricing.test.ts`:

- Com a natureza levando o ST ao custo, 20.000 centavos de ST sobem o custo da entrada de 65 para 75 e o custo médio projetado de 60 para 66,6667.
- Editar o preço para 120,0000 grava a margem `50.0000`.
- Preço abaixo do custo médio mantém o override anterior.
- Margem vazia grava override nulo.
- Mudar o fator recalcula o custo da entrada.

No lançamento, com natureza que sugere preço e atualiza custo médio:

- Salvar a página não muda o preço de lista do cadastro.
- Lançar com margem ajustada grava essa margem e o preço 109,0909 pelo custo médio real.
- Sem override, o lançamento usa a margem que o item já tem e recalcula o preço.
- Item sem margem não muda o preço.
- Override com margem nula zera a margem do item e não muda o preço.
- Duas linhas do mesmo item entram numa média só e num preço só.
- Natureza que não sugere preço grava a margem ajustada e não muda o preço de lista.

A API do item recusa margem negativa e margem de 100% ou mais, com a mensagem da faixa. Texto que não é número continua com a mensagem de casas decimais.

## Fora deste trabalho

Preço diferente por fornecedor. Recalcular o cadastro inteiro por causa da nova leitura da margem. Alterar DANFE, pagamento, CFOP ou a lista de entradas. Gravar o preço de lista antes do lançamento.
