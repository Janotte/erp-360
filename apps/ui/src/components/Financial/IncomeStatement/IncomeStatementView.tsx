import { formatCurrency, planAccountDreLineLabels } from '@erp-360/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { treasuryService } from '@/services/treasury';

function isoDate(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function currentMonth() {
  const today = new Date();
  return {
    from: isoDate(new Date(today.getFullYear(), today.getMonth(), 1)),
    to: isoDate(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
  };
}

const lineSign: Record<string, string> = {
  gross_revenue: '',
  deduction: '(−) ',
  cost: '(−) ',
  operating_expense: '(−) ',
  financial_income: '(+) ',
  financial_expense: '(−) ',
  other_income: '(+) ',
  other_expense: '(−) ',
};

export function IncomeStatementView() {
  const initial = currentMonth();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const periodValid = from !== '' && to !== '' && from <= to;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['treasury', 'income-statement', from, to],
    queryFn: () => treasuryService.incomeStatement(from, to),
    enabled: periodValid,
  });

  const lineByKey = new Map(data?.lines.map((line) => [line.line, line]));

  const rows = data
    ? [
        { key: 'gross_revenue', kind: 'line' as const },
        { key: 'deduction', kind: 'line' as const },
        { key: 'net', kind: 'total' as const, label: 'Receita líquida', amount: data.netRevenue },
        { key: 'cost', kind: 'line' as const },
        { key: 'gross', kind: 'total' as const, label: 'Lucro bruto', amount: data.grossProfit },
        { key: 'operating_expense', kind: 'line' as const },
        {
          key: 'operating',
          kind: 'total' as const,
          label: 'Resultado operacional',
          amount: data.operatingResult,
        },
        { key: 'financial_income', kind: 'line' as const },
        { key: 'financial_expense', kind: 'line' as const },
        {
          key: 'financial',
          kind: 'total' as const,
          label: 'Resultado financeiro',
          amount: data.financialResult,
        },
        { key: 'other_income', kind: 'line' as const },
        { key: 'other_expense', kind: 'line' as const },
        {
          key: 'net-income',
          kind: 'total' as const,
          label: 'Lucro líquido',
          amount: data.netIncome,
        },
      ]
    : [];

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-bold text-zinc-900">DRE</h3>
        <p className="text-sm text-zinc-500">
          Soma os recebimentos e pagamentos do período pela linha da conta. Saldo inicial
          e transferência entre caixa e banco ficam de fora.
        </p>
      </div>

      <div className="flex flex-col gap-3 bg-white p-4 rounded-lg border border-zinc-200 sm:flex-row sm:items-end">
        <div className="space-y-1">
          <Label htmlFor="dre-from">De</Label>
          <Input
            id="dre-from"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="dre-to">Até</Label>
          <Input
            id="dre-to"
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </div>
      </div>

      {!periodValid ? (
        <p className="text-sm text-destructive">
          A data inicial não pode ser posterior à data final.
        </p>
      ) : null}

      <div className="rounded-md border border-zinc-200 bg-white shadow-2xs">
        {isLoading ? (
          <p className="px-4 py-6 text-sm text-zinc-500">Carregando DRE...</p>
        ) : isError ? (
          <p className="px-4 py-6 text-sm text-destructive">
            {error instanceof Error ? error.message : 'Falha ao carregar a DRE.'}
          </p>
        ) : (
          <div className="divide-y divide-zinc-100">
            {rows.map((row) => {
              if (row.kind === 'total') {
                return (
                  <div
                    key={row.key}
                    className="flex items-center justify-between bg-zinc-50 px-4 py-3 font-semibold"
                  >
                    <span>(=) {row.label}</span>
                    <span className="tabular-nums">{formatCurrency(row.amount)}</span>
                  </div>
                );
              }

              const line = lineByKey.get(
                row.key as
                  | 'gross_revenue'
                  | 'deduction'
                  | 'cost'
                  | 'operating_expense'
                  | 'financial_income'
                  | 'financial_expense'
                  | 'other_income'
                  | 'other_expense',
              );
              if (!line) return null;
              return (
                <div key={row.key} className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span>
                      {lineSign[line.line]}
                      {planAccountDreLineLabels[line.line]}
                    </span>
                    <span className="tabular-nums">{formatCurrency(line.amount)}</span>
                  </div>
                  {line.accounts.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-sm text-zinc-500">
                      {line.accounts.map((account) => (
                        <li
                          key={account.accountCode}
                          className="flex items-center justify-between gap-4 pl-4"
                        >
                          <span>
                            {account.accountCode} {account.name}
                          </span>
                          <span className="tabular-nums">{formatCurrency(account.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
