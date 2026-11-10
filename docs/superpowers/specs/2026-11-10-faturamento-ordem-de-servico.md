# Faturamento da ordem de serviço

## Para que serve

A ordem entregue gera contas a receber quando alguém confirma as parcelas. A situação da ordem continua Entregue. Documento comercial, NFS-e, NF-e, NFC-e e baixa de estoque ficam para a entrega seguinte.

Esta especificação substitui, na de 7 de novembro, o momento da cobrança da ordem. A geração deixa de ocorrer na transição para Entregue e passa para o menu da lista.

## O que já existe

A ordem grava um plano de pagamento. Cada parcela tem forma, vencimento e valor. A entrega exige a soma igual ao total, salvo o total zero, que entrega com a forma e não tem saldo. Entregue e Cancelada não se editam na ficha. O número da ordem aparece com seis dígitos: `000.001`.

O contas a receber já tem `receivables`, com devedor, valor em centavos, vencimento e situação `pendente`, `recebido` ou `cancelado`. A cobrança do contrato já grava o título e a ligação na mesma transação, e repetir a competência não cria outro. O juro e a taxa da condição ficam copiados no plano e não entram no valor da parcela.

## Decisões

- Identificadores em inglês. Rótulos e mensagens em português. Dinheiro em centavos.
- A empresa é o tenant. O dia da emissão é o de hoje no fuso da empresa, o mesmo relógio da cobrança do contrato.
- A ordem permanece Entregue. Não há situação Faturada.
- Uma parcela confirmada gera um título contra o cliente. À vista vence no dia gravado na parcela e nasce pendente. Caixa, banco e credenciadora ficam para quando o efeito da forma passar a ser aplicado.
- O diálogo parte do plano já gravado. Parcela que não for alterada conserva data e valor. Condição nova, montada no diálogo, sugere as datas a partir do dia da empresa. O servidor grava as datas confirmadas. Não as recalcula.
- A soma das parcelas confirmadas é o total da ordem. Juro e taxa não aumentam esse total.
- Confirmar grava o plano confirmado e os títulos na mesma transação. Recusa e repetição não alteram o plano nem criam título.
- Cancelar o título no financeiro não apaga a ligação e não libera outra geração.
- O menu da lista é o lugar da ação. Imprimir, gerar notas e WhatsApp entram depois, cada um com a própria regra. Esta entrega só coloca Gerar financeiro.

## Menu e diálogo

O clique com o botão direito na linha da lista abre o menu da ordem. Gerar financeiro fica desabilitado quando a ordem não está Entregue. Na ordem Entregue, o item abre o diálogo por cima da lista.

O diálogo carrega a ordem.

- Com cobrança já gerada, mostra os títulos e a mensagem do caso. Não há confirmação que gere de novo.
- Com total zero, mostra a mensagem do caso. Não há confirmação.
- Nos outros casos, mostra o mesmo compositor de parcelas da ficha, preenchido com o plano atual. Confirmar fica indisponível enquanto a soma for diferente do total.

A geração concluída mostra a mensagem e fecha o diálogo. A ficha, ao ser aberta, mostra a seção Financeiro com documento, vencimento, valor e situação de cada título. A ficha não ganha botão. A lista não ganha coluna nem situação.

## Geração

`POST /service-orders/:id/billings` recebe as parcelas confirmadas, no mesmo formato em que a ordem grava o plano.

Na mesma transação:

1. As linhas do plano passam a ser as parcelas confirmadas.
2. Cada parcela vira um `receivables`.
3. Cada parcela vira uma linha em `service_order_billings`.

| Campo do título   | Origem                                                                 |
| ----------------- | ---------------------------------------------------------------------- |
| `debtorId`        | Cliente da ordem                                                       |
| `installmentAmount` | Valor da parcela                                                     |
| `dueOn`           | Vencimento confirmado                                                  |
| `issueOn`         | Hoje, no fuso da empresa                                               |
| `description`     | `Ordem 000.001 · parcela 1`, com o número da ordem, sem o nome da forma |
| `paymentMethodId` | Forma da parcela                                                       |
| `meansOfPaymentId`| Meio dessa forma                                                       |
| `planAccountId`   | Vazio. A ordem não tem conta de receita                                |
| `status`          | `pendente`                                                             |
| `documentNumber`  | Dígitos do número da ordem, hífen e a parcela em dois dígitos: `000001-01` |
| `invoiceNumber`   | Vazio, até existir o documento de faturamento                          |

