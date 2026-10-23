import { formatCurrency, formatRawDate } from '@erp-360/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  type CashFlowDay,
  type CashFlowMovement,
  type CashFlowReport,
  treasuryService,
} from '@/services/treasury';

const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;
const months = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
] as const;

function moneyClass(value: number): string {
  if (value < 0) return 'text-red-600';
  if (value > 0) return 'text-emerald-700';
  return 'text-zinc-500';
}

function weekendClass(weekday: number): string {
  return weekday === 0 || weekday === 6 ? 'text-red-600' : '';
}

function monthOf(isoDate: string, offset: number): { year: number; month: number } {
  const [year, month] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

function monthWeeks(year: number, month: number): Array<Array<number | null>> {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: Array<number | null> = Array.from({ length: first }, () => null);
  for (let day = 1; day <= count; day += 1) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: Array<Array<number | null>> = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }
  return weeks;
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function CashFlowChart({ days }: { days: CashFlowDay[] }) {
  const width = 760;
  const height = 280;
  const pad = { left: 64, right: 12, top: 16, bottom: 32 };
  const balances = days.map((day) => day.balance);
  const min = Math.min(...balances);
  const max = Math.max(...balances);
  const span = Math.max(max - min, 100);
  const low = min - span * 0.08;
  const high = max + span * 0.08;
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const xAt = (index: number) =>
    pad.left +
    (days.length === 1 ? innerWidth / 2 : (index / (days.length - 1)) * innerWidth);
  const yAt = (value: number) =>
    pad.top + (1 - (value - low) / (high - low)) * innerHeight;
  const line = days
    .map((day, index) => `${index === 0 ? 'M' : 'L'} ${xAt(index)} ${yAt(day.balance)}`)
    .join(' ');
  const area = `${line} L ${xAt(days.length - 1)} ${height - pad.bottom} L ${xAt(0)} ${height - pad.bottom} Z`;
  const ticks = [0, 1, 2, 3].map((step) => low + ((high - low) * step) / 3);
  const labelStep = Math.max(1, Math.ceil(days.length / 8));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img">
      <title>Saldo projetado do fluxo de caixa</title>
      <defs>
        <pattern
          id="cash-flow-hatch"
          width="8"
          height="8"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="8" height="8" fill="#d1fae5" />
          <line x1="0" y1="0" x2="0" y2="8" stroke="#6ee7b7" strokeWidth="4" />
        </pattern>
      </defs>
      {ticks.map((tick) => (
        <g key={tick}>
          <line
            x1={pad.left}
            x2={width - pad.right}
            y1={yAt(tick)}
            y2={yAt(tick)}
            stroke="#e4e4e7"
          />
          <text
            x={pad.left - 8}
            y={yAt(tick) + 4}
            textAnchor="end"
            fontSize="11"
            fill="#71717a"
          >
            {(tick / 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
          </text>
        </g>
      ))}
      <path d={area} fill="url(#cash-flow-hatch)" />
      <path d={line} fill="none" stroke="#047857" strokeWidth="2" />
      {days.map((day, index) =>
        index % labelStep === 0 || index === days.length - 1 ? (
          <text
            key={day.date}
            x={xAt(index)}
            y={height - 8}
            textAnchor="middle"
            fontSize="11"
            fill="#71717a"
          >
            {formatRawDate(day.date).slice(0, 5)}
          </text>
        ) : null,
      )}
    </svg>
  );
}

function MovementTable({
  personHeader,
  rows,
  showBearer,
}: {
  personHeader: string;
  rows: CashFlowMovement[];
  showBearer: boolean;
}) {
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  return (
    <div className="overflow-x-auto rounded-md border border-zinc-200 bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Documento</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead>{personHeader}</TableHead>
            <TableHead>Histórico</TableHead>
            <TableHead>Telefone</TableHead>
            {showBearer ? <TableHead>Portador</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={showBearer ? 6 : 5}
                className="py-6 text-center text-zinc-500"
              >
                Nenhum título neste dia.
              </TableCell>
            </TableRow>
          ) : null}
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>{row.documentNumber || '-'}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrency(row.amount)}
              </TableCell>
              <TableCell>{row.personName}</TableCell>
              <TableCell>{row.description}</TableCell>
              <TableCell>{row.phone || '-'}</TableCell>
              {showBearer ? <TableCell>{row.bearerName || '-'}</TableCell> : null}
            </TableRow>
          ))}
          <TableRow className="bg-zinc-50 font-semibold">
            <TableCell />
            <TableCell className="text-right tabular-nums">
              {formatCurrency(total)}
            </TableCell>
            <TableCell colSpan={showBearer ? 4 : 3} />
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}

