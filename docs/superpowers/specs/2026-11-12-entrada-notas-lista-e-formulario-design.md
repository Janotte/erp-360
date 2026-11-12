# Entrada de notas: lista e formulário

## Objetivo

A lista de entradas e a nota deixam de dividir a mesma tela. A lista é a fila de trabalho. A nota é uma página própria, em seções. O menu de contexto da linha permanece com os mesmos itens: DANFE, manifestar, XML da manifestação e eventos.

Buscar na SEFAZ, nota manual, importar XML, lançar, estornar, excluir, vínculo de fornecedor, vínculo de item, CFOP de entrada, fator e classificação do pagamento continuam com as regras atuais. O de-para do fornecedor (`supplier_item_links`) já grava item, unidade e fator no salvar e reaplica na próxima importação. Esta entrega não cria outra memória de produto.

## Rotas

| Caminho | Tela |
|---|---|
| `/inbound` | `ListInbounds` |
| `/inbound/:id` | `FormInbound` |
| `/inbound/setup` | configuração atual, sem mudança |

`/inbound/setup` continua registrado como caminho estático. O identificador da nota é UUID.

A lista guarda filtro, ordenação e fila na query da URL. Ao abrir uma nota, a navegação leva `location.state.from` com essa query (`/inbound?…`). **Voltar** usa esse endereço. Sem esse estado, volta para `/inbound`. A posição do scroll da lista fica em `sessionStorage`, chave `inbound-list-scroll` mais a query. A lista restaura o scroll quando monta com a mesma query.

Nota manual e XML importado passam a abrir `/inbound/:id` com o mesmo `from`.

`InboundPage.tsx` sai. A lógica de lista fica em `ListInbounds.tsx`. A lógica da nota fica em `FormInbound.tsx`. `InboundNoteMenu.tsx` mantém as ações e passa a abrir também pelo ícone da coluna fixa, ancorado no botão. O botão direito continua passando as coordenadas do cursor.

## Lista

### Filtros

A busca continua por número, chave ou emitente, com o mesmo atraso de 500 ms.

Campos, na mesma barra:

- Busca
- Situação (todas ou um status)
- Manifesto do destinatário (todos ou um valor)
- Emissão de / até
- Entrada de / até

Atalhos acima dos campos, um ativo por vez. O segundo clique no atalho ativo limpa a fila e os campos que ela preencheu.

| Atalho | Efeito |
|---|---|
| A lançar | `queue=to_post`. Situação, manifesto e datas saem da URL. |
| Divergentes | `status=divergent`. |
| Sem manifesto | `manifestation=none`. |
| Lançadas no mês | `status=posted` e entrada de/até no mês civil atual, fuso `America/Sao_Paulo`. |

**Hoje** e **Este mês** preenchem só o período de entrada. Não alteram situação, manifesto nem fila. O período de emissão continua manual.

### API da lista

`GET /inbound` aceita, além dos filtros atuais:

- `manifestation`: `none | aware | confirmed | unaware | not_performed`
- `queue=to_post`: situação em `pending`, `pre_note` ou `divergent`
- `sort`: `inboundOn | issueOn | number | supplier | totalAmount | nature | manifestation | status`
- `dir`: `asc | desc`

`queue=to_post` e `status` juntos: vale o `status`. Ordenação fora da lista acima responde 400.

Padrão, quando `sort` vem vazio: `inboundOn` descendente, nulos por último, depois `issueOn` descendente, depois `createdAt` descendente.

Cada item ganha `postBlocker: string | null`. Nas situações `pending`, `pre_note` e `divergent`, é a primeira mensagem das regras de bloqueio do lançamento. Nas outras situações o campo vem nulo. O cálculo acontece na própria listagem, sem chamar o carregamento completo da nota por linha e sem reler XML. A lista não muda de página: o conjunto filtrado inteiro continua na resposta.

### Colunas

Visíveis sem scroll horizontal, nesta ordem: Situação, Número, Fornecedor, Total, Entrada.

No scroll: Emissão, Natureza, Manifesto do destinatário, Chave.

