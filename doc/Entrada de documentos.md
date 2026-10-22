# Entrada de documentos fiscais

Especificação do recebimento de mercadorias e serviços. A natureza de operação é a regra. O documento descreve a nota e guarda uma cópia dos marcadores no momento da efetivação. Alterar a natureza, o de-para ou o preço de lista depois não reescreve uma nota já lançada.

O módulo atende média e grande empresa, mas entra em etapas. Ordem de compra, centro de custo, lote, NFS-e, CT-e e SPED estão desenhados aqui e não existem no sistema hoje.

## O que o sistema já faz

| Peça | Uso na entrada |
| --- | --- |
| Item | Código de 6 dígitos, SKU, NCM, GTIN, tipo fiscal do SPED, medida obrigatória, preço de lista com 4 casas, marcador "controla estoque". Serviço e ativo imobilizado nascem sem estoque. |
| Pessoa | CNPJ com 14 dígitos, único na empresa. O nome também é único. Papel de fornecedor é um marcador, não um cadastro separado. |
| Contas a pagar | Fornecedor, documento, emissão, vencimento e valor em centavos. Plano de contas opcional. Estorno só é seguro se o título continuar pendente. |
| Emitente | CNPJ, CRT e UF da empresa. A UF escolhe a SEFAZ. O CRT sugere se IPI e substituição tributária compõem o custo. |
| Certificado A1 | Assina a manifestação e a consulta de documentos na SEFAZ. A senha não sai da API. |

## Etapas

| Etapa | Entrega |
| --- | --- |
| 1 | NF-e modelo 55 por upload ou lançamento manual. Rascunho, de-para, natureza, custo médio, estoque de um depósito e contas a pagar. |
| 2 | Distribuição DF-e e manifestação do destinatário com o certificado. |
| 3 | CT-e rateado no custo das notas que ele cobre. |
| 4 | NFS-e no padrão nacional. XML municipal fica como arquivo anexado, sem leitura automática. |
| 5 | Ordem de compra, tolerância de preço e quantidade, centro de custo e lote com validade. |
| 6 | Exportação fiscal a partir dos fatos já gravados na nota e no estoque. |

## 1. Arquitetura e processamento

Há uma caixa de entrada e um documento. A caixa recebe bytes. O documento é o rascunho que o usuário completa. Nenhum adaptador aplica estoque ou financeiro.

```text
upload manual ─┐
DF-e / SEFAZ ──┼─► caixa de entrada ─► validação ─► rascunho ─► efetivação
API externa ───┘                         │
                                         └─► rejeitado, sem rascunho
```

### Canais

| Canal | Etapa | Comportamento |
| --- | --- | --- |
| Upload de XML | 1 | O usuário envia o `procNFe`. O original é gravado sem alteração. |
| Lançamento manual | 1 | Não há arquivo nem assinatura. O usuário informa fornecedor, itens, totais e parcelas. |
| Distribuição DF-e | 2 | O certificado de produção consulta a SEFAZ. Resumo sem itens não vira rascunho. Ciência da operação é o que libera o XML completo. |
| Arquivei, Qive e equivalentes | 2 | O conector só entrega o mesmo XML para a caixa de entrada. A regra de negócio não muda com o fornecedor da API. |

A chave de 44 dígitos, por empresa, identifica a nota, inclusive depois do estorno. O mesmo arquivo não reabre um documento estornado. O hash SHA-256 dos bytes originais prova que o arquivo guardado não foi editado. Duas cópias com a mesma chave e hash diferente continuam sendo a mesma nota; o sistema guarda a primeira e registra a divergência de hash.

### Tipos de documento

| Tipo | Modelo | Leitura |
| --- | --- | --- |
| NF-e | 55 | Grupos `emit`, `dest`, `det`, `total`, `cobr` e `infProt`. NFC-e não entra. |
| CT-e | 57 | Tomador, valor da prestação, documentos transportados e CFOP. O custo é rateado nas NF-e vinculadas. |
| NFS-e nacional | padrão nacional | Prestador, serviço, valor, retenções e competência. |
| NFS-e municipal | layout da prefeitura | Só o arquivo e os campos digitados. Não há um leitor único para todos os municípios. |

### Validação antes de gravar

1. O XML é bem formado.
2. O modelo é o esperado para o canal.
3. A chave informada no XML é a mesma calculada pelo conteúdo, com 44 dígitos.
4. O CNPJ do destinatário é o CNPJ do emitente da empresa. Outra empresa não entra.
5. O CNPJ do emissor do XML é um CNPJ válido e será o fornecedor.
6. NF-e e CT-e importados têm assinatura XML e protocolo de autorização. Sem protocolo, o arquivo pode ser guardado, mas o rascunho nasce com o aviso "sem protocolo" e não efetiva.
7. Nota cancelada ou denegada no protocolo não gera rascunho lançável.
8. Quantidade comercial menor ou igual a zero é rejeitada na linha.