function MonthCalendar({
  year,
  month,
  from,
  to,
  selected,
  onSelect,
}: {
  year: number;
  month: number;
  from: string;
  to: string;
  selected: string;
  onSelect: (date: string) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-zinc-900">
        {months[month - 1]} de {year}
      </p>
      <table className="w-full border-collapse text-center text-xs">
        <thead>
          <tr className="bg-zinc-100">
            {weekdays.map((label, index) => (
              <th
                key={label}
                className={`px-1 py-1 font-medium ${weekendClass(index) || 'text-zinc-600'}`}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {monthWeeks(year, month).map((week) => (
            <tr key={week.map((day) => day ?? 'x').join('-')}>
              {week.map((day, index) => {
                if (!day) return <td key={`empty-${index}`} className="p-1" />;
                const date = isoDate(year, month, day);
                const inRange = date >= from && date <= to;
                const isSelected = date === selected;
                return (
                  <td key={date} className="p-0.5">
                    {inRange ? (
                      <button
                        type="button"
                        onClick={() => onSelect(date)}
                        className={`h-7 w-full rounded ${
                          isSelected
                            ? 'bg-zinc-900 text-white'
                            : 'hover:bg-zinc-100 text-zinc-900'
                        }`}
                      >
                        {day}
                      </button>
                    ) : (
                      <span className="inline-flex h-7 w-full items-center justify-center text-zinc-300">
                        {day}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CashFlowView() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['treasury', 'cash-flow'],
    queryFn: treasuryService.cashFlow,
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const selected = data?.days.find((day) => day.date === selectedDate);

  const chooseDay = (date: string) => {
    setSelectedDate(date);
  };

  if (isLoading) {
    return <p className="text-sm text-zinc-500">Carregando fluxo de caixa...</p>;
  }
  if (isError || !data) {
    return (
      <p className="text-sm text-red-600">
        {error instanceof Error ? error.message : 'Falha ao carregar o fluxo de caixa.'}
      </p>
    );
  }

  return (
    <CashFlowReportView
      report={data}
      selected={selected}
      onSelect={chooseDay}
      onClose={() => setSelectedDate(null)}
    />
  );
}

function CashFlowReportView({
  report,
  selected,
  onSelect,
  onClose,
}: {
  report: CashFlowReport;
  selected: CashFlowDay | undefined;
  onSelect: (date: string) => void;
  onClose: () => void;
}) {
  const overdueIn = report.overdueReceivables.reduce((sum, item) => sum + item.amount, 0);
  const overdueOut = report.overduePayables.reduce((sum, item) => sum + item.amount, 0);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold text-zinc-900">Fluxo de caixa</h3>
        <p className="text-sm text-zinc-500">
          Posição de caixa e contas correntes, com a projeção dos títulos pendentes de{' '}
          {formatRawDate(report.from)} até {formatRawDate(report.to)}.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <div className="rounded-md border border-zinc-200 bg-white">
          <Table>
            <TableBody>
              {report.banks.map((account) => (
                <TableRow key={account.name}>
                  <TableCell>{account.name}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(account.balance)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell>Caixa em {formatRawDate(report.today)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(report.cashBalance)}
                </TableCell>
              </TableRow>
              <TableRow className="bg-zinc-50 font-semibold">
                <TableCell>Total</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(report.openingBalance)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
        <div className="rounded-md border border-zinc-200 bg-white p-3">
          <p className="mb-2 text-sm font-semibold text-zinc-900">Saldo projetado</p>
          <CashFlowChart days={report.days} />
        </div>
      </div>

      {overdueIn || overdueOut ? (
        <p className="text-sm text-zinc-600">
          Títulos atrasados ficam fora da projeção do dia: receber{' '}
          {formatCurrency(overdueIn)} e pagar {formatCurrency(overdueOut)}.
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((offset) => {
          const { year, month } = monthOf(report.today, offset);
          return (
            <div
              key={`${year}-${month}`}
              className="rounded-md border border-zinc-200 bg-white p-3"
            >
              <MonthCalendar
                year={year}
                month={month}
                from={report.from}
                to={report.to}
                selected={selected?.date ?? ''}
                onSelect={onSelect}
              />
            </div>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-md border border-zinc-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Dia</TableHead>
              <TableHead className="text-right">Receber</TableHead>
              <TableHead className="text-right">Pagar</TableHead>
              <TableHead className="text-right">Diferença</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.days.map((day) => (
              <TableRow
                key={day.date}
                className={day.date === selected?.date ? 'bg-zinc-100' : undefined}
              >
                <TableCell>
                  <button
                    type="button"
                    className="text-left underline-offset-2 hover:underline"
                    onClick={() => onSelect(day.date)}
                  >
                    {formatRawDate(day.date)}
                  </button>
                </TableCell>
                <TableCell className={weekendClass(day.weekday)}>
                  {weekdays[day.weekday]}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(day.inflows)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(day.outflows)}
                </TableCell>
                <TableCell
                  className={`text-right tabular-nums ${moneyClass(day.difference)}`}
                >
                  {formatCurrency(day.difference)}
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  {formatCurrency(day.balance)}
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-zinc-50 font-semibold">
              <TableCell colSpan={2} />
              <TableCell className="text-right tabular-nums">
                {formatCurrency(report.totals.inflows)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrency(report.totals.outflows)}
              </TableCell>
              <TableCell
                className={`text-right tabular-nums ${moneyClass(report.totals.difference)}`}
              >
                {formatCurrency(report.totals.difference)}
              </TableCell>
              <TableCell />
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-h-[85vh] max-w-5xl overflow-y-auto">
          {selected ? (
            <>
              <DialogHeader>
                <DialogTitle>{formatRawDate(selected.date)}</DialogTitle>
                <DialogDescription>
                  Títulos pendentes com vencimento nesta data.
                </DialogDescription>
              </DialogHeader>
              <Tabs key={selected.date} defaultValue="receivable">
                <TabsList>
                  <TabsTrigger value="receivable">
                    Receber ({selected.receivables.length})
                  </TabsTrigger>
                  <TabsTrigger value="payable">
                    Pagar ({selected.payables.length})
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="receivable">
                  <MovementTable
                    personHeader="Cliente"
                    rows={selected.receivables}
                    showBearer
                  />
                </TabsContent>
                <TabsContent value="payable">
                  <MovementTable
                    personHeader="Fornecedor"
                    rows={selected.payables}
                    showBearer={false}
                  />
                </TabsContent>
              </Tabs>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
