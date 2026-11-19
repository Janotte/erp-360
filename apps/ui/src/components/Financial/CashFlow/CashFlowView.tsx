import { formatCurrency, formatRawDate } from '@erp-360/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';

import { titleRowTone } from '@/components/Financial/titleRowTone';
import { ListMessage, ListPageHeader, ListPanel } from '@/components/ui/ListShell';
import { StatusListHeader, StatusListRow } from '@/components/ui/StatusList';
import { type StatusTone } from '@/components/ui/statusTone';
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

const positionColumns = 'grid grid-cols-[minmax(0,1fr)_auto]';
const dayColumns = 'grid grid-cols-[104px_64px_120px_120px_120px_130px]';
const receivableColumns =
  'grid grid-cols-[110px_minmax(140px,1fr)_minmax(160px,1.2fr)_120px_120px_110px]';
const payableColumns =
  'grid grid-cols-[110px_minmax(140px,1fr)_minmax(180px,1.4fr)_120px_110px]';

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

const todayTone: StatusTone = {
  background: '#EFF6FF',
  hover: '#DBEAFE',
  border: '#2563EB',
  text: '#1D4ED8',
};

const plainTone: StatusTone = {
  background: '#FFFFFF',
  hover: '#F8FAFC',
  border: '#94A3B8',
  text: '#172337',
};

function weekendClass(weekday: number): string {
  return weekday === 0 || weekday === 6 ? 'text-red-600' : 'text-[#64748b]';
}