A coluna da direita fica fixa, com fundo opaco, enquanto o miolo rola. Dois ícones:

- Nota descoberta: **Consultar**, que dispara a confirmação já usada no duplo clique (importar, manifestar ciência e baixar, ou só baixar). Nas demais notas: **DANFE**, desabilitado sem chave de acesso.
- **Menu**, que abre o mesmo menu de contexto.

Clique na linha abre `/inbound/:id`. O duplo clique não dispara mais a descoberta.

Número aparece como `número/série`. Fornecedor usa o nome vinculado e, na falta dele, o nome do XML. Entrada vazia aparece como `—`.

A chave mostra reticências e os últimos 8 dígitos (`…2784511`). O tooltip tem a chave inteira. O clique na chave copia a chave e não abre a nota.

Situação e manifesto usam selo. A segunda linha da situação mostra `postBlocker` quando existir. Em nota descoberta cancelada ou denegada, a segunda linha mostra `Cancelada na SEFAZ` ou `Denegada na SEFAZ`.

Cada cabeçalho ordena. O cabeçalho ativo mostra a direção. Um clique alterna entre descendente e ascendente e grava `sort` e `dir` na URL.

## Formulário

Cabeçalho fixo: `Nota {número}/{série}`, selo da situação, fornecedor e total.

Rodapé fixo, da esquerda para a direita: **Salvar**, **Lançar**, **Excluir** ou **Estornar**. Excluir aparece fora de nota lançada, com a confirmação atual. Estornar aparece só em nota lançada, com confirmação. Salvar habilita com alteração pendente e situação editável (`pending`, `pre_note`, `divergent`). Lançar habilita quando `blockers` está vazio. Com bloqueio, o rótulo do botão é o primeiro bloqueio.

Sair com rascunho diferente do que foi carregado pede salvar ou descartar.

Depois de lançar, a nota permanece aberta, já travada, e o aviso oferece **Abrir a próxima**. Essa ação relê a lista com a query guardada em `from` e abre a primeira nota `pending`, `pre_note` ou `divergent`. Sem próxima, volta para a lista.

### Nota descoberta

Situação `discovered` mostra o resumo atual: chave, emitente, emissão, valor, manifesto e o aviso de cancelada, denegada ou ação bloqueada. Não monta as seções abaixo. A ação principal do resumo é a mesma de Consultar na lista.

### Seções

Nota que não está descoberta usa seções que abrem e fecham. O título fechado traz o resumo. Um ponto no título indica pronta, atenção ou bloqueio.

| Seção | Abre sozinha | Título fechado |
|---|---|---|
| Informações fiscais | não | natureza, ou “Sem natureza” |
| Emitente | não | nome e “Cadastrado”, “Inativo” ou “Sem cadastro” |
| Itens | sim | `Itens · {vinculados} de {total} vinculados` |
| Impostos | não | total da NF; “Totais divergentes” se a soma dos itens não fechar com o total dos produtos |
| Transporte | não | transportadora, frete por conta, volumes e peso bruto |
| Pagamento | quando o financeiro está pendente ou a soma das parcelas difere do total | meio e soma das parcelas |
| Informações adicionais | não | vazio quando não há texto |

Impostos, transporte e informações adicionais leem o endpoint de DANFE já existente. Sem XML completo, o título diz “Sem XML completo” e o miolo fica vazio. Esses três blocos são somente leitura.

**Informações fiscais.** Modelo, número, série, chave e emissão são somente leitura quando a nota tem chave. A chave fica em monoespaçado, em grupos de quatro, com copiar. Natureza continua editável nas situações editáveis.

A data de entrada entra no rascunho (`inboundOn`, `YYYY-MM-DD` ou nulo). No formulário, nota editável sem data gravada mostra a data civil de hoje e só persiste no salvar. Data anterior à emissão: o campo avisa e o salvar responde 400 com “A data de entrada não pode ser anterior à emissão.” Nota lançada, estornada, ignorada ou descoberta não altera essa data.

O lançamento usa a `inboundOn` gravada. Se ainda estiver nula, grava a data civil de hoje, como hoje. Deixa de ignorar uma data já informada.

