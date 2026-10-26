# DF-e na lista de entradas

## Objetivo

A NF-e baixada da distribuição de DF-e aparece na lista de Entradas, com a situação Descoberta. A busca na SEFAZ continua no ambiente escolhido na aba NF-e. A ciência da operação e o download do XML completo acontecem no duplo clique, depois de confirmação. A importação preenche a mesma linha e usa o XML autorizado sem alterá-lo.

A tela separada de DF-e sai do menu e das rotas. O arquivo `dfe_documents` continua guardando o que a SEFAZ entregou, por empresa e ambiente.

## Busca na SEFAZ

O botão **Buscar na SEFAZ** fica na lista de Entradas e chama a sincronização já existente, pelo último NSU. A espera de uma hora e o cStat 656 continuam valendo para essa busca. A consulta por chave, no duplo clique, só espera quando o bloqueio for 656.

Cada lote gravado gera ou atualiza linhas de entrada:

- `resNFe` e `procNFe` de outro CNPJ viram nota Descoberta, se a chave ainda não existir.
- NF-e cujo emitente é o CNPJ desta empresa não vira linha.
- `resEvento` e `procEventoNFe` não viram linha. Se a chave já tiver nota, o evento atualiza o manifesto do destinatário. Ao criar a nota, o manifesto inicial sai do evento mais recente já arquivado para aquela chave.
- Nota que já deixou a situação Descoberta não volta para ela. A busca pode atualizar o manifesto e guardar o XML novo no arquivo de DF-e.

Número e série saem da chave, sem zeros à esquerda. Emissão é a data civil de `dhEmi`. Emitente e valor saem do resumo, ou do XML completo quando ele já veio no lote. Natureza, data de entrada, itens e parcelas ficam vazios. Se já existir pessoa com o CNPJ do emitente, a nota aponta para ela.

O resumo fica só no arquivo de DF-e. O `procNFe` também fica nesse arquivo. O arquivo da nota (`inbound_document_files`) recebe o `procNFe` na importação, byte a byte.

## Situação e manifesto

`inbound_documents.status` ganha `discovered`, com o rótulo Descoberta.

A nota ganha o manifesto do destinatário:

| Valor | Rótulo | Evento |
|---|---|---|
| `none` | Sem manifesto | — |
| `aware` | Ciente | 210210 |
| `confirmed` | Confirmada | 210200 |
| `unaware` | Desconhecida | 210220 |
| `not_performed` | Não realizada | 210240 |

A nota também guarda a situação na SEFAZ: `authorized`, `denied` ou `cancelled`, a partir de `cSitNFe`. Cancelada e denegada continuam com a situação Descoberta na lista.

Um evento posterior substitui o manifesto da mesma chave. Ciência, confirmação, desconhecimento e operação não realizada só mudam essa coluna. Esta entrega não oferece botão para os três últimos.

## Lista

Colunas: Número, Emitente, Emissão, Entrada, Valor, Natureza, Manifesto do destinatário, Situação.

A chave não é coluna. A busca encontra por número, chave ou nome do emitente. Os filtros são período de emissão, período de entrada e situação. A ordem continua emissão mais recente primeiro.

Um clique numa nota que não está Descoberta abre o detalhe atual. Um clique numa Descoberta mostra o resumo: chave, emitente, emissão, valor, manifesto e, quando for o caso, que a NF-e está cancelada ou denegada na SEFAZ. Esse clique não abre itens nem parcelas.

O duplo clique só age na Descoberta. Nas demais situações ele não dispara manifestação nem importação.

## Duplo clique

A confirmação segue esta ordem:

- Nota cancelada ou denegada não abre confirmação. A tela avisa e não envia evento nem importa.
- XML completo já no arquivo de DF-e: “Importar esta NF-e?”
- Sem esse XML e com manifesto Sem manifesto: “Manifestar ciência desta NF-e e baixar o XML completo?”
- Sem esse XML e com manifesto já registrado: “Baixar o XML completo?”

A ciência é o evento 210210 no serviço de recepção de evento do Ambiente Nacional, no ambiente da aba NF-e, com o certificado A1 desse ambiente. O órgão do evento é 91. A descrição do evento é Ciencia da Operacao. O CNPJ é o da empresa e a chave é a da nota. Não há justificativa nesse evento.

Depois da ciência aceita, a consulta da mesma chave pede o XML completo. Se ele vier nesse mesmo pedido, a importação ocorre sem nova confirmação. Se a ciência for aceita e o XML não vier, o manifesto fica Ciente, a situação continua Descoberta e a tela diz que o download pode ser tentado de novo. Um duplo clique seguinte só baixa.

Se a SEFAZ recusar a ciência, o manifesto permanece Sem manifesto, a situação permanece Descoberta e a tela mostra o motivo.

Certificado ausente, certificado vencido, PFX ilegível, UF do emitente vazia, CNPJ do certificado diferente do da empresa e falha de transporte usam as mesmas respostas já usadas na consulta de DF-e.

## Importação

A importação preenche a linha Descoberta pelo mesmo leitor de XML da entrada manual de arquivo. Não cria outra nota. A chave única continua a da empresa.

O `procNFe` com protocolo deixa a nota como pré-nota. Sem protocolo, fica divergente. Itens, parcelas, fornecedor e natureza seguem as regras que a importação já aplica. O XML gravado na nota é o autorizado, sem reescrita.

Se a chave pertencer a uma nota que não está Descoberta, a importação por duplo clique não altera essa nota.

## Fora deste trabalho

Confirmar, desconhecer ou registrar operação não realizada por ação do usuário. CT-e. Ciência automática na busca. Reescrita do XML autorizado.

## Testes

- Um resumo de outro CNPJ cria Descoberta com número e série da chave, sem itens, manifesto Sem manifesto e situação autorizada.
- Resumo do próprio CNPJ e evento não criam nota.
- Chave já lançada não ganha segunda linha e não volta para Descoberta.
- Evento 210210 de uma chave existente grava o manifesto Ciente.
- Nota cancelada ou denegada permanece Descoberta e a ação do duplo clique recusa o pedido.
- Ciência recusada mantém Sem manifesto. Ciência aceita sem `procNFe` grava Ciente e mantém Descoberta.
- `procNFe` importado na mesma linha gera pré-nota quando há protocolo, grava o arquivo da nota e não duplica a chave.
- A lista filtra por número, chave, emitente, emissão, entrada e situação.
