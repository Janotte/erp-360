import { type ListPageSize } from '@erp-360/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';

import { ServiceOrderBillingDialog } from '@/components/ServiceOrders/ServiceOrderBillingDialog';
import { ServiceOrderRowMenu } from '@/components/ServiceOrders/ServiceOrderRowMenu';
import { Button } from '@/components/ui/button';
import { ListPagination } from '@/components/ui/ListPagination';
import {
  ListFilter,
  ListMessage,
  ListPageHeader,
  ListPanel,
  ListSearch,
} from '@/components/ui/ListShell';
import { StatusBadge, StatusListHeader, StatusListRow } from '@/components/ui/StatusList';
import { type StatusTone } from '@/components/ui/statusTone';
import { useDebouncedSearch } from '@/hooks/useDebouncedSearch';
import {
  type ServiceOrderListItem,
  serviceOrdersService,
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

const statusTone: Record<ServiceOrderStatus, StatusTone> = {
  open: { background: '#EFF6FF', hover: '#DBEAFE', border: '#2563EB', text: '#1D4ED8' },
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
  ready: { background: '#F0FDF4', hover: '#DCFCE7', border: '#16A34A', text: '#166534' },
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

const columns = 'grid grid-cols-[96px_minmax(150px,1fr)_minmax(160px,1.3fr)_132px_176px]';

function formatWhen(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

export function ListServiceOrders() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ServiceOrderStatus | 'all'>('all');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<ListPageSize>(10);
  const [menu, setMenu] = useState<{
    row: ServiceOrderListItem;
    x: number;
    y: number;
  } | null>(null);
  const [billingId, setBillingId] = useState<string | null>(null);
  const { text: searchText, setText: setSearchText } = useDebouncedSearch((next) => {
    setSearch(next);
    setPage(1);
  });

  function changeStatus(next: ServiceOrderStatus | 'all') {
    setStatus(next);
    setPage(1);
  }

  const settings = useQuery({
    queryKey: ['settings', 'service-order'],
    queryFn: serviceOrdersService.getSettings,
  });

  const list = useQuery({
    queryKey: ['service-orders', { q: search, status, page, limit }],
    placeholderData: keepPreviousData,
    queryFn: () =>
      serviceOrdersService.list({
        q: search || undefined,
        status: status === 'all' ? undefined : status,
        page,
        limit,
      }),
  });

  const rows = list.data?.data ?? [];
  const meta = list.data?.meta;
  const summaryLabel =
    rows[0]?.summaryLabel ||
    settings.data?.fields.find((field) => field.slot === settings.data.summarySlot)
      ?.label ||
    'Resumo';

  function openOrder(id: string) {
    navigate(`/service-orders/${id}`);
  }

  return (
    <div className="space-y-4">
      <ListPageHeader
        title="Ordens de serviço"
        description="Número, cliente, abertura e situação."
      >
        <Button asChild>
          <Link to="/service-orders/new">
            <Plus className="h-4 w-4" />
            Nova ordem
          </Link>
        </Button>
      </ListPageHeader>

      <ListPanel
        title="Lista de ordens de serviço"
        description="Clique na linha para abrir. O hover mantém a cor de cada situação."
        toolbar={
          <>
            <ListSearch
              value={searchText}
              onChange={setSearchText}
              placeholder="Número, cliente ou campo"
              label="Pesquisar ordens"
            />
            <ListFilter
              value={status}
              onValueChange={changeStatus}
              label="Filtrar por situação"
              allLabel="Todas as situações"
              options={statuses.map((value) => ({ value, label: statusLabels[value] }))}
            />
          </>
        }
      >
        <div className="overflow-x-auto">
          <div className="min-w-[740px]">
            <StatusListHeader columns={columns}>
              <span>Número</span>
              <span>Cliente</span>
              <span>{summaryLabel}</span>
              <span>Abertura</span>
              <span>Situação</span>
            </StatusListHeader>

            {list.isLoading ? (
              <ListMessage>Carregando as ordens...</ListMessage>
            ) : list.isError ? (
              <ListMessage tone="error">Não foi possível carregar as ordens.</ListMessage>
            ) : rows.length === 0 ? (
              <ListMessage>
                {search || status !== 'all'
                  ? 'Nenhuma ordem encontrada.'
                  : 'Ainda não há ordem.'}
              </ListMessage>
            ) : (
              rows.map((row) => (
                <StatusListRow
                  key={row.id}
                  columns={columns}
                  tone={statusTone[row.status]}
                  label={`${row.numberLabel}, ${row.customerName}, ${statusLabels[row.status]}`}
                  onOpen={() => openOrder(row.id)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setMenu({ row, x: event.clientX, y: event.clientY });
                  }}
                >
                  <span className="font-bold">{row.numberLabel}</span>
                  <span className="min-w-0 truncate">{row.customerName}</span>
                  <span className="min-w-0 truncate">
                    {row.summaryValue?.trim() || '—'}
                  </span>
                  <span className="whitespace-nowrap">{formatWhen(row.openedAt)}</span>
                  <span>
                    <StatusBadge
                      label={statusLabels[row.status]}
                      tone={statusTone[row.status]}
                    />
                  </span>
                </StatusListRow>
              ))
            )}
          </div>
        </div>
        {/*
        <div className="mt-5 flex flex-wrap gap-2.5" aria-label="Legenda de situações">
          {statuses.map((value) => (
            <button
              key={value}
              type="button"
              className="cursor-pointer rounded-[7px] border-0 bg-transparent p-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
              style={statusToneStyle(statusTone[value])}
              aria-pressed={status === value}
              onClick={() => changeStatus(status === value ? 'all' : value)}
            >
              <StatusBadge label={statusLabels[value]} pressed={status === value} />
            </button>
          ))}
        </div>
        */}
        {meta ? (
          <ListPagination
            page={page}
            limit={limit}
            total={meta.total}
            totalPages={meta.totalPages}
            onPageChange={setPage}
            onLimitChange={(next) => {
              setLimit(next);
              setPage(1);
            }}
          />
        ) : null}
      </ListPanel>

      <ServiceOrderRowMenu
        cursor={menu}
        onClose={() => setMenu(null)}
        onBill={setBillingId}
      />
      <ServiceOrderBillingDialog orderId={billingId} onClose={() => setBillingId(null)} />
    </div>
  );
}
