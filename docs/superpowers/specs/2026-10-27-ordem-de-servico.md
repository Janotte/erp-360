# Ordem de serviço

## Objetivo

A ordem de serviço registra um atendimento de balcão ou de oficina, imprime o comprovante e guarda o que foi combinado com o cliente. O mesmo núcleo atende assistência técnica, oficina mecânica, autoelétrica e bicicletaria. O que muda entre os nichos é o conjunto de campos do bem e os rótulos impressos.

Nesta entrega a empresa configura os onze campos e as cinco linhas de observação na aba Ordem de serviço, dentro de Configurações. O conteúdo inicial é o da assistência técnica. A oficina usa a mesma aba e troca os rótulos. O botão que preenche a aba a partir de um modelo pronto fica para depois.

## Escopo

Entra neste trabalho:

- a ordem, os itens de produto e de serviço, os totais e o pagamento previsto
- a aba Ordem de serviço em Configurações, no mesmo lugar de Emitente, Certificado, NF-e e Financeiro
- o comprovante no formato de `doc/templates/os.html`
- a lista e o formulário, já lendo os rótulos dessa aba

Fica para uma entrega seguinte:

- o botão que grava na aba um modelo pronto (oficina, autoelétrica, bicicletaria)
- baixar estoque na entrega
- emitir NFS-e ou NF-e a partir da ordem
- gerar conta a receber na entrega
- mais de um bem na mesma ordem
- foto, vistoria item a item e assinatura digital

O modelo de dados já deixa `item_id` e `payment_method_id` prontos para estoque, documento fiscal e conta a receber. Os onze campos já são os endereços em que um modelo pronto vai escrever rótulos.

## Pré-requisito em tenants

Antes da ordem de serviço, `tenants` recebe três colunas opcionais. A ordem só lê. O cadastro fica na aba Emitente.

| Coluna | Papel |
|---|---|
| `logo` | URL da imagem, até 500 caracteres. O mesmo papel de `persons.photo`. |
| `mobilePhone` | Celular, só dígitos, até 14, como `phone`. |
| `whatsapp` | WhatsApp, só dígitos, até 14, como `phone`. |

## Leitura do rascunho

A aba existe justamente para o rótulo não ficar gravado no código. `field01` … `field11` são onze endereços fixos da empresa. Na assistência, `field01` guarda a descrição do aparelho. Na oficina, o mesmo `field01` guarda a marca, porque o rótulo da aba mudou. O valor da ordem permanece no endereço. O que o formulário e o comprovante mostram é o rótulo da aba.

| Rascunho | Ajuste |
|---|---|
| `order.field01` … `order.field11` | Onze endereços por empresa. A aba edita ativo, rótulo, obrigatório e largura. O código do endereço não se edita. |
| Problema, diagnóstico, solução e o que acompanhou o bem | Continuam entre os onze. Na assistência ocupam `field08` a `field11`. Na oficina, a vistoria entra em `field10` e a solução passa para `field11`, pela troca de rótulo na aba. |
| `order.notes.line1` … `line5` | Cinco linhas `line01` … `line05` na mesma aba: ativo e texto. A ordem copia as linhas ativas na abertura. |
| `{{tenant.logo}}` | `tenants.logo`, a URL da imagem. Sem URL, o espaço mostra o nome fantasia. |
| `tenants.mobilePhone` e `tenants.whatsapp` | Colunas do emitente, ao lado de `phone`. O comprovante imprime as que estiverem preenchidas. |
| `person.addresses` e `person.contacts` | Endereço e contato principais viram uma cópia na ordem. O cadastro da pessoa pode mudar depois. |
| `itens` do tipo produto nas duas tabelas | Produto usa item `product`. Serviço usa item `service`. |
| `itens.listPrice` e total calculado no HTML | A linha grava quantidade, preço negociado e total em centavos. O preço de tabela só sugere o valor inicial. |
| Meio e forma como `<select>` no comprovante | Meio aponta para `payment_methods`. A condição é o número de parcelas. O comprovante imprime os dois textos. |
| `{{user.name}}` para o atendente | `openedBy`, para não confundir com o usuário do equipamento. |
| `order.previsionTo` | `promisedAt`, previsão de entrega. |
| `order.createdAt` como data de abertura | `openedAt`. `createdAt` continua sendo a criação da linha. |
| Senha no exemplo de observações | Senha e recado interno ficam em `internalNotes` e não entram no comprovante. |
| Uma ordem, um nicho implícito | A empresa tem uma configuração. Desligar um campo na aba esconde o valor e o conserva. |