function monthOf(iso: string, offset: number): { year: number; month: number } {
  const [year, month] = iso.split('-').map(Number);
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

function previousDay(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function readDay(params: URLSearchParams, from: string, to: string) {
  const value = params.get('dia') ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  if (value < from || value > to) return null;
  return value;
}

function balanceTone(value: number): StatusTone {
  if (value > 0) return inflowTone;
  if (value < 0) return outflowTone;
  return plainTone;
}

function dayTone(day: CashFlowDay, today: string): StatusTone {
  if (day.date === today) return todayTone;
  if (day.difference < 0) return outflowTone;
  if (day.difference > 0) return inflowTone;
  return plainTone;
}

function daySituation(day: CashFlowDay, today: string) {
  if (day.date === today) return 'hoje';
  if (day.difference < 0) return 'mais saídas';
  if (day.difference > 0) return 'mais entradas';
  return 'zerado';
}

function movementSituation(dueOn: string, today: string) {
  if (dueOn < today) return 'atrasado';
  if (dueOn === today) return 'vence hoje';
  return 'pendente';
}

function CashFlowChart({ days }: { days: CashFlowDay[] }) {
  if (days.length === 0) return null;
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

function MovementList({
  rows,
  personHeader,
  showBearer,
  dueOn,
  today,
  onOpen,
}: {
  rows: CashFlowMovement[];
  personHeader: string;
  showBearer: boolean;
  dueOn: string;
  today: string;
  onOpen: (id: string) => void;
}) {
  const columns = showBearer ? receivableColumns : payableColumns;
  const tone = titleRowTone('pendente', dueOn, today);
  const situation = movementSituation(dueOn, today);
  const total = rows.reduce((sum, row) => sum + row.amount, 0);

  if (rows.length === 0) {
    return <ListMessage>Nenhum título.</ListMessage>;
  }

  return (
    <div className="overflow-x-auto">
      <div className={showBearer ? 'min-w-[860px]' : 'min-w-[720px]'}>
        <StatusListHeader columns={columns}>
          <span>Documento</span>
          <span>{personHeader}</span>
          <span>Histórico</span>
          <span>Telefone</span>
          {showBearer ? <span>Portador</span> : null}
          <span className="text-right">Valor</span>
        </StatusListHeader>
        {rows.map((row) => (
          <StatusListRow
            key={row.id}
            columns={columns}
            tone={tone}
            label={`${row.documentNumber || 'sem documento'}, ${row.personName}, ${situation}`}
            onOpen={() => onOpen(row.id)}
          >
            <span className="min-w-0 truncate text-[var(--status-text)]">
              {row.documentNumber || '—'}
            </span>
            <span className="min-w-0 truncate text-[var(--status-text)]">
              {row.personName}
            </span>
            <span className="min-w-0 truncate font-bold text-[var(--status-text)]">
              {row.description}
            </span>
            <span className="min-w-0 truncate text-[var(--status-text)]">
              {row.phone || '—'}
            </span>
            {showBearer ? (
              <span className="min-w-0 truncate text-[var(--status-text)]">
                {row.bearerName || '—'}
              </span>
            ) : null}
            <span className="text-right tabular-nums text-[var(--status-text)]">
              {formatCurrency(row.amount)}
            </span>
          </StatusListRow>
        ))}
        <p className="px-3.5 pt-3 text-right text-sm font-semibold text-[#172337]">
          Total {formatCurrency(total)}
        </p>
      </div>
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
      <p className="mb-2 text-sm font-semibold text-[#172337]">
        {months[month - 1]} de {year}
      </p>
      <table className="w-full border-collapse text-center text-xs">
        <thead>
          <tr>
            {weekdays.map((label, index) => (
              <th key={label} className={`px-1 py-1 font-medium ${weekendClass(index)}`}>
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
                            ? 'bg-[#2563eb] text-white'
                            : 'text-[#172337] hover:bg-[#EFF6FF]'
                        }`}
                      >
                        {day}
                      </button>
                    ) : (
                      <span className="inline-flex h-7 w-full items-center justify-center text-[#cbd5e1]">
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
  const flow = useQuery({
    queryKey: ['treasury', 'cash-flow'],
    queryFn: treasuryService.cashFlow,
  });

  if (flow.isLoading) {
    return (
      <div className="space-y-4">
        <ListPageHeader
          title="Fluxo de caixa"
          description="Posição de caixa e contas correntes, com a projeção dos títulos pendentes."
        />
        <ListMessage>Carregando o fluxo de caixa...</ListMessage>
      </div>
    );
  }

  if (flow.isError || !flow.data) {
    return (
      <div className="space-y-4">
        <ListPageHeader
          title="Fluxo de caixa"
          description="Posição de caixa e contas correntes, com a projeção dos títulos pendentes."
        />
        <ListMessage tone="error">
          {flow.error instanceof Error
            ? flow.error.message
            : 'Não foi possível carregar o fluxo de caixa.'}
        </ListMessage>
      </div>
    );
  }

  return <CashFlowReportView report={flow.data} />;
}

function CashFlowReportView({ report }: { report: CashFlowReport }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const detailRef = useRef<HTMLDivElement>(null);
  const selectedDate = readDay(params, report.from, report.to);
  const selected = report.days.find((day) => day.date === selectedDate);
  const listUrl = `/cash-flow${location.search}`;
  const overdueDue = previousDay(report.today);

  useEffect(() => {
    if (!selected) return;
    detailRef.current?.scrollIntoView({ block: 'start' });
  }, [selected]);

  const selectDay = (date: string) => {
    const next = new URLSearchParams(params);
    if (next.get('dia') === date) return;
    next.set('dia', date);
    setParams(next, { replace: true });
  };

  const openReceivable = (id: string) => {
    navigate(`/receivables/${id}`, { state: { from: listUrl } });
  };

  const openPayable = (id: string) => {
    navigate(`/payables/${id}`, { state: { from: listUrl } });
  };

  return (
    <div className="space-y-4">
      <ListPageHeader
        title="Fluxo de caixa"
        description={`Posição de caixa e contas correntes, com a projeção dos títulos pendentes de ${formatRawDate(report.from)} até ${formatRawDate(report.to)}.`}
      >
        <div className="rounded-[10px] border border-[#dfe5ee] bg-white px-4 py-2 text-right">
          <p className="text-xs text-[#64748b]">Posição</p>
          <p className="text-lg font-semibold tabular-nums text-[#172337]">
            {formatCurrency(report.openingBalance)}
          </p>
        </div>
      </ListPageHeader>

      <div className="grid items-start gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <ListPanel
          title="Posição"
          description="Caixa e contas correntes que entram no fluxo. A cor indica o saldo."
        >
          {report.banks.map((account) => (
            <StatusListRow
              key={account.name}
              columns={positionColumns}
              tone={balanceTone(account.balance)}
              label={`${account.name}, saldo ${formatCurrency(account.balance)}`}
            >
              <span className="min-w-0 truncate font-bold text-[var(--status-text)]">
                {account.name}
              </span>
              <span className="tabular-nums text-[var(--status-text)]">
                {formatCurrency(account.balance)}
              </span>
            </StatusListRow>
          ))}
          <StatusListRow
            columns={positionColumns}
            tone={balanceTone(report.cashBalance)}
            label={`Caixa em ${formatRawDate(report.today)}, saldo ${formatCurrency(report.cashBalance)}`}
          >
            <span className="min-w-0 truncate font-bold text-[var(--status-text)]">
              Caixa em {formatRawDate(report.today)}
            </span>
            <span className="tabular-nums text-[var(--status-text)]">
              {formatCurrency(report.cashBalance)}
            </span>
          </StatusListRow>
        </ListPanel>

        <ListPanel
          title="Saldo projetado"
          description="O saldo parte da posição de hoje e soma a diferença de cada dia."
        >
          <CashFlowChart days={report.days} />
        </ListPanel>
      </div>

      {report.overdueReceivables.length || report.overduePayables.length ? (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {report.overdueReceivables.length ? (
            <ListPanel
              title="Receber atrasado"
              description="Ficam fora da projeção do dia. O clique abre o título."
            >
              <MovementList
                rows={report.overdueReceivables}
                personHeader="Cliente"
                showBearer
                dueOn={overdueDue}
                today={report.today}
                onOpen={openReceivable}
              />
            </ListPanel>
          ) : null}
          {report.overduePayables.length ? (
            <ListPanel
              title="Pagar atrasado"
              description="Ficam fora da projeção do dia. O clique abre o título."
            >
              <MovementList
                rows={report.overduePayables}
                personHeader="Fornecedor"
                showBearer={false}
                dueOn={overdueDue}
                today={report.today}
                onOpen={openPayable}
              />
            </ListPanel>
          ) : null}
        </div>
      ) : null}

      <ListPanel
        title="Calendário"
        description="Clique no dia para ver os títulos pendentes."
      >
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((offset) => {
            const { year, month } = monthOf(report.today, offset);
            return (
              <MonthCalendar
                key={`${year}-${month}`}
                year={year}
                month={month}
                from={report.from}
                to={report.to}
                selected={selected?.date ?? ''}
                onSelect={selectDay}
              />
            );
          })}
        </div>
      </ListPanel>

      {selected ? (
        <div ref={detailRef}>
          <ListPanel
            title={formatRawDate(selected.date)}
            description={`${weekdays[selected.weekday]} · Receber ${formatCurrency(selected.inflows)} · Pagar ${formatCurrency(selected.outflows)}. O clique abre o título.`}
          >
            <div className="space-y-6">
              <section className="space-y-2">
                <h4 className="text-sm font-semibold text-[#172337]">
                  Receber ({selected.receivables.length})
                </h4>
                <MovementList
                  rows={selected.receivables}
                  personHeader="Cliente"
                  showBearer
                  dueOn={selected.date}
                  today={report.today}
                  onOpen={openReceivable}
                />
              </section>
              <section className="space-y-2">
                <h4 className="text-sm font-semibold text-[#172337]">
                  Pagar ({selected.payables.length})
                </h4>
                <MovementList
                  rows={selected.payables}
                  personHeader="Fornecedor"
                  showBearer={false}
                  dueOn={selected.date}
                  today={report.today}
                  onOpen={openPayable}
                />
              </section>
            </div>
          </ListPanel>
        </div>
      ) : null}

      <ListPanel
        title="Projeção"
        description="Verde é dia com mais entradas, vermelho com mais saídas, branco zerado e azul é hoje."
      >
        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            <StatusListHeader columns={dayColumns}>
              <span>Data</span>
              <span>Dia</span>
              <span className="text-right">Receber</span>
              <span className="text-right">Pagar</span>
              <span className="text-right">Diferença</span>
              <span className="text-right">Saldo</span>
            </StatusListHeader>
            {report.days.map((day) => (
              <StatusListRow
                key={day.date}
                columns={dayColumns}
                tone={dayTone(day, report.today)}
                label={`${formatRawDate(day.date)}, ${weekdays[day.weekday]}, ${daySituation(day, report.today)}`}
                onOpen={() => selectDay(day.date)}
              >
                <span className="text-[var(--status-text)]">
                  {formatRawDate(day.date)}
                </span>
                <span className="text-[var(--status-text)]">{weekdays[day.weekday]}</span>
                <span className="text-right tabular-nums text-[var(--status-text)]">
                  {formatCurrency(day.inflows)}
                </span>
                <span className="text-right tabular-nums text-[var(--status-text)]">
                  {formatCurrency(day.outflows)}
                </span>
                <span className="text-right tabular-nums text-[var(--status-text)]">
                  {formatCurrency(day.difference)}
                </span>
                <span className="text-right font-semibold tabular-nums text-[var(--status-text)]">
                  {formatCurrency(day.balance)}
                </span>
              </StatusListRow>
            ))}
            <p className="px-3.5 pt-3 text-right text-sm text-[#64748b]">
              Receber {formatCurrency(report.totals.inflows)} · Pagar{' '}
              {formatCurrency(report.totals.outflows)} · Diferença{' '}
              <span className="font-semibold text-[#172337]">
                {formatCurrency(report.totals.difference)}
              </span>
            </p>
          </div>
        </div>
      </ListPanel>
    </div>
  );
}
