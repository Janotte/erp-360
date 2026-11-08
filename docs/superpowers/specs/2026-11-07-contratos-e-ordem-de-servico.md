# Contratos e a ordem de serviço

## Leitura da conversa

A conversa parte da abertura da ordem até o faturamento e, em seguida, do módulo de contratos. As duas escolhas feitas lá foram o fluxo configurável controlado para a ordem e o contrato configurável por capacidades.

O que vale levar para o ERP 360:

- a situação operacional da ordem e a cobrança são assuntos diferentes
- o contrato é um vínculo comercial próprio, com vigência, valor e cliente
- a ordem do tipo Contrato aponta para esse vínculo
- cobrança do período, cobertura e franquia entram em momentos diferentes
- alteração de valor não reescreve cobrança já gerada
- cada mudança de situação fica registrada

O que fica de fora desta linha de trabalho:

- motor em que a empresa desenha situações, transições e validadores
- estados canônicos paralelos ao rótulo da tela
- rascunho da ordem, negociação jurídica, aprovação interna e assinatura digital
- contratos de fornecedor, locação, compra e projeto
- SLA, medição, aditivo formal, índice de reajuste e livro de franquia
- fila de eventos, processamento agendado e faturamento parcial por etapa

A ordem já separa o nicho pelos rótulos da aba Ordem de serviço. Assistência, oficina, autoelétrica e bicicletaria usam as mesmas oito situações. Um segundo fluxo por empresa refaz um módulo que já está em produção e ainda não tem um caso em que "Aguardando peça" precise de outro nome.

## O que já existe

A ordem grava `status` em oito valores e só aceita as transições de `assertTransition`. Nasce Aberta, com número. Entregue e Cancelada encerram a edição. Entregue exige a forma de pagamento.

O tipo de atendimento já tem `contract` (Contrato), ao lado de Avulso, Garantia e Retrabalho. Não há tabela de contrato nem coluna `contract_id`. Garantia e Retrabalho apontam `origin_order_id`. Contrato ainda não aponta nada.

A conta a receber já existe em `receivables`, com devedor, valor em centavos, vencimento e situação `pendente`, `recebido` ou `cancelado`. A ordem ainda não gera título. Isso continua na lista de entregas seguintes da ordem, junto da baixa de estoque e da nota.

O propósito do produto já cita o setor de serviços: contrato, recorrência e faturamento simplificado. Esta especificação é esse pedaço, no tamanho da primeira entrega.

## Decisões

- Identificadores em inglês. Rótulos em português.
- Pacote `@erp-360/mod-contracts`. A ordem só ganha a chave do contrato.
- Isolamento por `tenantColumns` e chave estrangeira composta, como em `service_orders`.
- Dinheiro em centavos (`integer`). Datas de vigência em `date`.
- A empresa é a prestadora. A outra parte é uma pessoa cliente (`isClient`). Contrato de fornecedor é outra entrega.
- A situação do contrato é um enum fixo. A empresa não cria situação.
- A situação da ordem permanece o enum atual. Esta entrega não acrescenta Suspensa, Concluída nem Faturada na ordem.
- Cobrança da ordem e cobrança do contrato não se misturam. Ligar a ordem ao contrato não zera item, não abate o valor do período e não gera título.
- A cobrança recorrente, quando existir, gera um título em `receivables` por período. O recebimento continua no financeiro. Faturada não é situação da ordem nem do contrato.
- A periodicidade é mensal, trimestral, semestral ou anual. A competência é Atual ou Anterior. As duas nascem com o contrato e não mudam depois da ativação.
- Atual vence no dia informado, no primeiro mês de cada período. Anterior vence no dia informado, no mês seguinte ao fim de cada período. A data de corte é o dia 1 desse mês de vencimento. A geração inclui todo período sem título cuja data de corte já chegou. Com fim, a ficha mostra a série inteira. Sem fim, mostra só o próximo vencimento ainda sem título.
- Vigência vencida é um aviso calculado pelas datas. A situação continua Vigente até alguém encerrar.
- Cancelar só cabe no rascunho. Depois de ativar, o caminho é suspender ou encerrar. Encerrar não apaga título já gerado.
- Troca do valor do período ou do dia de vencimento em contrato vigente grava o valor anterior no histórico e vale dali para a frente. Título já emitido permanece.
- Não há worker. A geração da cobrança é um clique na lista, para todos os vigentes. A ficha repete a mesma regra para um contrato.