A validação completa do XSD oficial é uma conferência adicional. Ela não substitui o protocolo: a SEFAZ já autorizou a nota. Falha de XSD em grupo opcional vira aviso. Falha nos grupos obrigatórios acima rejeita o arquivo.

O lançamento manual não passa por assinatura. Passa pelas mesmas regras de fornecedor, itens, totais e parcelas.

## 2. Regras de negócio

### Situações do documento

| Situação | Significado | Pode efetivar |
| --- | --- | --- |
| Pendente | XML ou resumo chegou e ainda falta fornecedor, item ou manifestação mínima. | Não |
| Pré-nota | Rascunho em edição. | Só se não houver divergência bloqueante |
| Divergente | Total, de-para, destinatário, parcela ou ordem de compra fora da tolerância. | Não |
| Lançada | Efetivada. Estoque e pagar já foram gerados. | Não |
| Estornada | Quantidade, custo e títulos pendentes foram desfeitos. A chave continua ocupada. | Não |
| Ignorada | Desconhecimento ou operação não realizada. | Não |

A efetivação é uma transação. O segundo clique encontra a nota já lançada e não soma o estoque de novo. O item movimentado é travado dentro dessa transação antes de ler quantidade e custo.

### Manifestação do destinatário

A manifestação usa o certificado A1 de produção e fica fora da transação de efetivação. O evento guarda código, protocolo, data e justificativa. Falha de comunicação não desfaz a nota.

| Evento | Código | Quando |
| --- | --- | --- |
| Ciência da emissão | 210210 | Automática ao armazenar a NF-e completa em que a empresa é destinatária, se ainda não houver evento. Não confirma a compra. |
| Confirmação da operação | 210200 | Depois da efetivação, por ação de quem lança. Uma política da empresa pode disparar a confirmação ao lançar. Nunca na importação. |
| Desconhecimento da operação | 210220 | Ação explícita, com justificativa de 15 a 255 caracteres. A nota vai para Ignorada. |
| Operação não realizada | 210240 | Ação explícita, com justificativa. A nota vai para Ignorada. Se já estiver lançada, é preciso estornar antes. |

Resumo sem itens (`resNFe`) fica Pendente, só com a chave, o emitente e o valor. Não há linha, estoque nem pagar.

### Fornecedor

1. Buscar a pessoa pelo CNPJ de 14 dígitos.
2. Se existir e ainda não for fornecedor, marcar o papel de fornecedor.
3. Se estiver inativa, a nota fica divergente até alguém reativar a pessoa. O sistema não cria outra.
4. Se não existir, a pré-nota propõe a criação com razão social, inscrição estadual e endereço do XML. O nome segue a capitalização já usada no cadastro de pessoas. Se esse nome já existir em outra pessoa, quem lança escolhe a pessoa ou ajusta o nome. O cadastro recusa nome repetido.

### De-para de produto

A associação é por fornecedor e código do fornecedor (`cProd`). Em seguida, pelo código de barras, quando o XML não trouxer `SEM GTIN`. A NCM só sugere itens parecidos. Não escolhe sozinha.

O vínculo guarda a unidade do fornecedor e o fator para a unidade do item. Quantidade de estoque = quantidade comercial do XML × fator. Uma caixa com fator 12 entra como 12 unidades. Sem fator, medida ou tipo fiscal, a linha permanece pendente e a nota não efetiva.

Item novo não é gravado no catálogo até alguém informar medida e tipo fiscal. Serviço entra como serviço e não movimenta estoque, mesmo que a natureza peça movimento: o marcador do item prevalece quando diz que não controla estoque.

### Natureza de operação

Cada natureza tem direção e marcadores. A direção de toda compra é Entrada. Saída fica para a venda, na mesma tabela, e não recalcula custo.

| Marcador | Revenda | Industrialização | Consumo | Imobilizado | Serviço |
| --- | --- | --- | --- | --- | --- |
| Movimenta estoque | sim | sim | não | não | não |
| Gera contas a pagar | sim | sim | sim | sim | sim |
| Atualiza custo médio | sim | sim | não | não | não |
| Grava preço de entrada | sim | sim | não | não | não |
| Sugere preço de lista | sim | não | não | não | não |
| Plano de contas | estoque | estoque | despesa | imobilizado | despesa |

O preço de lista sugerido aparece na pré-nota. A linha só atualiza o cadastro se estiver marcada para aplicar. A natureza propõe; não troca o preço de venda sozinha.

O CFOP do XML sugere a natureza. Quem lança confirma, porque o mesmo CFOP pode ser revenda ou consumo. A linha guarda os dois CFOPs: o do XML e o de entrada resolvido.

