import {
  type DashboardSummary,
  formatCurrency,
  formatRawDate,
} from '@erp-360/shared';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Landmark,
  ShoppingBag,
  Wallet,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Link } from 'react-router';

import { cn } from '@/lib/utils';
import { dashboardService } from '@/services/dashboard';

const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

const SLICE_COLORS = [
  '#059669',
  '#0284c7',
  '#d97706',
  '#7c3aed',
  '#e11d48',
  '#0f766e',
  '#64748b',
  '#ca8a04',
];

type Flow = DashboardSummary['receivables'];
type PaymentSlice = DashboardSummary['sales']['byMeansOfPayment']['month'][number];
type TreasuryAccount = DashboardSummary['treasury']['operating'][number];

function monthLabel(iso: string) {
  const [year, month] = iso.split('-');
  return `${MONTHS[Number(month) - 1]} de ${year}`;
}

function share(part: number, total: number) {
  if (total <= 0) return part > 0 ? 1 : 0;
  return Math.min(part / total, 1);
}

function ProgressBar({
  settled,
  total,
  tone,
}: {
  settled: number;
  total: number;
  tone: 'emerald' | 'sky';
}) {
  const ratio = share(settled, total);
  return (
    <div
      className="h-2 overflow-hidden rounded-full bg-zinc-100"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(ratio * 100)}
    >
      <div
        className={cn(
          'h-full rounded-full',
          tone === 'emerald' ? 'bg-emerald-500' : 'bg-sky-500',
        )}
        style={{ width: `${ratio * 100}%` }}
      />
    </div>
  );
}

function AmountRow({
  label,
  amount,
  emphasis = false,
  tone = 'default',
}: {
  label: string;
  amount: number;
  emphasis?: boolean;
  tone?: 'default' | 'danger';
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className={cn('text-sm', emphasis ? 'font-medium text-zinc-800' : 'text-zinc-500')}>
        {label}
      </span>
      <span
        className={cn(
          'shrink-0 tabular-nums',
          emphasis ? 'text-base font-semibold text-zinc-900' : 'text-sm font-medium',
          tone === 'danger' && amount > 0 && 'text-rose-700',
        )}
      >
        {formatCurrency(amount)}
      </span>
    </div>
  );
}

function FlowCard({
  title,
  href,
  icon,
  tone,
  dayLabel,
  monthLabel,
  settledLabel,
  overdueLabel,
  flow,
}: {
  title: string;
  href: string;
  icon: ReactNode;
  tone: 'emerald' | 'sky';
  dayLabel: string;
  monthLabel: string;
  settledLabel: string;
  overdueLabel: string;
  flow: Flow;
}) {
  const dayRatio = share(flow.day.settled, flow.day.total);
  const monthRatio = share(flow.month.settled, flow.month.total);
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-2xs">
      <header className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-lg',
              tone === 'emerald'
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-sky-50 text-sky-700',
            )}
          >
            {icon}
          </span>
          <h2 className="font-semibold text-zinc-900">{title}</h2>
        </div>
        <Link to={href} className="text-sm text-zinc-500 hover:text-zinc-900">
          Ver títulos
        </Link>
      </header>

      <div className="space-y-2">
        <AmountRow label={dayLabel} amount={flow.day.total} emphasis />
        <ProgressBar settled={flow.day.settled} total={flow.day.total} tone={tone} />
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-sm text-zinc-500">{settledLabel}</span>
          <span className="text-sm font-medium tabular-nums text-zinc-900">
            {formatCurrency(flow.day.settled)}
            <span className="ml-2 text-xs font-normal text-zinc-400">
              {Math.round(dayRatio * 100)}%
            </span>
          </span>
        </div>
      </div>

      <div className="my-4 border-t border-zinc-100" />

      <div className="space-y-2">
        <AmountRow label={monthLabel} amount={flow.month.total} emphasis />
        <ProgressBar settled={flow.month.settled} total={flow.month.total} tone={tone} />
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-sm text-zinc-500">{settledLabel}</span>
          <span className="text-sm font-medium tabular-nums text-zinc-900">
            {formatCurrency(flow.month.settled)}
            <span className="ml-2 text-xs font-normal text-zinc-400">
              {Math.round(monthRatio * 100)}%
            </span>
          </span>
        </div>
      </div>

      <div className="mt-4 space-y-2 border-t border-zinc-100 pt-4">
        <AmountRow label={overdueLabel} amount={flow.month.overdue} tone="danger" />
        <AmountRow label="Inadimplência total" amount={flow.delinquency} tone="danger" />
      </div>
    </section>
  );
}

