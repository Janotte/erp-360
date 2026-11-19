import {
  formatCurrency,
  formatRawDate,
  type PlanAccountDreLine,
  planAccountDreLineLabels,
} from '@erp-360/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate, useSearchParams } from 'react-router';

import { Button } from '@/components/ui/button';
import { FloatingInput } from '@/components/ui/FloatingField';
import { ListMessage, ListPanel } from '@/components/ui/ListShell';
import { StatusListHeader, StatusListRow } from '@/components/ui/StatusList';
import { type StatusTone } from '@/components/ui/statusTone';
import { treasuryService } from '@/services/treasury';

const columns = 'grid grid-cols-[minmax(0,1fr)_140px]';

const inflowTone: StatusTone = {
  background: '#ECFDF5',
  hover: '#D1FAE5',
  border: '#059669',
  text: '#047857',
};

const outflowTone: StatusTone = {
  background: '#FEF2F2',
  hover: '#FEE2E2',
  border: '#DC2626',
  text: '#B91C1C',
};

const plainTone: StatusTone = {
  background: '#FFFFFF',
  hover: '#F8FAFC',
  border: '#94A3B8',
  text: '#172337',
};

const accountTone: StatusTone = {
  background: '#FFFFFF',
  hover: '#F8FAFC',
  border: '#E2E8F0',
  text: '#334155',
};

const reducingLines = new Set<PlanAccountDreLine>([
  'deduction',
  'cost',
  'operating_expense',
  'financial_expense',
  'other_expense',
]);

const lineSign: Record<PlanAccountDreLine, string> = {
  gross_revenue: '',
  deduction: '(−) ',
  cost: '(−) ',
  operating_expense: '(−) ',
  financial_income: '(+) ',
  financial_expense: '(−) ',
  other_income: '(+) ',
  other_expense: '(−) ',
};

type StatementRow =
  | { key: PlanAccountDreLine; kind: 'line' }
  | { key: string; kind: 'total'; label: string; field: TotalField };

type TotalField =
  'netRevenue' | 'grossProfit' | 'operatingResult' | 'financialResult' | 'netIncome';

const statementRows: StatementRow[] = [
  { key: 'gross_revenue', kind: 'line' },
  { key: 'deduction', kind: 'line' },
  { key: 'net', kind: 'total', label: 'Receita líquida', field: 'netRevenue' },
  { key: 'cost', kind: 'line' },
  { key: 'gross', kind: 'total', label: 'Lucro bruto', field: 'grossProfit' },
  { key: 'operating_expense', kind: 'line' },
  {
    key: 'operating',
    kind: 'total',
    label: 'Resultado operacional',
    field: 'operatingResult',
  },
  { key: 'financial_income', kind: 'line' },
  { key: 'financial_expense', kind: 'line' },
  {
    key: 'financial',
    kind: 'total',
    label: 'Resultado financeiro',
    field: 'financialResult',
  },
  { key: 'other_income', kind: 'line' },
  { key: 'other_expense', kind: 'line' },
  { key: 'net-income', kind: 'total', label: 'Lucro líquido', field: 'netIncome' },
];

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

function previousMonth() {
  const today = new Date();
  return {
    from: isoDate(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
    to: isoDate(new Date(today.getFullYear(), today.getMonth(), 0)),
  };
}

function currentYear() {
  const today = new Date();
  return {
    from: isoDate(new Date(today.getFullYear(), 0, 1)),
    to: isoDate(new Date(today.getFullYear(), 11, 31)),
  };
}

function readDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return value;
}

function resultTone(amount: number, reduces = false): StatusTone {
  if (amount === 0) return plainTone;
  const favorable = reduces ? amount < 0 : amount > 0;
  return favorable ? inflowTone : outflowTone;
}

function samePeriod(
  left: { from: string; to: string },
  right: { from: string; to: string },
) {
  return left.from === right.from && left.to === right.to;
}

