# Faturamento

## Para que serve

Faturamento é o caminho do que já está devido até o título que o financeiro recebe. A origem continua dona da regra comercial. O contrato decide o período, o valor e o vencimento. A ordem decide itens, totais e a forma combinada. A venda, quando existir, decide o pedido. Nenhuma delas emite nota nem dá baixa.

Três registros convivem, em momentos diferentes:

| Registro                 | Dono                     | O que representa                                                          |
| ------------------------ | ------------------------ | ------------------------------------------------------------------------- |
| Cobrança da origem       | Contrato, ordem ou venda | Este valor desta origem já foi cobrado, uma vez                           |
| Documento de faturamento | Faturamento              | O número comercial que o cliente vê, e o lugar em que a nota vai pendurar |
| Título                   | Financeiro               | O que se recebe, parcela a parcela                                        |

A nota fiscal não é o título e não é a situação da ordem nem do contrato. NF-e e NFS-e entram ligadas ao documento de faturamento, cada uma com a própria situação. Enquanto a integração nacional não existe, o comercial e o financeiro funcionam com a situação fiscal `not_requested`.

## O que já existe

O financeiro já tem `receivables`, baixa, forma comercial e o grupo de pagamento da NF-e calculado em `fiscalPag`. A nota de saída ainda não grava esse grupo.

A entrada já baixa NF-e pela distribuição de DF-e, manifesta e importa. O certificado e o ambiente (`homologation` ou `production`) já estão na empresa. Isso serve à NF-e de saída depois. Não serve à NFS-e nacional, que é outro serviço.

A ordem já copia a forma, a condição e os totais. Entregar exige a forma. Entregar ainda não gera título, não baixa estoque e não emite nota. A situação da ordem não ganha "Faturada".

O contrato já numera, calcula a série e, sem data de fim, mostra só o próximo vencimento ainda sem título. A cobrança do período, que grava `contract_billings` e um título, continua a Entrega 2 da especificação de contratos. Esta especificação não a redesenha.

Não há módulo de venda. Não há NFS-e. Não há nota de saída.

## Decisões

- Identificadores em inglês. Rótulos em português. Dinheiro em centavos.
- A empresa é o tenant. Não há segunda empresa dentro da mesma conta.
- A origem aponta a cobrança com chave estrangeira composta. Não há `source_type` solto.
- Título já emitido não muda de valor, vencimento, cliente nem conta porque a origem mudou depois.
- Cancelar o título no financeiro não apaga a cobrança da origem. Uma nova geração da mesma cobrança espera o estorno estar definido.
- A situação fiscal não trava a emissão comercial nem a geração do título.
- Uma ordem ou venda com produto e serviço pode ter, no futuro, uma NF-e e uma NFS-e no mesmo documento comercial. Por isso o documento não guarda um único XML.
- Não há worker, fila de eventos, política hierárquica, faturamento parcial, consumo, medição, etapa nem pró-rata nesta linha.
- O meio 91 continua cabendo quando o pagamento é depois da emissão. O crédito em loja continua fora enquanto o saldo do cliente não existir.

## Como funciona

### Contrato

A geração não é feita contrato a contrato. Na lista, um clique cobra todos os vigentes com cobrança recorrente. A tela mostra antes quantos contratos, quantos títulos e o valor. Cada contrato grava os seus `contract_billings` e os seus `receivables` na própria transação. Repetir a mesma competência devolve a cobrança que já existe. Um contrato que falha não desfaz os outros.

Entra o período sem título cuja data de corte é hoje ou anterior. A data de corte da competência atual é o dia 1 do mês inicial do período. A da competência anterior é o dia 1 do período seguinte. O vencimento é o dia do contrato nesse mesmo mês.

No contrato 000.001, início em 01/10/2026, mensal, competência anterior e dia 15, a data de corte do primeiro período é 01/11/2026 e o vencimento é 15/11/2026. Uma geração em 07/11/2026 cria esse título de R$ 1.070,00. O período de novembro só entra em 01/12/2026, com vencimento em 15/12/2026.

Essa entrega não cria documento de faturamento e não pede nota. A mensalidade já pode ser recebida.

### Ordem de serviço

O momento, o diálogo e a ligação desta cobrança estão em `2026-11-10-faturamento-ordem-de-servico.md`. A geração é um item do menu da lista, depois de Entregue, e não ocorre na transição. A ordem continua Entregue. O comprovante continua igual. A nota não é emitida.

### Documento de faturamento

