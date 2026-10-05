Dá para encaixar no modelo atual **sem** criar pagar/receber para aplicação e resgate. O fluxo de 60 dias hoje soma **caixa + todas as contas bancárias** e depois só projeta títulos pendentes:

```531:538:apps/api/src/services/settlement.ts
  const [banks] = await db
    .select({
      balance: sql<number>`coalesce(sum(${bankAccounts.balance}), 0)`,
    })
    .from(bankAccounts)
    .where(eq(bankAccounts.tenantId, tenantId));

  const openingBalance = Number(cash?.balance ?? 0) + Number(banks?.balance ?? 0);
```

Qualquer CDB, fundo ou poupança cadastrado como conta bancária entra nesse saldo. Por isso o tipo da conta precisa existir **antes** da transferência.

## 1. Tipo da conta

Em `bank_accounts`, um campo `kind`:

- `operating` — corrente, caixa bancário (entra no fluxo)
- `investment` — aplicação (tem extrato e saldo, **não** entra no fluxo)

O fluxo passa a somar só `kind = operating` + livro caixa.

A conta de investimento continua com data/valor de saldo inicial, extrato e conciliação. Só muda a regra: **não liquidar título nela** (Pagar/Receber só em caixa ou conta operacional).

## 2. Transferência (um documento, dois lançamentos)

Aplicação e resgate são o mesmo movimento: **transferência entre tesourarias**.

Um registro `treasury_transfers`:

- data, valor, origem, destino (`cash` ou conta)
- origem ≠ destino
- se um lado for investimento, o outro deve ser operacional (caixa ou corrente)

Na mesma transação:

| Movimento | Origem | Destino |
|---|---|---|
| **Aplicação** | saída no caixa/banco | entrada na conta de investimento |
| **Resgate** | saída no investimento | entrada no caixa/banco |
| **Entre correntes** | saída numa operacional | entrada na outra |

Os dois lançamentos (`cash_entries` / `bank_entries`) ficam ligados pelo `transferId`. Não são receita, despesa nem título. Recalcula os saldos como hoje.

Efeito no fluxo:

- Aplicar R$ 10.000: o operacional cai R$ 10.000; o investimento sobe, mas o fluxo **não** recupera esses 10 mil. Correto: o dinheiro saiu da tesouraria imediata.
- Resgatar R$ 10.000: o operacional sobe; o fluxo volta a enxergar o valor.

Rendimento creditado **só** no investimento (juros do CDB) também fica de fora do fluxo até o resgate. Aí entra no operacional como transferência, não como receber.

## 3. O que não fazer

Não lançar aplicação como **conta a pagar** nem resgate como **receber**. Esses títulos entram na projeção de 60 dias e distorcem o fluxo.

Não usar só uma conta do plano (`bank` / `withdrawal`) sem tipo na tesouraria: o `sum(bank_accounts.balance)` continuaria misturando CDB com corrente.

## 4. Tela

No cadastro da conta: **Operacional** ou **Investimento**.

Um modal **Transferir**: data, valor, origem, destino. Atalhos “Aplicar” e “Resgatar” só escolhem os lados.

Na lista, saldo de investimento separado do operacional. No fluxo, deixar explícito: “saldo de tesouraria (caixa + contas operacionais)”.

## 5. Ordem sugerida

1. `kind` na conta e filtro no `listCashFlow`
2. Transferência caixa ↔ banco ↔ investimento
3. Só então bloqueio de baixa em conta de investimento