O HTML de prova também está incompleto: o bloco `os-container` não fecha, o comentário do pagamento não é um comentário HTML, e o rodapé de assinatura não ocupa a largura da página. Esses pontos são corrigidos no próprio template, que continua sendo o mock visual com dados de exemplo.

## Decisões

- Identificadores em inglês, no padrão de `persons`, `catalog_items` e `inbound_documents`. Rótulos em português.
- Uma ordem atende um bem. Outro aparelho ou outro veículo é outra ordem.
- A configuração é uma linha por empresa, como `financial_settings`. Não há segundo modelo ao lado.
- Os endereços são `field01` … `field11` e `line01` … `line05`. O código não muda. A aba muda o rótulo, o ativo, o obrigatório e a largura.
- Ordem aberta mostra o rótulo atual da aba. Ordem entregue ou cancelada mostra o rótulo gravado na transição.
- Dinheiro do documento em centavos (`integer`), como em `inbound_documents`. Quantidade e preço unitário em `numeric`, como nas linhas da entrada.
- Isolamento por `tenantColumns` em toda tabela do módulo.
- Pacote `@erp-360/mod-service-orders`.

## Núcleo da ordem

Estes dados existem em qualquer nicho. Não são campos configuráveis.

| Campo | Papel |
|---|---|
| `number` | Inteiro sequencial da empresa. Na tela e no comprovante, nove dígitos em grupos de três: `000.000.001`. O contador não reaproveita número. |
| `status` | Situação do atendimento. |
| `attendance` | Tipo de atendimento. |
| `openedAt` | Data e hora de abertura. Nasce com a ordem. |
| `promisedAt` | Previsão de entrega. Opcional. |
| `deliveredAt` | Preenchida ao marcar Entregue. |
| `openedByUserId` | Atendente. Usuário da empresa. |
| `originOrderId` | Ordem de origem, quando o tipo é Garantia ou Retrabalho. Opcional. |
| `personId` | Cliente. Pessoa ativa, da mesma empresa, com `isClient`. |
| Cópia do cliente | Nome, documento, telefones, e-mail e endereço principal no momento da escolha. A ordem pode corrigir a cópia sem alterar o cadastro. |
| `line01` … `line05` | Cópia, na abertura, das linhas de observação ativas na aba. O texto daquela ordem pode ser editado. É o que o comprovante imprime. |
| `internalNotes` | Uso interno. Fora do payload de impressão. |
| `freightAmount` | Frete, em centavos, zero ou positivo. |
| `discountAmount` | Desconto, em centavos, zero ou positivo. |
| `surchargeAmount` | Acréscimo, em centavos, zero ou positivo. |
| `productsAmount` | Soma das linhas de produto, em centavos. |
| `servicesAmount` | Soma das linhas de serviço, em centavos. |
| `totalAmount` | Produtos + serviços + frete − desconto + acréscimo. Tem de ser zero ou positivo. |
| `paymentMethodId` | Meio, quando houver. Referência a `payment_methods`. |
| `paymentInstallments` | Condição. `1` é à vista. De `2` a `12`, parcelas. |

A cópia do cliente segue o mesmo gesto da entrada, que grava `supplierName` e `supplierTaxId` no documento. A origem é o endereço `Principal` e o contato `Principal`. Sem endereço ou sem contato, a ordem abre mesmo assim e os campos da cópia ficam vazios. Documento usa `persons.taxId`.

### Situação

| Valor | Rótulo |
|---|---|
| `open` | Aberta |
| `analyzing` | Em análise |
| `waiting_approval` | Aguardando aprovação |
| `waiting_parts` | Aguardando peça |
| `in_progress` | Em execução |
| `ready` | Pronta |
| `delivered` | Entregue |
| `cancelled` | Cancelada |

A ordem nasce Aberta, já com número. Entregue e Cancelada encerram o ciclo: não mudam de situação, não editam itens, campos, cliente nem totais.

Transições aceitas:

- Aberta → Em análise, Aguardando aprovação, Aguardando peça, Em execução, Cancelada
- Em análise → Aguardando aprovação, Aguardando peça, Em execução, Pronta, Cancelada
- Aguardando aprovação → Em análise, Em execução, Cancelada
- Aguardando peça → Em execução, Cancelada
- Em execução → Aguardando peça, Pronta, Cancelada
- Pronta → Entregue, Em execução, Cancelada