Entra quando a ordem e a venda precisarem de um número comercial estável para a nota. O contrato que já gerou título sem esse documento permanece assim. Cobrança nova de contrato só ganha documento no dia em que a mensalidade for para a NFS-e.

O documento nasce emitido comercialmente, com número sequencial da empresa, cliente, totais e a chave da origem. A situação fiscal começa em `not_requested`. O título daquela origem passa a guardar o número desse documento em `invoiceNumber`.

| Situação comercial | Significado                                                                         |
| ------------------ | ----------------------------------------------------------------------------------- |
| `issued`           | O número existe e os títulos daquela origem foram gerados                           |
| `canceled`         | O documento comercial foi cancelado. O efeito no título segue a regra do financeiro |

| Situação fiscal | Significado                                                     |
| --------------- | --------------------------------------------------------------- |
| `not_requested` | Ninguém pediu nota. É o estado enquanto a integração não existe |
| `pending`       | O pedido foi montado e aguarda o ambiente nacional ou a SEFAZ   |
| `authorized`    | A nota foi autorizada                                           |
| `rejected`      | O ambiente recusou. O título permanece                          |
| `canceled`      | A nota autorizada foi cancelada no prazo do fisco               |

`pending`, `authorized`, `rejected` e `canceled` só passam a ser gravados na entrega que fala com o ambiente. Antes disso o único valor usado é `not_requested`.

### Venda

A venda reutiliza o documento, a cópia de pagamento e a geração de título da ordem. Não cria um segundo caminho de recebimento. Estoque e expedição ficam na venda. Confirmar a venda gera o documento e os títulos. A nota continua `not_requested`.

### NFS-e e NF-e

As duas notas apontam o documento de faturamento, não o título e não a origem.

A NFS-e cobre serviço: mensalidade, quando a empresa passar a exigi-la, e as linhas de serviço da ordem ou da venda. A NF-e de saída cobre produto. O grupo `pag` que `fiscalPag` já monta é o pagamento dessa NF-e. O certificado e o ambiente da aba NF-e são os da NF-e de saída. A NFS-e nacional terá configuração própria, ao lado, sem reaproveitar o webservice da NF-e.

Num documento misto saem duas notas, cada uma com a própria situação. O comercial não espera as duas autorizarem para os títulos existirem.

A primeira entrega de cada nota grava o pedido e a situação `pending`, sem enviar. A entrega seguinte envia à homologação. Produção é troca de ambiente, não outro módulo.

## Sequência

A ordem abaixo evita refazer título, numeração e vínculo cada vez que um módulo novo aparece.

1. **Cobrança do contrato.** A Entrega 2 já especificada. Gera `contract_billings` e o título. Sem documento e sem nota. Libera a fila de vencimentos, inclusive os que já passaram.
2. **Cobrança da ordem.** Pelo menu Gerar financeiro, na lista, depois de Entregue. Gera os títulos a partir das parcelas confirmadas. Sem documento e sem nota. A situação da ordem não muda. O detalhe está na especificação de 10 de novembro.
3. **Documento de faturamento.** Número comercial, vínculo com a origem e situação fiscal `not_requested`. As gerações novas da ordem passam a criá-lo na mesma transação dos títulos. Títulos antigos, de contrato ou de ordem, não são reescritos.
4. **Venda.** Pedido, itens, cópia de pagamento, documento e títulos. Sem nota e sem baixar estoque nesta etapa, se o estoque da venda ainda não existir.
5. **NFS-e, ainda sem o ambiente nacional.** O documento com serviço ganha o pedido da nota e continua recebível. Nenhum XML sai da empresa.
6. **NF-e de saída, ainda sem a SEFAZ.** O mesmo para produto, reusando `fiscalPag`, certificado e ambiente. A entrada e o DF-e permanecem como estão.
7. **Envio.** Primeiro a NFS-e nacional em homologação, depois a NF-e de saída em homologação. Cada uma só chama o ambiente quando o pedido local já grava e regrava sem duplicar.

Cobertura e franquia do contrato continuam a Entrega 3 dos contratos. Elas mudam o total da ordem antes da cobrança da ordem, então entram antes do passo 2 se a ordem vinculada ao contrato precisar nascer com linha coberta. Sem isso, o passo 2 cobra o total que o usuário digitou.

## Fora deste desenho

- motor de políticas, lote, outbox e faturamento parcial
- consolidar várias origens numa fatura só
- pró-rata, reajuste, consumo, medição e etapa
- situação Faturada na ordem ou no contrato
- reescrever título já emitido
- crédito em loja
- cancelar nota e título no mesmo botão antes de o financeiro definir o estorno
