import { useQuery } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { type CSSProperties, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';

import { ServiceOrderBillingDialog } from '@/components/ServiceOrders/ServiceOrderBillingDialog';
import { ServiceOrderRowMenu } from '@/components/ServiceOrders/ServiceOrderRowMenu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  serviceOrdersService,
  type ServiceOrderListItem,
  type ServiceOrderStatus,
} from '@/services/serviceOrders';

const statusLabels: Record<ServiceOrderStatus, string> = {
  open: 'Aberta',
  analyzing: 'Em análise',
  waiting_approval: 'Aguardando aprovação',
  waiting_parts: 'Aguardando peça',
  in_progress: 'Em execução',
  ready: 'Pronta',
  delivered: 'Entregue',
  cancelled: 'Cancelada',
};

const statuses = Object.keys(statusLabels) as ServiceOrderStatus[];

const statusTone: Record<
  ServiceOrderStatus,
  { background: string; hover: string; border: string; text: string }
> = {
  open: {
    background: '#EFF6FF',
    hover: '#DBEAFE',
    border: '#2563EB',
    text: '#1D4ED8',
  },
  analyzing: {
    background: '#F5F3FF',
    hover: '#EDE9FE',
    border: '#8B5CF6',
    text: '#6D28D9',
  },
  waiting_approval: {
    background: '#FFF7ED',
    hover: '#FFEDD5',
    border: '#F97316',
    text: '#9A3412',
  },
  waiting_parts: {
    background: '#FFFBEB',
    hover: '#FEF3C7',
    border: '#D97706',
    text: '#92400E',
  },
  in_progress: {
    background: '#ECFEFF',
    hover: '#CFFAFE',
    border: '#0891B2',
    text: '#0E7490',
  },
  ready: {
    background: '#F0FDF4',
    hover: '#DCFCE7',
    border: '#16A34A',
    text: '#166534',
  },
  delivered: {
    background: '#F0FDFA',
    hover: '#CCFBF1',
    border: '#0D9488',
    text: '#0F766E',
  },
  cancelled: {
    background: '#FEF2F2',
    hover: '#FEE2E2',
    border: '#DC2626',
    text: '#B91C1C',
  },
};

const columns =
  'grid grid-cols-[96px_minmax(150px,1fr)_minmax(160px,1.3fr)_132px_132px_176px] items-center gap-3 px-3.5';

function toneStyle(status: ServiceOrderStatus): CSSProperties {
  const tone = statusTone[status];
  return {
    '--os-bg': tone.background,
    '--os-hover': tone.hover,
    '--os-accent': tone.border,
    '--os-text': tone.text,
  } as CSSProperties;
}

function formatWhen(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function StatusBadge({ status, pressed }: { status: ServiceOrderStatus; pressed?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center rounded-[7px] border border-[var(--os-accent)] bg-[var(--os-bg)] px-2 py-[5px] text-xs leading-snug font-bold text-[var(--os-text)] group-hover:bg-[var(--os-hover)]',
        pressed && 'shadow-[inset_0_0_0_1px_var(--os-accent)]',
      )}
    >
      {statusLabels[status]}
    </span>
  );
}