Campo obrigatório é o que a aba marcar, e só é exigido ao salvar enquanto estiver ativo. Entregue exige meio de pagamento. Ao entregar, `deliveredAt` recebe a data e hora atuais se ainda estiver vazia.

### Tipo de atendimento

O mock já mostra esse dado no cabeçalho. Ele entra no núcleo.

| Valor | Rótulo |
|---|---|
| `walk_in` | Avulso |
| `warranty` | Garantia |
| `rework` | Retrabalho |
| `contract` | Contrato |

O padrão é Avulso. Garantia e Retrabalho podem apontar `originOrderId` para outra ordem da mesma empresa.

## Aba Ordem de serviço

A aba fica em Configurações, junto de Emitente, Certificado, NF-e e Financeiro. A descrição da página passa a citar a ordem de serviço. Há uma configuração por empresa.

A aba tem dois blocos no mesmo salvamento: Campos do objeto e Linhas de observação. Em seguida ficam os títulos da seção e das tabelas, os rótulos das duas assinaturas e `summarySlot`, o campo ativo cujo valor aparece na lista.

### Campos do objeto

`field01` … `field11`. Cada um tem ativo, rótulo de até 60 caracteres, obrigatório e largura (4, 6 ou 12).

O código `field07` aparece na aba só como identificação da linha (Campo 07). Não há como renomear o código, incluir um décimo segundo campo nem apagar um endereço. Desligar esconde o campo na ordem aberta e no comprovante, e conserva o valor. Religar devolve o que estava digitado.

`field01` a `field07` são texto curto, até 120 caracteres. `field08` a `field11` são texto longo, até 2.000. Ano, placa e quilometragem cabem no texto curto. Não há número, data nem booleano nesta entrega.

Ordem aberta lê rótulo e largura da aba. Ao entregar ou cancelar, cada valor grava o rótulo e a largura daquele momento. A aba pode mudar depois sem alterar essa ordem.

Trocar o rótulo de um campo que já tem valor em ordem aberta pede confirmação. O valor continua no mesmo endereço e passa a ser exibido com o rótulo novo. Ordem entregue ou cancelada fica de fora dessa troca.

Senha e recado interno ficam em `internalNotes`. Não usam `field11` nem uma linha de observação, e não entram no comprovante.

### Conteúdo inicial

Empresa nova recebe os rótulos da assistência técnica. Todos os campos nascem ativos. `summarySlot` é `field01`. Seção: Informações do objeto. Tabelas: Produtos e Serviços. Assinaturas: Responsável técnico e Assinatura do cliente.

| Campo | Rótulo | Largura | Obrigatório |
|---|---|---|---|
| `field01` | Descrição | 12 | sim |
| `field02` | Marca | 4 | não |
| `field03` | Modelo | 4 | não |
| `field04` | Número de série | 4 | não |
| `field05` | Solicitante | 4 | não |
| `field06` | Setor | 4 | não |
| `field07` | Usuário do equipamento | 4 | não |
| `field08` | Problema reclamado | 12 | sim |
| `field09` | Diagnóstico | 12 | não |
| `field10` | Solução | 12 | não |
| `field11` | Recebido com | 12 | não |

### Linhas de observação

`line01` … `line05`, no bloco de baixo da mesma aba. Cada uma tem ativo e texto de até 500 caracteres. O código da linha não se edita. Não há sexta linha.

Desligar uma linha tira o texto das próximas ordens e do comprovante delas. A ordem já aberta conserva a cópia que recebeu. Religar vale para a ordem aberta depois disso.

Empresa nova recebe:

| Linha | Ativa | Texto |
|---|---|---|
| `line01` | sim | Garantia dos serviços e peças de 90 dias conforme o Código de Defesa do Consumidor. |
| `line02` | sim | Autorizo o descarte das peças substituídas. |
| `line03` | não | |
| `line04` | não | |
| `line05` | não | |

A ordem nova copia o texto das linhas ativas. Naquela ordem o texto pode ser editado ou apagado. Alterar o texto na aba vale para a próxima ordem, não para as já abertas.

### Oficina, na mesma aba

Não há outro conjunto de campos. A oficina preenche os mesmos endereços com outros rótulos e aponta a lista para `field04`. O botão que grava esta tabela de uma vez fica para a entrega do modelo pronto. Até lá, a aba aceita estes valores:

| Campo | Rótulo | Largura | Obrigatório |
|---|---|---|---|
| `field01` | Marca | 4 | não |
| `field02` | Modelo | 4 | não |
| `field03` | Ano | 4 | não |
| `field04` | Placa | 4 | sim |
| `field05` | Cor | 4 | não |
| `field06` | Quilometragem atual | 4 | não |
| `field07` | Nível de combustível | 4 | não |
| `field08` | Reclamação do cliente / sintomas | 12 | sim |
| `field09` | Diagnóstico técnico | 12 | não |
| `field10` | Checklist de entrada / vistoria visual | 12 | não |
| `field11` | Solução | 12 | não |

As linhas de observação podem permanecer as da assistência. Autoelétrica e bicicletaria serão outros preenchimentos desta mesma aba.

## Itens, totais e pagamento

Cada linha aponta para um `catalog_items` da empresa e copia código e nome no momento da inclusão. O nome na linha pode ser ajustado. O código copiado não. O preço unitário nasce de `listPrice` e pode ser negociado. Serviço só aceita item `service`. Produto só aceita item `product`.

| Coluna da linha | Papel |
|---|---|
| `lineNumber` | Ordem de exibição, a partir de 1, única na ordem. |
| `kind` | `product` ou `service`, igual ao tipo do item. |
| `itemId` | Item do catálogo. |
| `code` | Cópia do código de seis dígitos. |
| `description` | Cópia do nome, editável, até 120 caracteres. |
| `quantity` | Maior que zero, quatro casas. |
| `unitPrice` | Zero ou positivo, quatro casas. |
| `lineAmount` | Centavos. Quantidade × preço unitário, meio centavo arredondado para cima. |
| `technicianPersonId` | Só em serviço. Pessoa ativa com `isEmployee`. Opcional. |
| `technicianName` | Cópia do nome do técnico. |

A tabela de produtos imprime código, descrição, quantidade, unitário e total. A de serviços imprime descrição, técnico, quantidade, unitário e total. Linha sem técnico imprime o nome em branco. Esta entrega não movimenta estoque, mesmo com `tracksStock`.

Totais da ordem são recalculados a cada salvamento das linhas. Desconto maior que produtos + serviços + frete + acréscimo é recusado.

O meio de pagamento é um registro de `payment_methods` (dinheiro, cartão, Pix e os demais já cadastrados). A condição não é outro cadastro: `1` imprime “À vista”; `3` imprime “3x”. Meio vazio é permitido até a entrega.

## Impressão

`doc/templates/os.html` é o mock. O comprovante real repete a mesma disposição e recebe o modelo abaixo, já formatado. Campo vazio e ativo continua na folha, com o valor em branco, para a grade não pular.

Emitente, lido na hora da impressão a partir de `tenants`, `cities` e `states`:

| Placeholder | Origem |
|---|---|
| `tenant.logo` | Imagem de `tenants.logo`. Sem URL, o espaço mostra `tradeName`. |
| `tenant.tradeName` | Nome fantasia, ao lado da logo. |
| `tenant.name` | Razão social. |
| `tenant.cnpj` | `tenants.cnpj`, com máscara. |
| `tenant.stateRegistration` | Inscrição estadual. Omitir o trecho quando vazia. |
| `tenant.addressLine` | Logradouro, número, complemento, bairro e CEP. |
| `tenant.cityLine` | `cities.name` / `states.abbreviation`. |
| `tenant.phone` | `tenants.phone`, com máscara quando houver 10 ou 11 dígitos. |
| `tenant.mobilePhone` | `tenants.mobilePhone`, com a mesma máscara. Omitir quando vazio. |
| `tenant.whatsapp` | `tenants.whatsapp`, com a mesma máscara. Omitir quando vazio. |
| `tenant.email` | `tenants.email`. |

Cabeçalho da ordem:

| Placeholder | Origem |
|---|---|
| `order.number` | Número formatado. |
| `order.openedByName` | `users.name` do atendente. |
| `order.openedAt` | Abertura, no fuso de `cities.timezone` do município da empresa. Sem fuso, `America/Sao_Paulo`. |
| `order.promisedAt` | Previsão. Em branco quando nula. |
| `order.attendanceLabel` | Rótulo do tipo de atendimento. |
| `order.statusLabel` | Rótulo da situação. |
| `order.originNumber` | Número da ordem de origem, só quando houver. |

Cliente, a partir da cópia gravada na ordem: `customer.taxId`, `customer.name`, `customer.phone`, `customer.mobilePhone`, `customer.whatsapp`, `customer.email`, `customer.streetLine`, `customer.neighborhood`, `customer.cityLine`.

