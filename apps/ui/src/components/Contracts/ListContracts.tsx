import { formatCurrency, type ListPageSize } from '@erp-360/shared';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';

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
  billingConfirmText,
  billingDoneText,
  type ContractBillingKind,
  type ContractBillingResult,
  type ContractListItem,
  contractsService,
  type ContractStatus,
} from '@/services/contracts';

const statusLabels: Record<ContractStatus, string> = {
  draft: 'Rascunho',
  active: 'Vigente',
  suspended: 'Suspenso',
  closed: 'Encerrado',
  cancelled: 'Cancelado',
};

const statusTone: Record<ContractStatus, StatusTone> = {
  draft: { background: '#F8FAFC', hover: '#F1F5F9', border: '#64748B', text: '#334155' },
  active: { background: '#F0FDF4', hover: '#DCFCE7', border: '#16A34A', text: '#166534' },
  suspended: {
    background: '#FFFBEB',
    hover: '#FEF3C7',
    border: '#D97706',
    text: '#92400E',
  },
  closed: { background: '#F0FDFA', hover: '#CCFBF1', border: '#0D9488', text: '#0F766E' },
  cancelled: {
    background: '#FEF2F2',
    hover: '#FEE2E2',
    border: '#DC2626',
    text: '#B91C1C',
  },
};

const billingKindLabels: Record<ContractBillingKind, string> = {
  none: 'Sem cobrança',
  monthly: 'Mensal',
  quarterly: 'Trimestral',
  semiannual: 'Semestral',
  annual: 'Anual',
};

const statuses = Object.keys(statusLabels) as ContractStatus[];

const columns =
  'grid grid-cols-[88px_minmax(140px,1.1fr)_minmax(140px,1fr)_minmax(168px,1.15fr)_minmax(140px,1fr)_132px]';

function formatDate(value: string | null) {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function termLabel(row: ContractListItem) {
  const start = formatDate(row.startedOn);
  if (!row.endedOn) return `${start} · indeterminado`;
  return `${start} – ${formatDate(row.endedOn)}`;
}

function billingLabel(row: ContractListItem) {
  if (row.billingKind === 'none') return 'Sem cobrança';
  return `${formatCurrency(row.periodAmount)} · ${billingKindLabels[row.billingKind]}`;
}

export function ListContracts() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ContractStatus | 'all'>('all');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<ListPageSize>(10);
  const [billingPreview, setBillingPreview] = useState<ContractBillingResult | null>(
    null,
  );
  const { text: searchText, setText: setSearchText } = useDebouncedSearch((next) => {
    setSearch(next);
    setPage(1);
  });

  function changeStatus(next: ContractStatus | 'all') {
    setStatus(next);
    setPage(1);
  }

  const list = useQuery({
    queryKey: ['contracts', { q: search, status, page, limit }],
    placeholderData: keepPreviousData,
    queryFn: () =>
      contractsService.list({
        q: search || undefined,
        status: status === 'all' ? undefined : status,
        page,
        limit,
      }),
  });

  const previewBillings = useMutation({
    mutationFn: () => contractsService.previewBillings(),
    onSuccess: (result) => {
      if (result.titles === 0) {
        setBillingPreview(null);
        toast.message('Nenhuma parcela pronta para cobrança.');
        return;
      }
      setBillingPreview(result);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Falha ao consultar a cobrança.');
    },
  });

  const generateBillings = useMutation({
    mutationFn: () => contractsService.generateBillings(),
    onSuccess: (result) => {
      setBillingPreview(null);
      if (result.failures.length > 0) toast.error(billingDoneText(result));
      else if (result.titles === 0)
        toast.message('Nenhuma parcela pronta para cobrança.');
      else toast.success(billingDoneText(result));
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Falha ao gerar a cobrança.');
    },
  });

  const billingPending = previewBillings.isPending || generateBillings.isPending;
  const rows = list.data?.data ?? [];
  const meta = list.data?.meta;

  return (
    <div className="space-y-4">
      <ListPageHeader
        title="Contratos"
        description="Cliente, vigência e cobrança do período."
      >
        <Button
          type="button"
          variant="outline"
          disabled={billingPending}
          onClick={() => previewBillings.mutate()}
        >
          Gerar cobranças
        </Button>
        <Button asChild>
          <Link to="/contracts/new">
            <Plus className="h-4 w-4" />
            Novo contrato
          </Link>
        </Button>
      </ListPageHeader>

      {billingPreview ? (
        <div className="flex flex-col gap-3 rounded-[14px] border border-[#dfe5ee] bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-[#243145]">{billingConfirmText(billingPreview)}</p>
          <div className="flex gap-2">
            <Button
              type="button"
              disabled={billingPending}
              onClick={() => generateBillings.mutate()}
            >
              Confirmar
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={billingPending}
              onClick={() => setBillingPreview(null)}
            >
              Voltar
            </Button>
          </div>
        </div>
      ) : null}

      <ListPanel
        title="Lista de contratos"
        description="Clique na linha para abrir. O hover mantém a cor de cada situação."
        toolbar={
          <>
            <ListSearch
              value={searchText}
              onChange={setSearchText}
              placeholder="Número, título ou cliente"
              label="Pesquisar contratos"
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
          <div className="min-w-[920px]">
            <StatusListHeader columns={columns}>
              <span>Número</span>
              <span>Cliente</span>
              <span>Título</span>
              <span>Vigência</span>
              <span>Cobrança</span>
              <span>Situação</span>
            </StatusListHeader>

            {list.isLoading ? (
              <ListMessage>Carregando os contratos...</ListMessage>
            ) : list.isError ? (
              <ListMessage tone="error">
                Não foi possível carregar os contratos.
              </ListMessage>
            ) : rows.length === 0 ? (
              <ListMessage>
                {search || status !== 'all'
                  ? 'Nenhum contrato encontrado.'
                  : 'Ainda não há contrato.'}
              </ListMessage>
            ) : (
              rows.map((row) => (
                <StatusListRow
                  key={row.id}
                  columns={columns}
                  tone={statusTone[row.status]}
                  label={`${row.numberLabel}, ${row.customerName}, ${statusLabels[row.status]}`}
                  onOpen={() => navigate(`/contracts/${row.id}`)}
                >
                  <span className="font-bold">{row.numberLabel}</span>
                  <span className="min-w-0 truncate">{row.customerName}</span>
                  <span className="min-w-0 truncate">{row.title.trim() || '—'}</span>
                  <span className="whitespace-nowrap">{termLabel(row)}</span>
                  <span className="min-w-0 truncate">{billingLabel(row)}</span>
                  <span>
                    <StatusBadge label={statusLabels[row.status]} />
                    {row.termExpired ? (
                      <span className="mt-1 block text-xs font-medium text-amber-700">
                        Vigência vencida
                      </span>
                    ) : null}
                  </span>
                </StatusListRow>
              ))
            )}
          </div>
        </div>
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
    </div>
  );
}