export function ListServiceOrders() {
  const navigate = useNavigate();
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ServiceOrderStatus | 'all'>('all');
  const [menu, setMenu] = useState<{
    row: ServiceOrderListItem;
    x: number;
    y: number;
  } | null>(null);
  const [billingId, setBillingId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchText.trim()), 400);
    return () => clearTimeout(timer);
  }, [searchText]);

  const settings = useQuery({
    queryKey: ['settings', 'service-order'],
    queryFn: serviceOrdersService.getSettings,
  });

  const list = useQuery({
    queryKey: ['service-orders', { q: search, status }],
    queryFn: () =>
      serviceOrdersService.list({
        q: search || undefined,
        status: status === 'all' ? undefined : status,
      }),
  });

  const rows = list.data?.data ?? [];
  const summaryLabel =
    rows[0]?.summaryLabel ||
    settings.data?.fields.find((field) => field.slot === settings.data.summarySlot)?.label ||
    'Resumo';
  const countLabel =
    rows.length === 1 ? '1 ordem exibida' : `${rows.length} ordens exibidas`;

  function openOrder(id: string) {
    navigate(`/service-orders/${id}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#172337]">Ordens de serviço</h2>
          <p className="mt-1 text-sm text-[#64748b]">Número, cliente, previsão e situação.</p>
        </div>
        <Button asChild>
          <Link to="/service-orders/new">
            <Plus className="h-4 w-4" />
            Nova ordem
          </Link>
        </Button>
      </div>

      <section className="rounded-[14px] border border-[#dfe5ee] bg-white p-4 shadow-[0_4px_22px_#1e293b0a] md:p-[22px]">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-[19px] font-semibold text-[#172337]">Lista de ordens de serviço</h3>
            <p className="mt-2 text-[13px] text-[#64748b]">
              Clique na linha para abrir. O hover mantém a cor de cada situação.
            </p>
          </div>
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-[235px]">
              <Search className="absolute top-3 left-3 h-4 w-4 text-[#64748b]" />
              <Input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Número, cliente ou campo"
                className="h-[42px] border-[#cbd5e1] pl-9"
                aria-label="Pesquisar ordens"
              />
            </div>
            <Select
              value={status}
              onValueChange={(value) => setStatus(value as ServiceOrderStatus | 'all')}
            >
              <SelectTrigger className="h-[42px] w-full border-[#cbd5e1] sm:w-[235px]" aria-label="Filtrar por situação">
                <SelectValue placeholder="Situação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as situações</SelectItem>
                {statuses.map((value) => (
                  <SelectItem key={value} value={value}>
                    {statusLabels[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[880px]">
            <div
              className={cn(
                columns,
                'border-b border-b-[#dfe5ee] border-l-4 border-l-transparent py-3 text-xs font-bold text-[#64748b]',
              )}
            >
              <span>Número</span>
              <span>Cliente</span>
              <span>{summaryLabel}</span>
              <span>Abertura</span>
              <span>Previsão</span>
              <span>Situação</span>
            </div>

            {list.isLoading ? (
              <p className="px-3.5 py-8 text-center text-sm text-[#64748b]">
                Carregando as ordens...
              </p>
            ) : list.isError ? (
              <p className="px-3.5 py-8 text-center text-sm text-red-600">
                Não foi possível carregar as ordens.
              </p>
            ) : rows.length === 0 ? (
              <p className="px-3.5 py-8 text-center text-sm text-[#64748b]">
                {search || status !== 'all' ? 'Nenhuma ordem encontrada.' : 'Ainda não há ordem.'}
              </p>
            ) : (
              rows.map((row) => (
                <div
                  key={row.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${row.numberLabel}, ${row.customerName}, ${statusLabels[row.status]}`}
                  className={cn(
                    columns,
                    'group mt-[5px] cursor-pointer rounded-[7px] border-l-4 border-l-[var(--os-accent)] bg-[var(--os-bg)] py-3 text-sm text-[#243145] transition-[background-color,box-shadow] duration-150 hover:bg-[var(--os-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]',
                  )}
                  style={toneStyle(row.status)}
                  onClick={() => openOrder(row.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openOrder(row.id);
                    }
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setMenu({ row, x: event.clientX, y: event.clientY });
                  }}
                >
                  <span className="font-bold">{row.numberLabel}</span>
                  <span className="min-w-0 truncate">{row.customerName}</span>
                  <span className="min-w-0 truncate">{row.summaryValue?.trim() || '—'}</span>
                  <span className="whitespace-nowrap">{formatWhen(row.openedAt)}</span>
                  <span className="whitespace-nowrap">{formatWhen(row.promisedAt)}</span>
                  <span>
                    <StatusBadge status={row.status} />
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2.5" aria-label="Legenda de situações">
          {statuses.map((value) => (
            <button
              key={value}
              type="button"
              className="cursor-pointer rounded-[7px] border-0 bg-transparent p-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
              style={toneStyle(value)}
              aria-pressed={status === value}
              onClick={() => setStatus(status === value ? 'all' : value)}
            >
              <StatusBadge status={value} pressed={status === value} />
            </button>
          ))}
        </div>
        <p className="mt-2 text-[13px] text-[#64748b]" aria-live="polite">
          {list.isSuccess ? countLabel : ''}
        </p>
      </section>

      <ServiceOrderRowMenu cursor={menu} onClose={() => setMenu(null)} onBill={setBillingId} />
      <ServiceOrderBillingDialog orderId={billingId} onClose={() => setBillingId(null)} />
    </div>
  );
}