Não há CFOP no cabeçalho. Acima da grade de itens, um campo de 4 dígitos e o botão **Aplicar aos itens** copiam esse CFOP de entrada para todas as linhas do rascunho. O botão fica desabilitado fora das situações editáveis e quando o campo não tem 4 dígitos. O salvar mantém CFOP já preenchido; a regra por natureza só preenche linha vazia, como já faz `entryCfopFor`.

**Emitente.** Dados do XML, somente leitura, vindos do DANFE: nome, CNPJ ou CPF, inscrição estadual, CEP, logradouro (já com número e complemento), bairro, município e UF. O trabalho da seção continua o vínculo: cadastrar fornecedor pelo CNPJ e buscar pessoa. Inscrição ou UF do cadastro diferentes do XML aparecem no título como divergência. O cadastro da pessoa não é regravado por esta tela.

**Itens.** Grade:

Nº, código do fornecedor, descrição, unidade, CFOP do XML, CFOP de entrada, quantidade, fator, unitário, total, vínculo, lápis, excluir.

CFOP de entrada, fator e busca do item editam na linha, nas situações editáveis. O lápis abre o cadastro de item com os dados da linha, como hoje. Excluir linha só existe em nota sem chave e quando sobra ao menos uma linha.

Nota sem chave mantém a edição de descrição, quantidade e unitário. Nota com chave deixa esses três somente leitura.

Total da linha é quantidade × unitário, exibido, não digitado. Vínculo vazio marca a linha. O de-para existente continua no salvar e na importação.

**Impostos.** Duas faixas, valores do DANFE:

- Base do ICMS, valor do ICMS, base do ICMS ST, valor do ICMS ST, total dos produtos
- Frete, seguro, desconto, despesas, IPI, valor total da NF

**Transporte.** Razão social, CPF ou CNPJ, frete por conta (rótulo do `modFrete`: 0 remetente, 1 destinatário, 2 terceiros, 3 próprio do remetente, 4 próprio do destinatário, 9 sem frete), veículo (placa e UF), endereço, município, UF, inscrição estadual, quantidade de volumes, espécie, marca, numeração, peso bruto e peso líquido.

**Pagamento.** Mantém a classificação atual: prazo com o fornecedor, cartão de crédito ou sem obrigação financeira, com cartão, motivo da dispensa e gerar parcelas de 1 a 48. A grade mostra parcela, vencimento e valor. A soma aparece ao lado do total da nota e entra no ponto da seção quando a diferença passa de um centavo, o mesmo limite do bloqueio de lançamento.

**Informações adicionais.** Texto complementar do DANFE. Se o texto tiver `Romaneio :` ou `Pedido :`, o valor até o próximo espaço vira rótulo acima do parágrafo. Não há vínculo com pedido de compra.

## Fora deste trabalho

Paginação da lista. Ciência em lote. Memória nova de CFOP por fornecedor. Tela própria do de-para. Partir logradouro, número e complemento em campos separados. Confronto com pedido de compra. Alterar os eventos de manifestação ou o XML autorizado.

## Critério de pronto

- Abrir uma nota e voltar devolve a mesma busca, as mesmas datas, a mesma situação, o mesmo manifesto, a mesma ordenação e o mesmo scroll.
- A chave na grade mostra oito dígitos, copia a chave inteira e não navega.
- Ordenar por fornecedor e por total reflete a ordem na resposta da API.
- Atalho A lançar não inclui lançada, estornada, ignorada nem descoberta.
- Nota descoberta não mostra seções de item, imposto ou pagamento.
- Salvar uma data de entrada futura e lançar grava essa data no documento e no movimento.
- Salvar data de entrada anterior à emissão falha com a mensagem acima e não lança.
- Aplicar CFOP preenche todas as linhas e o salvar não troca um CFOP já digitado pela regra.
- Linha de XML não tem excluir. Linha de nota manual tem, exceto a última.
- Lançar com item sem vínculo mostra esse bloqueio no botão e não envia o lançamento.
- O menu do ícone e o botão direito oferecem os mesmos quatro grupos de ação.