### De-para de CFOP

A tabela é dado, não código fixo. A tradução usa o CFOP do fornecedor, a UF do emitente contra a UF do destinatário e a finalidade da natureza.

| CFOP do XML | Operação | Finalidade | CFOP de entrada |
| --- | --- | --- | --- |
| 5102 | Interna | Revenda | 1102 |
| 6102 | Interestadual | Revenda | 2102 |
| 5101 | Interna | Industrialização | 1101 |
| 6101 | Interestadual | Industrialização | 2101 |
| 5102 | Interna | Consumo | 1556 |
| 6102 | Interestadual | Consumo | 2556 |
| 5102 | Interna | Imobilizado | 1551 |
| 6102 | Interestadual | Imobilizado | 2551 |
| 5405 | Interna | Revenda com ST | 1403 |
| 6405 | Interestadual | Revenda com ST | 2403 |

Importação usa a família 3. A semente cobre os pares comuns. Par ausente deixa a linha divergente até alguém escolher o CFOP de entrada. Mais de um par possível exige confirmação.

Alíquota não é reescrita. ICMS, substituição tributária, IPI, PIS e COFINS ficam como fatos da linha, com CST ou CSOSN e base vindos do XML. A natureza só decide quais desses valores entram no custo.

### Custo da linha

O custo unitário da linha parte do valor comercial e soma, quando a natureza mandar, frete, seguro, outras despesas, IPI e substituição tributária, e subtrai o desconto. Valores presentes no item do XML são usados direto. Frete só no total da nota, ou vindo de um CT-e, é rateado pelo valor das linhas.

| Componente | Sugestão para o CRT |
| --- | --- |
| IPI | Compõe o custo no Simples. Nos demais regimes, a natureza diz se há crédito. |
| Substituição tributária | Compõe o custo da mercadoria para revenda. |
| ICMS próprio | Fica fora do custo quando a empresa se credita. A natureza pode incluí-lo. |

O preço de entrada é esse custo unitário. Ele não acompanha o custo médio nem o preço de lista.

O custo médio novo é a quantidade em estoque vezes o custo médio atual, mais a quantidade desta entrada vezes o custo unitário, dividido pela quantidade resultante. Quantidade atual zero faz desta entrada o novo custo médio. A margem bruta do item é percentual: preço sugerido = custo unitário × (1 + margem / 100). Sem margem, o preço de lista permanece.

Custo médio é o método da primeira etapa. PEPS exige camada por lote e entra junto com o lote. UEPS não é método fiscal aceito para o estoque no Brasil e não será oferecido.

### Parcelas

Cada duplicata do XML vira uma conta a pagar, em centavos. Sem duplicata, a pré-nota pede valor e vencimento. A soma das parcelas fecha com o total da nota, tolerando um centavo. Diferença maior deixa a nota divergente.

Retenção de IRRF, CSRF (PIS, COFINS e CSLL) e INSS, quando vier na NF-e ou na NFS-e, reduz o valor líquido do pagar e gera um título de retenção para a guia. O valor bruto continua gravado na nota.

### Estorno

O estorno só ocorre se todo título gerado pela nota ainda estiver pendente. Título pago, parcial ou com restante de baixa bloqueia o estorno até a baixa ser desfeita.

A quantidade não fica negativa. O custo médio é recalculado com a quantidade e o custo unitário gravados no movimento daquela nota, não com o custo médio de hoje. O preço de lista não volta. O XML e a chave permanecem.

## 3. Impacto nos outros módulos

### Estoque

Um depósito por empresa na primeira etapa. O saldo do item é atualizado na mesma transação do movimento. O movimento é o fato: item, nota, linha, quantidade com sinal, custo unitário, custo total e data.

Lote e validade entram na etapa 5, só para item marcado como controlado por lote. A linha da nota informa lote, fabricação e validade. Sem esses dados, a linha fica divergente. O saldo passa a ser por lote, e o custo médio do item continua único.

### Financeiro

O título nasce com fornecedor, chave da nota no número do documento, emissão, vencimento, valor em centavos, plano de contas da natureza e o vínculo com a nota e a parcela. Esse vínculo é o que o estorno usa.

Centro de custo entra na etapa 5. O rateio é por linha ou pelo total, em percentual, e a soma fecha 100%. Cada parte guarda valor em centavos. Sem centro de custo cadastrado, o título segue só com o plano de contas.

### Ordem de compra

Não há ordem de compra no sistema. Na etapa 5, a pré-nota pode apontar para uma ordem aberta do mesmo fornecedor. A linha casa item, quantidade pendente e preço. Fora da tolerância, a nota fica divergente. Quem lança aceita a diferença ou devolve a linha para o compras. Efetivar consome o saldo da ordem.

### Fiscal