## Entregas

### Entrega 1 — cadastro e vínculo

Entra:

- lista e ficha do contrato
- número sequencial da empresa
- cliente, título, vigência, observação
- cobrança nenhuma ou valor fixo do período, com periodicidade mensal, trimestral, semestral ou anual, competência Atual ou Anterior, dia de vencimento, fim de vigência opcional e forma comercial opcional
- a série de vencimentos calculada na ficha, ainda sem título; sem fim, só o próximo vencimento
- situações Rascunho, Vigente, Suspenso, Encerrado e Cancelado, com histórico
- na ordem, o tipo Contrato escolhe um contrato vigente do mesmo cliente

Fica para a entrega 2:

- gerar a conta a receber da competência

Fica para a entrega 3:

- serviço coberto, franquia de horas e o efeito disso no total da ordem

### Entrega 2 — cobrança do período

Entra o botão que cria um `receivables` para a próxima parcela da série que ainda não tem título. A forma e o meio copiam o que o financeiro já espera no título. A parcela não se repete.

### Entrega 3 — cobertura

Entra a lista de serviços do catálogo incluídos na cobrança do período e, se a empresa quiser, um limite de horas desse mesmo período. A ordem vinculada distingue linha coberta e linha cobrada. Essa entrega mexe no total da ordem e por isso não começa junto com o cadastro.

## Núcleo do contrato

| Campo               | Papel                                                                                                                         |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `number`            | Inteiro sequencial da empresa. Na tela, seis dígitos em grupos de três, como a ordem. O contador não reaproveita número.      |
| `personId`          | Cliente ativo, da mesma empresa, com `isClient`.                                                                              |
| `title`             | Nome curto do contrato, até 120 caracteres.                                                                                   |
| `status`            | Situação.                                                                                                                     |
| `startedOn`         | Início da vigência. Obrigatório.                                                                                              |
| `endedOn`           | Fim da vigência. Vazio significa prazo indeterminado, com ou sem cobrança. Quando preenchido, é igual ou posterior ao início. |
| `billingKind`       | `none`, `monthly`, `quarterly`, `semiannual` ou `annual`.                                                                     |
| `billingCompetence` | `current` ou `previous`. Obrigatório na cobrança recorrente. Vazio sem cobrança. Na tela, Atual e Anterior.                   |
| `periodAmount`      | Centavos do período. Zero quando não há cobrança. Maior que zero quando há.                                                   |
| `dueDay`            | Dia do vencimento, de 1 a 28. Obrigatório na cobrança recorrente. Vazio sem cobrança. O limite 28 evita mês curto.            |
| `paymentMethodId`   | Forma comercial da cobrança, opcional. A mesma `payment_methods` da ordem.                                                    |
| `notes`             | Texto livre.                                                                                                                  |
| `suspensionReason`  | Obrigatório enquanto Suspenso. Vazio nas outras situações.                                                                    |

O contrato nasce Rascunho, já com número. Rascunho edita cliente, título, datas, cobrança, periodicidade, competência, forma e observação. Vigente e Suspenso editam título, fim da vigência, observação e, pela regra de histórico, o valor do período e o dia. Cliente, início, número, periodicidade e competência não mudam depois da ativação. Encerrado e Cancelado não editam.

### Situação

| Valor       | Rótulo    |
| ----------- | --------- |
| `draft`     | Rascunho  |
| `active`    | Vigente   |
| `suspended` | Suspenso  |
| `closed`    | Encerrado |
| `cancelled` | Cancelado |

Transições:

- Rascunho → Vigente, Cancelado
- Vigente → Suspenso, Encerrado
- Suspenso → Vigente, Encerrado

Ativar exige cliente, título, início e cobrança válida. Suspender exige motivo. Retomar limpa o motivo. Encerrar grava a data de encerramento. Se o fim da vigência estiver vazio, o encerramento preenche `endedOn` com a data do dia. Se o fim já for futuro, permanece o fim informado e a situação passa a Encerrado mesmo assim: encerrar é um ato, não o calendário.

A lista mostra o aviso "Vigência vencida" quando a situação é Vigente ou Suspenso e `endedOn` é anterior a hoje. O aviso não muda a situação e não impede a ordem já vinculada.

### Histórico

Cada transição e cada troca de `periodAmount`, `dueDay`, `billingKind` ou `billingCompetence` grava uma linha em `contract_events` na mesma transação. A linha guarda situação anterior e nova, os valores de cobrança depois da gravação, o motivo quando houver, o usuário e o instante. A linha não se edita e não se apaga. No rascunho a periodicidade e a competência entram nesse histórico. Depois da ativação as duas não mudam, e o histórico de cobrança passa a registrar valor e dia.

## Vínculo com a ordem

`service_orders.contract_id` é opcional.

- Com tipo Contrato, a ordem aponta um contrato.
- Com outro tipo, `contract_id` fica vazio.
- O contrato é da mesma empresa e o cliente da ordem é o cliente do contrato.
- Na escolha, o contrato está Vigente.
- Uma ordem já vinculada continua apontando o mesmo contrato se ele for suspenso ou encerrado depois. Trocar o vínculo, ou escolher outro contrato, exige de novo um contrato Vigente.
- Ordem Entregue ou Cancelada não ganha nem perde vínculo.

O comprovante imprime o número do contrato quando houver vínculo. O rótulo é "Contrato". Não entra na aba dos onze campos.

Na ficha da ordem, com tipo Contrato, um texto fixo explica que a cobrança do período não abate os itens desta ordem. A entrega 3 é que passa a marcar o que está coberto.

O contrato lista as ordens que o apontam, com número, situação e total. A lista é só leitura.

## Cobrança recorrente

A série de vencimentos já aparece na entrega 1. O título em `receivables` entra na entrega 2.

### Periodicidade e competência

| `billingKind` | Rótulo       | Meses do período |
| ------------- | ------------ | ---------------- |
| `none`        | Sem cobrança | —                |
| `monthly`     | Mensal       | 1                |
| `quarterly`   | Trimestral   | 3                |
| `semiannual`  | Semestral    | 6                |
| `annual`      | Anual        | 12               |

| `billingCompetence` | Rótulo   | Vencimento                                            |
| ------------------- | -------- | ----------------------------------------------------- |
| `current`           | Atual    | Dia `dueDay` do primeiro mês do período               |
| `previous`          | Anterior | Dia `dueDay` do mês seguinte ao último mês do período |

O valor é o do período inteiro. Um contrato trimestral de R$ 300 gera um título de R$ 300 a cada trimestre, não três títulos de R$ 100. Período que ultrapassa o fim da vigência cobra o valor integral. Não há proporcionalidade.

A cobrança recorrente exige valor, dia e competência. O fim é opcional. Com fim, a ficha mostra a série fechada. Sem fim, o prazo é indeterminado e a ficha mostra só o próximo vencimento: o primeiro período, se nada foi cobrado, ou o período seguinte ao último já cobrado. Um fim preenchido depois não pode deixar de fora um período que já tem título. Apagar o fim conserva esses títulos e a cobrança segue.

### Como a série é montada

O primeiro período começa no mês de `startedOn`. Cada período seguinte começa depois do número de meses da periodicidade. Com fim, entra na série o período cujo mês inicial é o mês de `startedOn` ou posterior, e o mês de `endedOn` ou anterior. Sem fim, a leitura devolve um período só: o mais antigo cuja `competence` ainda não tem título. Se nenhum foi cobrado, é o primeiro.