A descrição usa o número formatado da ordem e o número da linha. O documento usa os dígitos sem ponto. A ordem 1 na parcela 1 grava `000001-01`. A ordem 1000000 na parcela 1 grava `1000000-01`.

`service_order_billings`

| Coluna             | Tipo                                      |
| ------------------ | ----------------------------------------- |
| `id`               | uuid                                      |
| `tenant_id`        | uuid                                      |
| `service_order_id` | uuid, ordem da empresa                    |
| `line_number`      | integer, número da parcela no plano, ≥ 1  |
| `due_on`           | date                                      |
| `amount`           | integer, maior que zero                   |
| `receivable_id`    | uuid, título da empresa                   |
| `created_at`       | timestamp                                 |

Único por `(tenant_id, service_order_id, line_number)` e por `(tenant_id, receivable_id)`.

A leitura da ordem inclui essas cobranças quando existirem.

## Mensagens

O diálogo exibe o texto do caso.

| Caso                    | Mensagem                                                    |
| ----------------------- | ----------------------------------------------------------- |
| Ordem que não está Entregue | A ordem precisa estar entregue para gerar o financeiro. |
| Total zero              | Ordem com total zero não gera financeiro.                   |
| Soma diferente do total | A soma das parcelas precisa ser igual ao total da ordem.    |
| Parcela sem valor       | A parcela precisa ter valor.                                |
| Forma indisponível      | A forma de pagamento não está disponível para a ordem.      |
| Crédito em loja         | Crédito em loja não entra na ordem.                         |
| Cobrança já gerada      | O financeiro desta ordem já foi gerado.                     |
| Geração concluída       | Financeiro gerado.                                          |

Na cobrança já gerada, a mensagem acompanha os títulos existentes. Na geração concluída, o diálogo fecha e a ficha passa a mostrar esses títulos.

## Regras que a API recusa

| Caso                                              | Resposta                                      |
| ------------------------------------------------- | --------------------------------------------- |
| Ordem que não está Entregue                       | 400, a mensagem do caso                       |
| Total zero                                        | 400, a mensagem do caso                       |
| Soma das parcelas diferente do total              | 400, a mensagem do caso                       |
| Parcela com valor zero ou negativo                | 400, a mensagem do caso                       |
| Forma indisponível para a ordem, ou crédito em loja | 400, a mensagem do caso                     |
| Cobrança já gerada                                | 409, a mensagem do caso e os títulos existentes |

O 409 não regrava o plano. Cancelar o título no financeiro deixa a linha em `service_order_billings` e a próxima chamada continua 409.

## Testes

- Ordem Entregue com três parcelas grava três títulos e três ligações na mesma transação. Cada título nasce pendente, no valor e no vencimento da parcela, com o cliente, a forma, o meio, a emissão no dia da empresa, o documento `000001-01` e a descrição `Ordem 000.001 · parcela 1`. A ordem continua Entregue.
- Trocar a forma no diálogo grava o plano novo e gera os títulos dele.
- A segunda chamada responde 409, devolve os mesmos títulos e não cria outros. Cancelar o título no financeiro também não libera outra geração.
- Ordem que não está Entregue, total zero, soma diferente do total, parcela sem valor, forma indisponível e crédito em loja respondem 400 com a mensagem do caso.
- Condição nova sugere as datas a partir do dia da empresa. O título grava a data que o diálogo confirmou.

## Fora desta entrega

- situação Faturada
- documento de faturamento, NFS-e, NF-e, NFC-e e os vínculos da nota na ordem
- baixa de estoque
- lançamento de caixa, banco ou credenciadora a partir do `receiptKind`
- juro da condição somado ao total
- conta de receita no título da ordem
- botão na ficha, coluna nova na lista
- imprimir, gerar notas e WhatsApp no menu
- reescrever título já emitido
- estorno que libere uma nova geração
