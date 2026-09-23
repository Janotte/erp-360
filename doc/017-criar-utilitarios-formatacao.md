Para manter o código limpo e evitar repetições no frontend React, o local ideal para colocar esses utilitários é dentro do seu pacote compartilhado @erp-360/shared (ou packages/shared). Dessa forma, qualquer aplicação do monorepo terá acesso imediato às mesmas regras de formatação.
Vamos criar funções puras para formatar centavos inteiros em Real (R$) e strings de datas ISO (YYYY-MM-DD) no padrão brasileiro (DD/MM/AAAA).
------------------------------

## 📦 Passo 1: Adicionar os Utilitários no Pacote Compartilhado

Abra o arquivo principal de exportações do seu pacote compartilhado (ex: packages/shared/src/index.ts ou onde você gerencia as funções utilitárias do @erp-360/shared) e adicione as seguintes funções:

```ts
/**
 * Transforma um valor inteiro em centavos para uma string formatada em Real (R\$).
 * @example formatCurrency(1050) => "R\$ 10,50"
 * @example formatCurrency(100050) => "R\$ 1.000,50"
 */
export function formatCurrency(valueInCents: number | null | undefined): string {
  if (valueInCents === null || valueInCents === undefined) {
    return 'R\$ 0,00';
  }

  const valueInReais = valueInCents / 100;

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(valueInReais);
}
```

```ts
/**
 * Transforma uma string de data pura (YYYY-MM-DD) no formato brasileiro (DD/MM/AAAA).
 * Evita problemas de fuso horário pois faz manipulação direta de strings.
 * @example formatRawDate("2026-10-25") => "25/10/2026"
 */
export function formatRawDate(dataString: string | null | undefined): string {
  if (!dataString) return '-';

  // Corta apenas a parte da data caso venha algum resquício de ISO completa (timestamp)
  const dateOnly = dataString.split('T')[0];
  const parts = dateOnly.split('-');

  if (parts.length !== 3) return dataString;

  const [year, month, day] = parts;
  return `${day}/${month}/${year}`;
}
```

---

## 💻 Passo 2: Como Utilizar no Frontend React (apps/ui)

Graças à arquitetura de Monorepo com o pnpm, assim que você salvar o arquivo acima, o seu frontend React já terá acesso imediato a essas funções através do autocomplete do TypeScript.
Veja um exemplo prático de como aplicar esses utilitários na listagem de tabelas do shadcn/ui dentro do seu frontend:

```ts
import { formatarDataPura, formatarMoeda } from '@erp-360/shared';
// Exemplo hipotético de renderização de uma linha da tabela de Contas a Pagar
export function LinhaContaPagar({ conta }: { conta: any }) {
    return (
        <tr>
            {/* Exibindo a descrição do lançamento */}
            <td>{conta.description}</td>

            {/* Aplicando utilitário monetário: transforma 150050 em R$ 1.500,50 */}
            <td>{formatarMoeda(conta.amount)}</td>

            {/* Aplicando utilitário de data: transforma "2026-10-25" em "25/10/2026" */}
            <td>{formatarDataPura(conta.dueDate)}</td>

            <td>
                <span className={conta.status === 'pago' ? 'text-green-600' : 'text-amber-600'}>
                    {conta.status.toUpperCase()}
                </span>
            </td>
        </tr>

    );
}
```

## 💡 Por que essa abordagem é segura para o ERP?

1.  Sem fuso horário corrompido: A função formatarDataPura quebra a string diretamente usando .split('-'). Se usássemos new Date(dataString), o JavaScript local do navegador do usuário tentaria aplicar o fuso horário da máquina, podendo retroceder o dia do vencimento em um dia (um boleto do dia 25 viraria dia 24).
2.  Precisão matemática: A função formatarMoeda apenas divide por 100 na hora de exibir visualmente, mantendo toda a consistência de inteiros que o banco de dados exige.