Contrato de 01/11/2026 a 31/10/2027, dia 20:

| Periodicidade | Competência | Vencimentos                                                                                                                                    |
| ------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Mensal        | Atual       | 20/11/2026, 20/12/2026, 20/01/2027, 20/02/2027, 20/03/2027, 20/04/2027, 20/05/2027, 20/06/2027, 20/07/2027, 20/08/2027, 20/09/2027, 20/10/2027 |
| Mensal        | Anterior    | 20/12/2026, 20/01/2027, 20/02/2027, 20/03/2027, 20/04/2027, 20/05/2027, 20/06/2027, 20/07/2027, 20/08/2027, 20/09/2027, 20/10/2027, 20/11/2027 |
| Trimestral    | Atual       | 20/11/2026, 20/02/2027, 20/05/2027, 20/08/2027                                                                                                 |
| Trimestral    | Anterior    | 20/02/2027, 20/05/2027, 20/08/2027, 20/11/2027                                                                                                 |
| Semestral     | Atual       | 20/11/2026, 20/05/2027                                                                                                                         |
| Semestral     | Anterior    | 20/05/2027, 20/11/2027                                                                                                                         |
| Anual         | Atual       | 20/11/2026                                                                                                                                     |
| Anual         | Anterior    | 20/11/2027                                                                                                                                     |

Na competência Anterior o último vencimento pode cair depois de `endedOn`. No exemplo, a vigência termina em 31/10/2027 e o último título vence em 20/11/2027. Esse título permanece na série.

Alongar `endedOn` acrescenta períodos no fim da série. Encurtar remove períodos ainda sem título cujo mês inicial ficou depois do novo fim. Encurtar de modo a deixar de fora um período que já tem título é recusado. Apagar o fim não é encurtar: os títulos permanecem e a cobrança segue.

A data de corte da competência atual é o dia 1 do mês inicial do período. A da competência anterior é o dia 1 do período seguinte. O vencimento cai no dia do contrato, nesse mesmo mês. Um contrato que começa em 01/10/2026, anual e anterior, tem corte em 01/10/2027 e vencimento em 15/10/2027.

A geração inclui todo período sem título cuja data de corte é hoje ou anterior, do mais antigo ao mais novo. Período cuja data de corte ainda não chegou fica de fora. A ficha, sem fim, continua nomeando só o próximo vencimento.

Contrato mensal, competência anterior, dia 15, início em 01/10/2026 e sem fim, gerado em 07/11/2026: a data de corte 01/11/2026 já chegou, e nasce o título de 15/11/2026. O período de novembro espera 01/12/2026.

Trocar o dia ou o valor recalcula as parcelas ainda sem título. Parcela já gerada guarda o vencimento e o valor da geração.

### Geração da parcela

Na lista, um clique gera as parcelas de todos os contratos vigentes com cobrança recorrente cuja data de corte já chegou. Não pula competência e não escolhe outro vencimento. Sem fim, a fila segue enquanto o contrato estiver vigente. A ficha de um contrato usa a mesma regra, só para ele.

Suspenso, Encerrado, Cancelado e Rascunho não geram. Título já criado permanece se o contrato for suspenso ou encerrado depois. Se o vencimento já passou, o título nasce vencido.

A cobrança grava `contract_billings` e um `receivables` na mesma transação.

| Campo do título     | Origem                                                                                |
| ------------------- | ------------------------------------------------------------------------------------- |
| `debtorId`          | Cliente do contrato                                                                   |
| `installmentAmount` | `periodAmount` vigente na geração                                                     |
| `dueOn`             | Vencimento da parcela na série                                                        |
| `issueOn`           | Data do dia                                                                           |
| `description`       | `Contrato 000.001 · competência 11/2026` no mensal. Nos demais, `11/2026 a 01/2027`.  |
| `paymentMethodId`   | Forma do contrato, se houver                                                          |
| `planAccountId`     | Conta de receita do contrato, se houver. Título já emitido guarda a conta da geração. |
| `status`            | `pendente`                                                                            |
| `documentNumber`    | Número do contrato, seis dígitos sem pontos, mais o início do período em `AAAAMM`     |

