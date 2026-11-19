import {
  civilDate,
  formatCurrency,
  formatRawDate,
  type ListPageSize,
  listPageSizes,
} from '@erp-360/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ArrowUpDown, Plus, Printer } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ListPagination } from '@/components/ui/ListPagination';
import {
  ListFilter,
  ListMessage,
  ListPageHeader,
  ListPanel,
  ListSearch,
} from '@/components/ui/ListShell';
import { StatusListHeader, StatusListRow } from '@/components/ui/StatusList';
import { useDebouncedSearch } from '@/hooks/useDebouncedSearch';
import {
  type FinancialAccount,
  financialService,
  type TitleSortField,
} from '@/services/financials';

import { openTitleReport } from '../titleReport';
import { titleRowTone } from '../titleRowTone';

const columns =
  'grid grid-cols-[minmax(110px,0.7fr)_minmax(160px,1.1fr)_minmax(180px,1.4fr)_104px_104px_120px]';

const sortFields: TitleSortField[] = [
  'documentNumber',
  'personName',
  'description',
  'issueOn',
  'dueOn',
  'installmentAmount',
];

const statuses = ['pendente', 'atrasado', 'recebido', 'cancelado'] as const;
type ReceivableStatusFilter = (typeof statuses)[number];

const statusLabels: Record<ReceivableStatusFilter, string> = {
  pendente: 'Pendente',
  atrasado: 'Atrasado',
  recebido: 'Recebido',
  cancelado: 'Cancelado',
};