function SalesCard({
  title,
  amount,
  hint,
}: {
  title: string;
  amount: number;
  hint: string;
}) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-2xs">
      <header className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
          <ShoppingBag className="h-4 w-4" />
        </span>
        <h2 className="font-semibold text-zinc-900">{title}</h2>
      </header>
      <p className="mt-6 text-3xl font-semibold tabular-nums tracking-tight text-zinc-900">
        {formatCurrency(amount)}
      </p>
      <p className="mt-2 text-sm text-zinc-500">{hint}</p>
    </section>
  );
}

function PaymentMix({ slices }: { slices: PaymentSlice[] }) {
  const total = slices.reduce((sum, slice) => sum + slice.amount, 0);
  if (total <= 0) {
    return <p className="text-sm text-zinc-500">Nenhuma venda no período.</p>;
  }

  let cursor = 0;
  const stops = slices.map((slice, index) => {
    const start = cursor;
    cursor += slice.amount / total;
    const color = SLICE_COLORS[index % SLICE_COLORS.length];
    return `${color} ${start * 100}% ${cursor * 100}%`;
  });

  return (
    <div className="grid items-center gap-6 lg:grid-cols-[1fr_11rem]">
      <ul className="space-y-2">
        {slices.map((slice, index) => (
          <li
            key={`${slice.meansOfPaymentId ?? 'none'}-${slice.description}`}
            className="flex items-center justify-between gap-3 text-sm"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: SLICE_COLORS[index % SLICE_COLORS.length] }}
              />
              <span className="truncate text-zinc-700">{slice.description}</span>
            </span>
            <span className="shrink-0 tabular-nums font-medium text-zinc-900">
              {formatCurrency(slice.amount)}
              <span className="ml-2 text-xs font-normal text-zinc-400">
                {Math.round((slice.amount / total) * 100)}%
              </span>
            </span>
          </li>
        ))}
      </ul>
      <div className="mx-auto h-44 w-44">
        <div
          className="flex h-full w-full items-center justify-center rounded-full"
          style={{ background: `conic-gradient(${stops.join(', ')})` }}
        >
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white px-2 text-center">
            <span className="text-xs font-semibold tabular-nums leading-tight text-zinc-900">
              {formatCurrency(total)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function AccountList({
  accounts,
  href,
  empty,
}: {
  accounts: TreasuryAccount[];
  href: string;
  empty: string;
}) {
  if (accounts.length === 0) {
    return <p className="text-sm text-zinc-500">{empty}</p>;
  }
  return (
    <ul className="max-h-64 space-y-2 overflow-y-auto">
      {accounts.map((account) => (
        <li key={account.id}>
          <Link
            to={href}
            className="flex items-baseline justify-between gap-3 text-sm hover:text-zinc-950"
          >
            <span className="truncate text-zinc-700">{account.name}</span>
            <span className="shrink-0 tabular-nums font-medium text-zinc-900">
              {formatCurrency(account.balance)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function Dashboard() {
  const [salesPeriod, setSalesPeriod] = useState<'day' | 'month'>('month');
  const { data, isLoading, isError } = useQuery({
    queryKey: ['dashboard'],
    queryFn: dashboardService.summary,
  });

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 space-y-4 p-4 md:p-6">
      <header>
        <h1 className="text-xl font-semibold text-zinc-900">Dashboard</h1>
        <p className="text-sm text-zinc-500">
          {data
            ? `Posição de ${formatRawDate(data.asOf)}, ${monthLabel(data.asOf)}.`
            : 'Contas, vendas e tesouraria do período.'}
        </p>
      </header>

      {isError ? (
        <p className="rounded-xl border border-rose-200 bg-white p-5 text-sm text-rose-700">
          Não foi possível carregar o dashboard.
        </p>
      ) : isLoading || !data ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <div
              key={index}
              className="h-64 animate-pulse rounded-xl border border-zinc-200 bg-white"
            />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <FlowCard
              title="Contas a receber"
              href="/receivables"
              icon={<ArrowDownLeft className="h-4 w-4" />}
              tone="emerald"
              dayLabel="Total a receber no dia"
              monthLabel="Total a receber no mês"
              settledLabel="Recebidas"
              overdueLabel="Vencidas no mês"
              flow={data.receivables}
            />
            <FlowCard
              title="Contas a pagar"
              href="/payables"
              icon={<ArrowUpRight className="h-4 w-4" />}
              tone="sky"
              dayLabel="Total a pagar no dia"
              monthLabel="Total a pagar no mês"
              settledLabel="Pagas"
              overdueLabel="Vencidas no mês"
              flow={data.payables}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <SalesCard
              title="Vendas no dia"
              amount={data.sales.day}
              hint="Contas a receber emitidas hoje."
            />
            <SalesCard
              title="Vendas no mês"
              amount={data.sales.month}
              hint="Contas a receber emitidas no mês."
            />
          </div>

          <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-2xs">
            <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                  <ShoppingBag className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="font-semibold text-zinc-900">Vendas por meio de pagamento</h2>
                  <p className="text-sm text-zinc-500">
                    Pelo valor dos títulos emitidos, sem os restantes de baixa parcial.
                  </p>
                </div>
              </div>
              <div className="inline-flex rounded-md border border-zinc-200 p-0.5">
                {(
                  [
                    ['month', 'Mês'],
                    ['day', 'Dia'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSalesPeriod(value)}
                    className={cn(
                      'rounded px-3 py-1 text-sm',
                      salesPeriod === value
                        ? 'bg-zinc-900 text-white'
                        : 'text-zinc-600 hover:text-zinc-900',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </header>
            <PaymentMix slices={data.sales.byMeansOfPayment[salesPeriod]} />
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-2xs">
              <header className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700">
                    <Wallet className="h-4 w-4" />
                  </span>
                  <h2 className="font-semibold text-zinc-900">Caixa e contas bancárias</h2>
                </div>
                <Link to="/bank-accounts" className="text-sm text-zinc-500 hover:text-zinc-900">
                  Ver contas
                </Link>
              </header>
              <div className="mb-3">
                <Link
                  to="/cash-book"
                  className="flex items-baseline justify-between gap-3 text-sm hover:text-zinc-950"
                >
                  <span className="text-zinc-700">Caixa</span>
                  <span className="tabular-nums font-medium text-zinc-900">
                    {formatCurrency(data.treasury.cashBalance)}
                  </span>
                </Link>
              </div>
              <AccountList
                accounts={data.treasury.operating}
                href="/bank-accounts"
                empty="Nenhuma conta operacional."
              />
              <div className="mt-4 flex items-baseline justify-between border-t border-zinc-100 pt-3 text-sm">
                <span className="font-medium text-zinc-800">Total</span>
                <span className="tabular-nums font-semibold text-zinc-900">
                  {formatCurrency(
                    data.treasury.cashBalance +
                      data.treasury.operating.reduce((sum, account) => sum + account.balance, 0),
                  )}
                </span>
              </div>
            </section>

            <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-2xs">
              <header className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-50 text-violet-700">
                    <Landmark className="h-4 w-4" />
                  </span>
                  <h2 className="font-semibold text-zinc-900">Investimentos</h2>
                </div>
                <Link to="/bank-accounts" className="text-sm text-zinc-500 hover:text-zinc-900">
                  Ver contas
                </Link>
              </header>
              <AccountList
                accounts={data.treasury.investments}
                href="/bank-accounts"
                empty="Nenhum investimento."
              />
              <div className="mt-4 flex items-baseline justify-between border-t border-zinc-100 pt-3 text-sm">
                <span className="font-medium text-zinc-800">Total</span>
                <span className="tabular-nums font-semibold text-zinc-900">
                  {formatCurrency(
                    data.treasury.investments.reduce((sum, account) => sum + account.balance, 0),
                  )}
                </span>
              </div>
            </section>
          </div>
        </>
      )}
    </main>
  );
}