`contract_billings` guarda contrato, início do período, vencimento calculado, valor cobrado e o título. A unicidade é empresa + contrato + início do período. Repetir a geração da mesma parcela responde que a cobrança já existe e devolve a mesma linha.

Cancelar o título no financeiro não apaga a cobrança. Uma nova geração daquela parcela fica para uma entrega em que o estorno do título esteja definido. Nesta, o usuário cancela o título pelo caminho que o financeiro já tem e a parcela continua ocupada.

## Cobertura

Vale na entrega 3. O desenho abaixo existe para a entrega 1 não ocupar esses nomes com outro sentido.

O contrato vigente com cobrança recorrente pode listar itens de serviço do catálogo como cobertos. Pode informar `includedMinutes` do período, vazio quando não há franquia. O período da franquia é o mesmo da periodicidade.

Na ordem vinculada:

- linha de serviço cujo item está coberto na geração da ordem entra com preço zero e o marcador coberto
- linha de produto continua cobrada
- linha de serviço fora da cobertura continua cobrada
- a franquia, quando houver, consome minutos apontados na ordem e o excedente volta a ter preço
- o consumo fica em lançamentos com estorno, um por ordem, e não num acumulador solto

Até lá, o marcador não existe e o preço da ordem é o que o usuário digitou.

## Modelo de dados

### Entrega 1

`contract_counters` — uma linha por empresa, `last_number` a partir de zero. Igual a `service_order_counters`.

`contracts`

| Coluna               | Tipo                                                        |
| -------------------- | ----------------------------------------------------------- |
| `id`                 | uuid                                                        |
| `tenant_id`          | uuid, com o restante de `tenantColumns`                     |
| `number`             | integer, único por empresa, maior que zero                  |
| `person_id`          | uuid, pessoa da empresa                                     |
| `title`              | varchar(120)                                                |
| `status`             | enum `draft`, `active`, `suspended`, `closed`, `cancelled`  |
| `started_on`         | date                                                        |
| `ended_on`           | date, nulo só quando `billing_kind` é `none`                |
| `billing_kind`       | enum `none`, `monthly`, `quarterly`, `semiannual`, `annual` |
| `billing_competence` | enum `current`, `previous`, nulo quando não há cobrança     |
| `period_amount`      | integer, zero ou positivo                                   |
| `due_day`            | smallint, nulo ou de 1 a 28                                 |
| `payment_method_id`  | uuid, nulo, forma da empresa                                |
| `notes`              | text, vazio por padrão                                      |
| `suspension_reason`  | varchar(200), nulo                                          |
| `closed_on`          | date, nulo                                                  |
| `created_at`         | timestamp                                                   |

Restrições:

- cobrança recorrente exige valor maior que zero, dia preenchido e competência; o fim pode ficar vazio
- sem cobrança, valor zero, dia vazio e competência vazia
- suspenso exige motivo preenchido; as outras situações exigem motivo vazio
- `ended_on` nulo ou `ended_on >= started_on`
- encerrado exige `closed_on`; as outras situações exigem `closed_on` vazio
- chave única `(id, tenant_id)` e `(tenant_id, number)`

`contract_events`

| Coluna               | Tipo                      |
| -------------------- | ------------------------- |
| `id`                 | uuid                      |
| `tenant_id`          | uuid                      |
| `contract_id`        | uuid, contrato da empresa |
| `kind`               | enum `status`, `billing`  |
| `from_status`        | enum, nulo na abertura    |
| `to_status`          | enum                      |
| `billing_kind`       | enum                      |
| `billing_competence` | enum, nulo                |
| `period_amount`      | integer                   |
| `due_day`            | smallint, nulo            |
| `reason`             | varchar(200), nulo        |
| `actor_user_id`      | uuid, usuário da empresa  |
| `created_at`         | timestamp                 |

A abertura grava `kind = status`, `from_status` nulo e `to_status = draft`.

