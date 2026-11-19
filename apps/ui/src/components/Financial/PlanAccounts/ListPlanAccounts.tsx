import {
  formatCurrency,
  formatRawDate,
  type ListPageSize,
  listPageSizes,
  planAccountDreLineLabels,
  type PlanAccountNature,
  planAccountNatureLabels,
} from '@erp-360/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ArrowUpDown, Plus } from 'lucide-react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';

import { Button } from '@/components/ui/button';
import { ListPagination } from '@/components/ui/ListPagination';
import {
  ListMessage,
  ListPageHeader,
  ListPanel,
  ListSearch,
} from '@/components/ui/ListShell';
import { StatusListHeader, StatusListRow } from '@/components/ui/StatusList';
import { type StatusTone } from '@/components/ui/statusTone';
import { useDebouncedSearch } from '@/hooks/useDebouncedSearch';
import { type PlanAccount, planAccountsService } from '@/services/planAccounts';

const columns =
  'grid grid-cols-[100px_minmax(180px,1.4fr)_150px_minmax(140px,1fr)_minmax(140px,1fr)_130px_110px]';

type SortField = 'accountCode' | 'name';

const natureTones: Record<PlanAccountNature, StatusTone> = {
  asset: {
    background: '#EFF6FF',
    hover: '#DBEAFE',
    border: '#2563EB',
    text: '#1D4ED8',
  },
  liability: {
    background: '#FFF7ED',
    hover: '#FFEDD5',
    border: '#EA580C',
    text: '#C2410C',
  },
  equity: {
    background: '#F5F3FF',
    hover: '#EDE9FE',
    border: '#7C3AED',
    text: '#6D28D9',
  },
  revenue: {
    background: '#ECFDF5',
    hover: '#D1FAE5',
    border: '#059669',
    text: '#047857',
  },
  expense: {
    background: '#FEF2F2',
    hover: '#FEE2E2',
    border: '#DC2626',
    text: '#B91C1C',
  },
};

const inactiveTone: StatusTone = {
  background: '#F8FAFC',
  hover: '#F1F5F9',
  border: '#64748B',
  text: '#475569',
};

function readPage(params: URLSearchParams) {
  const page = Number(params.get('page') ?? '1');
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function readLimit(params: URLSearchParams): ListPageSize {
  const value = Number(params.get('limit'));
  if ((listPageSizes as readonly number[]).includes(value)) return value as ListPageSize;
  return 10;
}

function readSort(params: URLSearchParams): SortField {
  return params.get('sortField') === 'name' ? 'name' : 'accountCode';
}

function readOrder(params: URLSearchParams): 'asc' | 'desc' {
  return params.get('sortOrder') === 'desc' ? 'desc' : 'asc';
}

function accountTone(account: PlanAccount): StatusTone {
  if (!account.isActive) return inactiveTone;
  return natureTones[account.nature] ?? inactiveTone;
}

export function ListPlanAccounts() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const page = readPage(params);
  const limit = readLimit(params);
  const sortField = readSort(params);
  const sortOrder = readOrder(params);
  const search = params.get('busca') ?? '';
  const from = `/plan-accounts${location.search}`;
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
    queryKey: ['listaPlanAccounts', { page, limit, search, sortField, sortOrder }],
    placeholderData: keepPreviousData,
    queryFn: () =>
      planAccountsService.list({
        page,
        limit,
        sortField,
        sortOrder,
        search: search || undefined,
      }),
  });

  const replaceParams = (change: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(params);
    change(next);
    next.delete('page');
    setParams(next, { replace: true });
  };

  const changeSort = (field: SortField) => {
    const order = sortField === field && sortOrder === 'asc' ? 'desc' : 'asc';
    replaceParams((next) => {
      if (field === 'accountCode') next.delete('sortField');
      else next.set('sortField', field);
      if (order === 'asc') next.delete('sortOrder');
      else next.set('sortOrder', order);
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

  const sortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="h-3.5 w-3.5" />;
    return sortOrder === 'asc' ? (
      <ArrowUp className="h-3.5 w-3.5" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5" />
    );
  };

  const rows = list.data?.data ?? [];
  const meta = list.data?.meta;
  const balanceNote =
    meta?.balanceFrom && meta.balanceTo
      ? ` Receita e despesa mostram o saldo de ${formatRawDate(meta.balanceFrom)} a ${formatRawDate(meta.balanceTo)}. As demais contas mostram o saldo acumulado.`
      : '';

  return (
    <div className="space-y-4">
      <ListPageHeader
        title="Plano de contas"
        description="Código, natureza e saldo. A cor da linha indica a natureza, e a conta inativa fica cinza."
      >
        <Button asChild>
          <Link to="/plan-accounts/new" state={{ from }}>
            <Plus className="h-4 w-4" />
            Novo plano
          </Link>
        </Button>
      </ListPageHeader>

      <ListPanel
        title="Contas"
        description={`Clique na linha para abrir.${balanceNote}`}
        toolbar={
          <ListSearch
            value={searchText}
            onChange={setSearchText}
            placeholder="Buscar por código ou nome..."
            label="Pesquisar o plano de contas"
          />
        }
      >
        <div className="overflow-x-auto">
          <div className="min-w-[1040px]">
            <StatusListHeader columns={columns}>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-left"
                onClick={() => changeSort('accountCode')}
              >
                Código
                {sortIcon('accountCode')}
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-left"
                onClick={() => changeSort('name')}
              >
                Nome
                {sortIcon('name')}
              </button>
              <span>Natureza</span>
              <span>Linha da DRE</span>
              <span>Descrição contábil</span>
              <span>Código contábil</span>
              <span className="text-right">Saldo</span>
            </StatusListHeader>

            {list.isLoading ? (
              <ListMessage>Carregando o plano de contas...</ListMessage>
            ) : list.isError ? (
              <ListMessage tone="error">
                Não foi possível carregar o plano de contas.
              </ListMessage>
            ) : rows.length === 0 ? (
              <ListMessage>
                {search ? 'Nenhuma conta encontrada.' : 'Ainda não há conta no plano.'}
              </ListMessage>
            ) : (
              rows.map((account) => (
                <StatusListRow
                  key={account.id}
                  columns={columns}
                  tone={accountTone(account)}
                  label={`${account.accountCode}, ${account.name}, ${planAccountNatureLabels[account.nature]}, ${account.isActive ? 'ativa' : 'inativa'}`}
                  onOpen={() =>
                    navigate(`/plan-accounts/${account.id}`, { state: { from } })
                  }
                >
                  <span className="min-w-0 truncate font-bold text-[var(--status-text)]">
                    {account.accountCode}
                  </span>
                  <span className="min-w-0 truncate text-[var(--status-text)]">
                    {account.name}
                  </span>
                  <span className="min-w-0 truncate text-[var(--status-text)]">
                    {planAccountNatureLabels[account.nature]}
                  </span>
                  <span className="min-w-0 truncate text-[var(--status-text)]">
                    {account.dreLine ? planAccountDreLineLabels[account.dreLine] : '—'}
                  </span>
                  <span className="min-w-0 truncate text-[var(--status-text)]">
                    {account.accountingDescription || '—'}
                  </span>
                  <span className="min-w-0 truncate text-[var(--status-text)]">
                    {account.accountingAccountCode || '—'}
                  </span>
                  <span className="text-right tabular-nums text-[var(--status-text)]">
                    {account.balance != null ? formatCurrency(account.balance) : '—'}
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
