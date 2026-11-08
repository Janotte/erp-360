# Faturamento de contratos — plano de implementação

> A lista cobra, num clique, todo contrato vigente cuja data de corte já chegou. Cada período vira uma linha em `contract_billings` e um recebível. Repetir a competência não cria outro título.

**Spec:** `docs/superpowers/specs/2026-11-07-contratos-e-ordem-de-servico.md` e `docs/superpowers/specs/2026-11-07-faturamento.md`

Esta entrega não cria documento comercial, NFS-e, NF-e, fila, worker nem cobrança de ordem de serviço.

## Regra da data de corte

O dia do contrato é o dia de vencimento. A data de corte é o dia 1 do mês desse vencimento.

- Competência atual: a data de corte é o dia 1 do mês em que o período começa.
- Competência anterior: a data de corte é o dia 1 do período seguinte, que é o mês do vencimento.
- O vencimento cai no dia do contrato, nesse mesmo mês.
- A geração inclui cada período sem título cuja data de corte é hoje ou anterior, do mais antigo ao mais novo. Período com data de corte no futuro fica de fora.
- Sem data de fim, a fila segue. Com data de fim, entra o período cujo mês inicial ainda está dentro da vigência.

O contrato 000.001, início 01/10/2026, mensal, competência anterior, dia 15, gerado em 07/11/2026, produz um recebível de R$ 1.070,00 com vencimento em 15/11/2026. A competência gravada é 01/10/2026. O período de novembro espera a data de corte 01/12/2026 e vence em 15/12/2026.

Anual, competência anterior, início 01/10/2026 e dia 15 tem data de corte 01/10/2027 e vencimento 15/10/2027.

## O que entra na geração

Só contrato vigente com cobrança. Rascunho, suspenso, encerrado, cancelado e sem cobrança ficam de fora.

Cada contrato roda na própria transação. A falha de um não desfaz os outros. A resposta lista o que falhou.

A competência já gravada não gera de novo. Cancelar o recebível no financeiro não apaga `contract_billings` e não libera o período.

O título nasce com o valor do período na hora da geração. Mudar o valor ou o dia do contrato depois não reescreve título já emitido. Se o vencimento já passou, o título nasce pendente e a lista o mostra atrasado.

## Recebível

| Campo           | Origem                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------ |
| Devedor         | Cliente do contrato                                                                                          |
| Valor           | Valor do período, em centavos                                                                                |
| Vencimento      | Vencimento da parcela                                                                                        |
| Emissão         | Hoje, no fuso da cidade da empresa                                                                           |
| Descrição       | Mensal: `Contrato 000.001 · competência 10/2026`. Demais: `Contrato 000.001 · competência 10/2026 a 12/2026` |
| Forma           | Forma do contrato, quando houver, com o meio dessa forma                                                     |
| Plano de contas | Conta de receita do contrato, quando houver. Título já emitido guarda a conta da geração.                    |
| Situação        | `pendente`                                                                                                   |
| Documento       | Número do contrato, seis dígitos sem pontos, mais o início do período em `AAAAMM`                            |

`contract_billings` guarda contrato, competência (dia 1 do mês inicial), vencimento calculado, valor cobrado e o recebível. Único por empresa, contrato e competência, e por empresa e recebível.

## API e telas

- `GET /contracts/billings/preview` conta contratos, títulos e valor. `contractId` restringe a um contrato.
- `POST /contracts/billings` grava. O corpo pode trazer `contractId`.
- Na lista, Gerar cobranças mostra a contagem e só grava depois de Confirmar.
- Na ficha do vigente com cobrança, o mesmo gesto vale para aquele contrato.
- Zero títulos responde sem gravar: nenhuma parcela pronta para cobrança.

## Arquivos

- `packages/shared/src/utils/contractBilling.ts`: `contractInstallmentsDue`.
- `packages/modules/contracts/src/db/contracts.ts`: tabela `contract_billings` e a migração seguinte.
- `apps/api/src/modules/contracts/billings.ts`: prévia e geração.
- `apps/api/src/modules/contracts/clock.ts`: hoje no fuso da empresa, usado também pelo cadastro.
- Lista e ficha em `apps/ui`.

## Testes que travam a regra

- Em 07/11/2026, o mensal anterior de 01/10/2026 e dia 15 devolve só a competência 01/10/2026, vencimento 15/11/2026.
- O anual anterior correspondente não entra em 07/11/2026 e vence em 15/10/2027.
- Vários cortes passados entram na mesma geração, do mais antigo ao mais novo. Competência já cobrada não volta.
- A API grava o recebível com documento, descrição, forma e valor. A segunda chamada cria zero títulos. Cancelar o recebível também não cria outro.
- Suspenso, rascunho e sem cobrança não geram.