A efetivação não gera arquivo do SPED. Ela guarda, na linha, CFOP de entrada, NCM, CST, CSOSN e os valores de ICMS, ST, IPI, PIS e COFINS. A etapa 6 exporta esses fatos para a escrituração de entradas e usa os movimentos de estoque no bloco K. Retenções já estarão nos títulos próprios.

## 4. Telas

O monitor fica em Entradas, no menu fiscal. As situações usam o mesmo vocabulário da tabela de status.

### Monitor

Lista chave ou número, fornecedor, emissão, valor, tipo, situação e manifestação. Filtros por período, fornecedor, situação e tipo. Ações em lote só para ciência já automática e para download. Confirmação, desconhecimento e "não realizada" pedem a nota aberta, porque exigem decisão.

### Pré-nota

Cabeçalho com fornecedor, natureza, totais e parcelas. Grade de itens com código do fornecedor, descrição do XML, item interno, fator, CFOP do XML, CFOP de entrada, quantidade, custo unitário e preço de lista sugerido. Linha sem de-para abre a associação sem sair da nota. Efetivar só habilita quando não há divergência bloqueante.

### Divergências

| Divergência | Bloqueia | Caminho |
| --- | --- | --- |
| Destinatário diferente da empresa | sim | Recusar o arquivo. |
| Fornecedor inativo ou nome em conflito | sim | Reativar ou escolher a pessoa. |
| Item sem vínculo, fator, medida ou tipo fiscal | sim | Completar o de-para. |
| CFOP de entrada ambíguo ou ausente | sim | Escolher a natureza e o CFOP. |
| Soma das parcelas diferente do total | sim | Ajustar a parcela manual. |
| Sem protocolo | sim | Aguardar o XML autorizado. |
| Preço ou quantidade fora da ordem de compra | sim, na etapa 5 | Aceitar com motivo ou manter a ordem. |
| Hash diferente para a mesma chave | não | Manter o primeiro arquivo e mostrar o aviso. |

Tolerância da ordem de compra, quando existir: percentual de quantidade e percentual de preço por item, definidos na natureza ou na ordem. Zero significa comparação exata.

### Manifestação

Na nota, o histórico mostra o último evento e o protocolo. Ciência aparece como feita pelo sistema. Confirmação, desconhecimento e operação não realizada são botões. Os dois últimos pedem a justificativa antes de enviar.

## 5. Modelagem

Os nomes seguem o padrão do banco: inglês, no plural, com `tenant_id`. Valores de título em centavos. Quantidade, custo, preço e fator com 4 casas. Toda chave única inclui a empresa.

### `operation_natures`

Natureza de operação. Direção `in` ou `out`. Marcadores de estoque, financeiro, custo médio, preço de entrada e sugestão de preço de lista. Marcadores do que compõe o custo. Plano de contas. Finalidade fiscal: revenda, industrialização, consumo, imobilizado ou serviço.

### `inbound_documents`

Cabeçalho. Tipo, situação, chave, número, série, modelo, emissão, fornecedor, natureza, depósito, totais, hash do arquivo e vínculo opcional com a ordem de compra. Cópia dos marcadores da natureza gravada na efetivação.

### `inbound_document_files`

Bytes originais do XML, hash, nome e data de recepção. Vários arquivos podem apontar para a mesma chave; um deles é o oficial.

### `inbound_document_lines`

Item do XML e item interno, código do fornecedor, descrição, NCM, GTIN, CFOP do XML, CFOP de entrada, quantidades, fator, valores de imposto, custo unitário e se o preço sugerido deve ser aplicado. Lote e validade ficam nulos até a etapa 5.

### `inbound_document_installments`

Parcela com vencimento, valor bruto, retenções e valor líquido em centavos, ligada ao título gerado.

### `supplier_item_links`

De-para. Fornecedor, código do fornecedor, item interno, sigla da unidade do fornecedor e fator para a unidade do item. Único por empresa, fornecedor e código.

### `cfop_entry_rules`

CFOP de origem, abrangência interna, interestadual ou importação, finalidade e CFOP de entrada.

### `stock_balances` e `stock_movements`

Saldo por empresa e item, com quantidade e custo médio. Movimento ligado à linha da nota, com quantidade, custo unitário e direção. Na etapa 5, o saldo de lote fica em `stock_lots`.

### `fiscal_events`

Manifestação: documento, código do evento, sequência, justificativa, protocolo, data e situação do envio.

### Extensões da etapa 5

`purchase_orders` e `purchase_order_lines` para o pedido em aberto. `cost_centers` e `inbound_allocations` para o rateio. `payables` ganha o vínculo com o documento e a parcela, sem perder o lançamento manual que já existe.

## Fora desta especificação

Venda e emissão de NF-e de saída, NFC-e, MDF-e, escrituração automática do SPED na efetivação, multi-depósito e custo UEPS.