Campos: `field01` … `field11` ativos, na ordem do código, com o rótulo da aba (ou o rótulo gravado, se a ordem estiver entregue ou cancelada), o valor e a largura. Linha de observação com texto: `order.notes.line01` … `order.notes.line05`. Linha vazia não imprime.

Itens e totais saem formatados em reais. `totals.adjustmentAmount` é o acréscimo menos o desconto, com sinal. `payment.methodDescription` vem de `payment_methods.description`. `payment.installmentsLabel` é “À vista” ou “Nx”. As duas assinaturas usam os rótulos da aba e não são persistidas.

`internalNotes` não tem placeholder.

## Persistência

Tabelas do módulo, todas com `tenant_id`, exceto o contador, cuja chave já é a empresa:

- `service_order_counters` — `tenant_id`, `last_number`. O próximo número sai na mesma transação que cria a ordem.
- `service_order_settings` — uma linha por empresa: títulos, rótulos das assinaturas e `summary_slot`.
- `service_order_fields` — onze linhas por empresa, `field01` … `field11`, com rótulo, ativo, obrigatório e largura. Único em (`tenant_id`, `slot`).
- `service_order_note_lines` — cinco linhas por empresa, `line01` … `line05`, com texto e ativo. Único em (`tenant_id`, `slot`).
- `service_orders` — núcleo, cópia do cliente, totais, pagamento e `label_frozen_at`, nulo até entregar ou cancelar.
- `service_order_lines` — itens. Único em (`order_id`, `line_number`).
- `service_order_field_values` — valor por `slot`. Com `label_frozen_at` preenchido, a linha também guarda rótulo e largura.
- `service_order_notes` — texto de `line01` … `line05` copiado para aquela ordem.

`origin_order_id`, `person_id`, `opened_by_user_id`, `item_id` e `technician_person_id` usam a chave composta com `tenant_id`, no mesmo padrão de `person_addresses` e `catalog_items`.

A busca da lista encontra por número, nome do cliente na cópia e texto dos onze campos. A lista mostra número, cliente, o valor de `summary_slot`, abertura, previsão e situação. A mais recente vem primeiro.

## Correções do template

Aplicadas em `doc/templates/os.html` para o mock acompanhar este contrato:

- fecha o container da página
- o rodapé de assinatura ocupa a largura útil
- pagamento impresso como texto, sem `<select>`
- comentário HTML válido na seção de pagamento
- “Série” passa a “Número de série”
- “Usuário” passa a “Usuário do equipamento”
- “Observações” do objeto passa a “Recebido com”, sem senha no exemplo
- a coluna de totais soma 100% da tabela

## Fora deste trabalho

Estoque, documento fiscal, conta a receber, vários bens na mesma ordem, cadastro de veículo, galeria de fotos, vistoria item a item, assinatura capturada, envio da ordem por WhatsApp e o botão que preenche a aba com um modelo pronto. O texto de `field10` na oficina é um dos onze campos, não uma vistoria item a item. O número de WhatsApp da empresa entra no cabeçalho; o envio da ordem por esse canal não.

## Critérios de aceite

- A empresa nova abre a aba com os onze rótulos da assistência, `line01` e `line02` ativas, e `summary_slot` em `field01`.
- Gravar na aba os rótulos da oficina faz o formulário e o comprovante da ordem aberta usarem Marca, Placa e Checklist de entrada / vistoria visual nos endereços `field01`, `field04` e `field10`.
- Desligar `field06` esconde o campo na ordem aberta e no comprovante, e religar devolve o valor antigo.
- Trocar o rótulo de `field08` pede confirmação quando há ordem aberta com valor nesse endereço, altera essa ordem e não altera a ordem já entregue.
- Mudar o texto de `line01` na aba não altera a linha já copiada para uma ordem existente.
- Ordem entregue recusa edição de item, campo, cliente, linha de observação e total.
- Linha de serviço com item produto é recusada. Linha de produto com técnico é recusada.
- O total da linha fecha em centavos e o total da ordem recusa desconto acima da soma.
- O comprovante traz a logo quando `tenants.logo` tem URL, e o nome fantasia nesse espaço quando a URL está vazia.
- O cabeçalho traz telefone, celular e WhatsApp preenchidos, e omite o celular ou o WhatsApp vazio.
- `internalNotes` não aparece no payload de impressão.
- O número seguinte não reutiliza um número já emitido, inclusive depois de ordem cancelada.