function readPage(params: URLSearchParams) {
  const page = Number(params.get('page') ?? '1');
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function readSort(params: URLSearchParams): TitleSortField {
  const value = params.get('sortField');
  return sortFields.includes(value as TitleSortField)
    ? (value as TitleSortField)
    : 'dueOn';
}

function readOrder(params: URLSearchParams): 'asc' | 'desc' {
  return params.get('sortOrder') === 'desc' ? 'desc' : 'asc';
}

function readLimit(params: URLSearchParams): ListPageSize {
  const value = Number(params.get('limit'));
  if ((listPageSizes as readonly number[]).includes(value)) return value as ListPageSize;
  return 10;
}

function readStatus(params: URLSearchParams): ReceivableStatusFilter | 'all' {
  const value = params.get('status');
  return statuses.includes(value as ReceivableStatusFilter)
    ? (value as ReceivableStatusFilter)
    : 'all';
}

function readDate(params: URLSearchParams, key: string) {
  const value = params.get(key) ?? '';
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
}

function situationLabel(account: FinancialAccount) {
  if (account.status === 'recebido') return 'recebida';
  if (account.status === 'cancelado') return 'cancelada';
  const due = account.dueOn.slice(0, 10);
  const today = civilDate();
  if (due < today) return 'atrasada';
  if (due === today) return 'vence hoje';
  return 'pendente';
}

function DateFilter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-[13px] text-[#64748b]">
      {label}
      <Input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-[42px] w-[148px] border-[#cbd5e1]"
        aria-label={label}
      />
    </label>
  );
}

export function ReceivableList() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const page = readPage(params);
  const limit = readLimit(params);
  const sortField = readSort(params);
  const sortOrder = readOrder(params);
  const search = params.get('busca') ?? '';
  const status = readStatus(params);
  const dueFrom = readDate(params, 'dueFrom');
  const dueTo = readDate(params, 'dueTo');
  const issueFrom = readDate(params, 'issueFrom');
  const issueTo = readDate(params, 'issueTo');
  const from = `/receivables${location.search}`;
  const [reportPending, setReportPending] = useState(false);
  const { text: searchText, setText: setSearchText } = useDebouncedSearch(
    (next) => {
      setParams(
        (current) => {
          const updated = new URLSearchParams(current);
          if ((updated.get('busca') ?? '') === next) return current;
          if (next) updated.set('busca', next);
          else updated.delete('busca');
          updated.delete('page');
          return updated;
        },
        { replace: true },
      );
    },
    400,
    search,
  );

  const list = useQuery({
    queryKey: [
      'financial',
      'receivable',
      {
        page,
        limit,
        status,
        search,
        dueFrom,
        dueTo,
        issueFrom,
        issueTo,
        sortField,
        sortOrder,
      },
    ],
    placeholderData: keepPreviousData,
    queryFn: () =>
      financialService.list('receivable', {
        page,
        limit,
        sortField,
        sortOrder,
        status: status === 'all' ? undefined : status,
        search: search || undefined,
        dueFrom: dueFrom || undefined,
        dueTo: dueTo || undefined,
        issueFrom: issueFrom || undefined,
        issueTo: issueTo || undefined,
      }),
  });

  const replaceParams = (change: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(params);
    change(next);
    next.delete('page');
    setParams(next, { replace: true });
  };

  const changeSort = (field: TitleSortField) => {
    const order = sortField === field && sortOrder === 'asc' ? 'desc' : 'asc';
    replaceParams((next) => {
      if (field === 'dueOn') next.delete('sortField');
      else next.set('sortField', field);
      if (order === 'asc') next.delete('sortOrder');
      else next.set('sortOrder', order);
    });
  };

  const changeStatus = (nextStatus: ReceivableStatusFilter | 'all') => {
    replaceParams((next) => {
      if (nextStatus === 'all') next.delete('status');
      else next.set('status', nextStatus);
    });
  };

  const changeDate = (key: string, value: string) => {
    replaceParams((next) => {
      if (value) next.set(key, value);
      else next.delete(key);
    });
  };

  const setPage = (nextPage: number) => {
    const next = new URLSearchParams(params);
    if (nextPage <= 1) next.delete('page');
    else next.set('page', String(nextPage));
    setParams(next, { replace: true });
  };

  const setLimit = (nextLimit: ListPageSize) => {
    const next = new URLSearchParams(params);
    if (nextLimit === 10) next.delete('limit');
    else next.set('limit', String(nextLimit));
    next.delete('page');
    setParams(next, { replace: true });
  };

  const sortIcon = (field: TitleSortField) => {
    if (sortField !== field) return <ArrowUpDown className="h-3.5 w-3.5" />;
    return sortOrder === 'asc' ? (
      <ArrowUp className="h-3.5 w-3.5" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5" />
    );
  };

  const openReport = async () => {
    setReportPending(true);
    try {
      await openTitleReport({
        kind: 'receivable',
        status: status === 'all' ? 'todos' : status,
        search: search || undefined,
        dueFrom: dueFrom || undefined,
        dueTo: dueTo || undefined,
        issueFrom: issueFrom || undefined,
        issueTo: issueTo || undefined,
        sortField,
        sortOrder,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao gerar o relatório.');
    } finally {
      setReportPending(false);
    }
  };

  const rows = list.data?.data ?? [];
  const meta = list.data?.meta;
  const filtered = Boolean(
    search || status !== 'all' || dueFrom || dueTo || issueFrom || issueTo,
  );

  return (
    <div className="space-y-4">
      <ListPageHeader
        title="Contas a receber"
        description="Documento, cliente, vencimento e valor. A cor da linha indica a situação."
      >
        <Button
          variant="outline"
          onClick={() => void openReport()}
          disabled={reportPending}
        >
          <Printer className="h-4 w-4" />
          {reportPending ? 'Gerando...' : 'Relatório'}
        </Button>
        <Button asChild>
          <Link to="/receivables/new" state={{ from }}>
            <Plus className="h-4 w-4" />
            Novo receber
          </Link>
        </Button>
      </ListPageHeader>

      <ListPanel
        title="Lista de contas"
        description="Clique na linha para abrir. O hover mantém a cor de cada situação."
        toolbar={
          <>
            <ListSearch
              value={searchText}
              onChange={setSearchText}
              placeholder="Buscar por cliente ou documento..."
              label="Pesquisar contas a receber"
            />
            <ListFilter
              value={status}
              onValueChange={changeStatus}
              label="Filtrar por situação"
              allLabel="Todas as situações"
              options={statuses.map((value) => ({
                value,
                label: statusLabels[value],
              }))}
            />
            <DateFilter
              label="Venc. de"
              value={dueFrom}
              onChange={(value) => changeDate('dueFrom', value)}
            />
            <DateFilter
              label="Venc. até"
              value={dueTo}
              onChange={(value) => changeDate('dueTo', value)}
            />
            <DateFilter
              label="Emissão de"
              value={issueFrom}
              onChange={(value) => changeDate('issueFrom', value)}
            />
            <DateFilter
              label="Emissão até"
              value={issueTo}
              onChange={(value) => changeDate('issueTo', value)}
            />
          </>
        }
      >
        <div className="overflow-x-auto">
          <div className="min-w-[860px]">
            <StatusListHeader columns={columns}>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-left"
                onClick={() => changeSort('documentNumber')}
              >
                Documento
                {sortIcon('documentNumber')}
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-left"
                onClick={() => changeSort('personName')}
              >
                Cliente
                {sortIcon('personName')}
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-left"
                onClick={() => changeSort('description')}
              >
                Descrição
                {sortIcon('description')}
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-left"
                onClick={() => changeSort('issueOn')}
              >
                Emissão
                {sortIcon('issueOn')}
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-left"
                onClick={() => changeSort('dueOn')}
              >
                Vencimento
                {sortIcon('dueOn')}
              </button>
              <button
                type="button"
                className="inline-flex w-full items-center justify-end gap-1 text-right"
                onClick={() => changeSort('installmentAmount')}
              >
                Valor
                {sortIcon('installmentAmount')}
              </button>
            </StatusListHeader>

            {list.isLoading ? (
              <ListMessage>Carregando as contas a receber...</ListMessage>
            ) : list.isError ? (
              <ListMessage tone="error">
                Não foi possível carregar as contas a receber.
              </ListMessage>
            ) : rows.length === 0 ? (
              <ListMessage>
                {filtered
                  ? 'Nenhuma conta a receber encontrada.'
                  : 'Ainda não há conta a receber.'}
              </ListMessage>
            ) : (
              rows.map((account) => (
                <StatusListRow
                  key={account.id}
                  columns={columns}
                  tone={titleRowTone(account.status, account.dueOn)}
                  label={`${account.description}, ${account.personName ?? 'sem cliente'}, ${situationLabel(account)}`}
                  onOpen={() =>
                    navigate(`/receivables/${account.id}`, { state: { from } })
                  }
                >
                  <span className="min-w-0 truncate text-[var(--status-text)]">
                    {account.documentNumber || '—'}
                  </span>
                  <span className="min-w-0 truncate text-[var(--status-text)]">
                    {account.personName || '—'}
                  </span>
                  <span className="min-w-0 truncate font-bold text-[var(--status-text)]">
                    {account.description}
                  </span>
                  <span className="text-[var(--status-text)]">
                    {formatRawDate(account.issueOn)}
                  </span>
                  <span className="text-[var(--status-text)]">
                    {formatRawDate(account.dueOn)}
                  </span>
                  <span className="text-right tabular-nums text-[var(--status-text)]">
                    {formatCurrency(account.installmentAmount)}
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
            onLimitChange={setLimit}
          />
        ) : null}
      </ListPanel>
    </div>
  );
}