`service_orders.contract_id` uuid nulo, chave `(contract_id, tenant_id)` para `contracts`. Restrição: `contract_id` nulo ou `attendance = 'contract'`.

### Entrega 2

`contract_billings`

| Coluna          | Tipo                                    |
| --------------- | --------------------------------------- |
| `id`            | uuid                                    |
| `tenant_id`     | uuid                                    |
| `contract_id`   | uuid                                    |
| `competence`    | date, dia 1 do mês de início do período |
| `due_on`        | date, vencimento da parcela na série    |
| `amount`        | integer, maior que zero                 |
| `receivable_id` | uuid, título da empresa                 |
| `created_at`    | timestamp                               |

Único por `(tenant_id, contract_id, competence)` e por `(tenant_id, receivable_id)`.

## Regras que a API recusa

| Caso                                                                                      | Resposta                                         |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Transição fora da lista                                                                   | 400, a situação não pode seguir para a escolhida |
| Ativar sem cobrança válida                                                                | 400                                              |
| Suspender sem motivo                                                                      | 400                                              |
| Editar contrato encerrado ou cancelado                                                    | 400                                              |
| Trocar cliente, início, periodicidade ou competência depois do rascunho                   | 400                                              |
| Encurtar a vigência e deixar de fora um período que já tem título                         | 400                                              |
| Ordem Contrato sem contrato                                                               | 400                                              |
| Ordem de outro tipo com contrato                                                          | 400                                              |
| Contrato de outro cliente, de outra empresa, ou que não está vigente na escolha           | 400                                              |
| Gerar parcela que não é a próxima da fila, ou quando o fim existe e a série já foi gerada | 400                                              |
| Repetir a geração da parcela que já tem título                                            | 409, devolve a cobrança existente                |
| Gerar com contrato que não está vigente                                                   | 400                                              |

## Telas

O menu ganha Contratos ao lado de Ordens de serviço.

A lista tem busca por número, título e nome do cliente, e filtro pela situação. A linha mostra número, cliente, título, situação, vigência e o valor com a periodicidade, ou "Sem cobrança". Sem fim, a vigência mostra o início seguido de "indeterminado". O aviso de vigência vencida aparece na linha quando há fim anterior a hoje.

A ficha é uma página, no mesmo padrão da ordem. O fim em branco leva o texto "Em branco, o prazo fica indeterminado." A cobrança recorrente escolhe a periodicidade e a competência, Atual ou Anterior. Com fim, mostra a série. Sem fim, e com competência e dia preenchidos, mostra "Próximo vencimento" com a data do período mais antigo sem título e o texto "Sem data de fim, a cobrança segue um período por vez." Rascunho mostra Ativar e Cancelar. Vigente mostra Suspender e Encerrar. Suspenso mostra Retomar e Encerrar. Na entrega 2, a lista tem o clique que gera as parcelas cuja data de corte já chegou. A ficha do contrato vigente gera as dele. O histórico fica na própria ficha, do mais recente para o mais antigo. Salvar volta à lista.

Na ordem, o tipo Contrato abre a escolha dos contratos vigentes daquele cliente. Sem cliente, a escolha fica desabilitada. O número escolhido aparece no comprovante.

## Fora de escopo

- redesenhar as oito situações da ordem
- situação de faturamento dentro da ordem
- gerar título ao entregar a ordem
- baixar estoque, emitir nota, WhatsApp, foto e assinatura
- contrato em que a empresa é a cliente
- mais de um cliente no mesmo contrato
- renovação automática e alerta
- reajuste por IPCA, IGP-M ou percentual em lote
- aditivo como documento, com versão imutável das cláusulas
- anexo e assinatura
- SLA, agenda de técnico e apontamento de horas
- várias políticas de cobrança no mesmo contrato
- periodicidade bimestral ou outro intervalo além de mensal, trimestral, semestral e anual
- gerar um vencimento fora da série, ou pular uma parcela
- proporcionalidade quando o período atravessa o fim da vigência
- worker diário