export function IncomeStatementView() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const month = currentMonth();
  const from = readDate(params.get('de')) ?? month.from;
  const to = readDate(params.get('ate')) ?? month.to;
  const period = { from, to };
  const periodValid = from <= to;
  const listUrl = `/income-statement${location.search}`;

  const statement = useQuery({
    queryKey: ['treasury', 'income-statement', from, to],
    queryFn: () => treasuryService.incomeStatement(from, to),
    enabled: periodValid,
    placeholderData: periodValid ? keepPreviousData : undefined,
  });

  const setPeriod = (nextFrom: string, nextTo: string) => {
    const next = new URLSearchParams(params);
    const initial = currentMonth();
    if (nextFrom === initial.from && nextTo === initial.to) {
      next.delete('de');
      next.delete('ate');
    } else {
      next.set('de', nextFrom);
      next.set('ate', nextTo);
    }
    setParams(next, { replace: true });
  };

  const data = periodValid ? statement.data : undefined;
  const netIncome = data?.netIncome ?? 0;
  const chipTone = data ? resultTone(netIncome) : plainTone;
  const lineByKey = new Map(data?.lines.map((line) => [line.line, line]));
  const presets = [
    { label: 'Este mês', period: month },
    { label: 'Mês anterior', period: previousMonth() },
    { label: 'Este ano', period: currentYear() },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#172337]">DRE</h2>
          <p className="mt-1 text-sm text-[#64748b]">
            {periodValid
              ? `${formatRawDate(from)} a ${formatRawDate(to)}.`
              : 'A data inicial precisa ser anterior ou igual à data final.'}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <FloatingInput
            label="De"
            type="date"
            value={from}
            className="w-40"
            onChange={(event) => {
              if (event.target.value) setPeriod(event.target.value, to);
            }}
          />
          <FloatingInput
            label="Até"
            type="date"
            value={to}
            className="w-40"
            onChange={(event) => {
              if (event.target.value) setPeriod(from, event.target.value);
            }}
          />
          {presets.map((preset) => (
            <Button
              key={preset.label}
              type="button"
              variant={samePeriod(period, preset.period) ? 'default' : 'outline'}
              className="h-11"
              onClick={() => setPeriod(preset.period.from, preset.period.to)}
            >
              {preset.label}
            </Button>
          ))}
          <div className="rounded-[10px] border border-[#dfe5ee] bg-white px-4 py-2 text-right">
            <p className="text-xs text-[#64748b]">Lucro líquido</p>
            <p
              className="text-lg font-semibold tabular-nums"
              style={{ color: data ? chipTone.text : '#172337' }}
            >
              {data ? formatCurrency(netIncome) : '—'}
            </p>
          </div>
        </div>
      </div>

      <ListPanel
        title="Demonstração"
        description="Soma os recebimentos e pagamentos do período pela linha da conta. Saldo inicial e transferência entre caixa e banco ficam de fora."
      >
        <StatusListHeader columns={columns}>
          <span>Linha</span>
          <span className="text-right">Valor</span>
        </StatusListHeader>

        {!periodValid ? (
          <ListMessage>Ajuste o período para montar a demonstração.</ListMessage>
        ) : statement.isLoading ? (
          <ListMessage>Carregando a DRE...</ListMessage>
        ) : statement.isError || !data ? (
          <ListMessage tone="error">
            {statement.error instanceof Error
              ? statement.error.message
              : 'Não foi possível carregar a DRE.'}
          </ListMessage>
        ) : (
          statementRows.map((row) => {
            if (row.kind === 'total') {
              const amount = data[row.field];
              return (
                <StatusListRow
                  key={row.key}
                  columns={columns}
                  tone={resultTone(amount)}
                  label={`(=) ${row.label}, ${formatCurrency(amount)}`}
                >
                  <span className="min-w-0 truncate font-bold text-[var(--status-text)]">
                    (=) {row.label}
                  </span>
                  <span className="text-right font-bold tabular-nums text-[var(--status-text)]">
                    {formatCurrency(amount)}
                  </span>
                </StatusListRow>
              );
            }

            const line = lineByKey.get(row.key);
            if (!line) return null;
            const tone = resultTone(line.amount, reducingLines.has(line.line));
            const title = `${lineSign[line.line]}${planAccountDreLineLabels[line.line]}`;
            return (
              <div key={row.key}>
                <StatusListRow
                  columns={columns}
                  tone={tone}
                  label={`${title}, ${formatCurrency(line.amount)}`}
                >
                  <span className="min-w-0 truncate font-medium text-[var(--status-text)]">
                    {title}
                  </span>
                  <span className="text-right tabular-nums text-[var(--status-text)]">
                    {formatCurrency(line.amount)}
                  </span>
                </StatusListRow>
                {line.accounts.map((account) => (
                  <StatusListRow
                    key={account.id}
                    columns={columns}
                    tone={accountTone}
                    label={`${account.accountCode} ${account.name}, ${formatCurrency(account.amount)}`}
                    onOpen={() =>
                      navigate(`/plan-accounts/${account.id}`, {
                        state: { from: listUrl },
                      })
                    }
                  >
                    <span className="min-w-0 truncate pl-6 text-[var(--status-text)]">
                      {account.accountCode} {account.name}
                    </span>
                    <span className="text-right tabular-nums text-[var(--status-text)]">
                      {formatCurrency(account.amount)}
                    </span>
                  </StatusListRow>
                ))}
              </div>
            );
          })
        )}
      </ListPanel>
    </div>
  );
}
