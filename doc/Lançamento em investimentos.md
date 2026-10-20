# Lançamento em investimentos

Use a conta do tipo **Investimento** para aplicação financeira, como CDB, fundo ou poupança. O saldo dela fica no extrato, mas **não entra no fluxo de caixa**. O dinheiro só volta ao fluxo quando é resgatado para o caixa ou para uma conta corrente.

Não lance aplicação, rendimento, IRRF ou resgate como conta a pagar ou conta a receber. Esses títulos entrariam na projeção de caixa e duplicariam o movimento.

## Preparar a conta

Em **Contas bancárias**, cadastre a aplicação com o tipo **Investimento**.

Informe a data e o valor do saldo inicial. Esse saldo é o ponto de partida do extrato. Ele não é receita.

A conta corrente do mesmo banco continua como **Operacional**.

## O que lançar em cada lugar

| Movimento | Onde lançar | Efeito |
| --- | --- | --- |
| Saldo anterior | Saldo inicial da conta de investimento | Sobe o saldo da aplicação. Não entra na DRE. |
| Rendimento | **Lançar**, entrada | Sobe o saldo da aplicação e entra na DRE como receita financeira. |
| IRRF | **Lançar**, saída | Desce o saldo da aplicação. A conta do plano define se vira ativo compensável ou despesa. |
| Aplicação | **Aplicar** | Sai do caixa ou da conta corrente e entra na aplicação. Não entra na DRE. |
| Resgate | **Resgatar** | Sai da aplicação e entra no caixa ou na conta corrente. Não entra na DRE. |
| Saldo atual do extrato | Não lançar | É só a conferência do saldo depois dos movimentos. |

## Lançar rendimento ou IRRF

1. Abra **Contas bancárias** e selecione a conta de investimento.
2. Clique em **Lançar**.
3. Informe a data, o histórico, se é entrada ou saída, o valor e a conta do plano.
4. Confirme.

Esse lançamento fica só na aplicação. A conta corrente não se altera.

- Rendimento: **Entrada**, na conta de receita financeira.
- IRRF compensável: **Saída**, numa conta de ativo (IRRF a recuperar).
- IRRF definitivo: **Saída**, numa conta de despesa ou dedução. Nesse caso o valor entra na DRE.

**Excluir** aparece na linha enquanto o lançamento não estiver conciliado. Saldo inicial, transferência e baixa de título não se excluem por esse botão.

## Aplicar e resgatar

Use **Aplicar** para enviar dinheiro do caixa ou da conta corrente para a aplicação.

Use **Resgatar** para trazer dinheiro da aplicação para o caixa ou para a conta corrente. Os dois lados são gravados juntos. **Estornar** remove os dois.

## Exemplo: Sicredi SICREDINVEST

Saldo anterior em 31/08/2026: **R$ 1.771,65**.

Movimentos de 16/10/2026:

| Histórico | Lançamento | Valor |
| --- | --- | --- |
| Rendimentos | Entrada na aplicação, conta de receita financeira | R$ 537,80 |
| Encargos de IRRF | Saída na aplicação, conta de IRRF | R$ 80,67 |
| Resgates | **Resgatar** da aplicação para a conta corrente Sicredi | R$ 1.157,13 |

Conferência:

```text
1.771,65 + 537,80 − 80,67 − 1.157,13 = 1.071,65
```

O saldo de 20/10/2026, **R$ 1.071,65**, não é um novo lançamento. A conta corrente Sicredi recebe somente o resgate de **R$ 1.157,13**.
