import {
  catalogItemTypeLabels,
  formatRawDate,
  type ListPageSize,
  listPageSizes,
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
import { StatusBadge, StatusListHeader, StatusListRow } from '@/components/ui/StatusList';
import { type StatusTone } from '@/components/ui/statusTone';
import { useDebouncedSearch } from '@/hooks/useDebouncedSearch';
import { itemsService } from '@/services/items';

const columns =
  'grid grid-cols-[96px_110px_minmax(160px,1.4fr)_110px_72px_96px_128px_128px_88px_120px_120px]';

const productTone: StatusTone = {
  background: '#EFF6FF',
  hover: '#DBEAFE',
  border: '#2563EB',
  text: '#1D4ED8',
};

const serviceTone: StatusTone = {
  background: '#F5F3FF',
  hover: '#EDE9FE',
  border: '#8B5CF6',
  text: '#6D28D9',
};

const inactiveTone: StatusTone = {
  background: '#F8FAFC',
  hover: '#F1F5F9',
  border: '#64748B',
  text: '#334155',
};

function itemTone(item: { isActive: boolean; type: 'product' | 'service' }) {
  if (!item.isActive) return inactiveTone;
  return item.type === 'service' ? serviceTone : productTone;
}

function formatMoney4(value: string | null) {
  if (!value) return '—';
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return number.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

function formatPercent(value: string | null) {
  if (!value) return '—';
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return `${number.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function formatAvailable(item: { tracksStock: boolean; quantity: string | null }) {
  if (!item.tracksStock) return '—';
  const number = Number(item.quantity ?? 0);
  if (!Number.isFinite(number)) return '—';
  return number.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
}

type SortField = 'code' | 'name';

function readPage(params: URLSearchParams) {
  const page = Number(params.get('page') ?? '1');
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function readSort(params: URLSearchParams): SortField {
  return params.get('sortField') === 'name' ? 'name' : 'code';
}

function readOrder(params: URLSearchParams): 'asc' | 'desc' {
  return params.get('sortOrder') === 'desc' ? 'desc' : 'asc';
}

function readLimit(params: URLSearchParams): ListPageSize {
  const value = Number(params.get('limit'));
  if ((listPageSizes as readonly number[]).includes(value)) return value as ListPageSize;
  return 10;
}

export function ListItems() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const page = readPage(params);
  const limit = readLimit(params);
  const sortField = readSort(params);
  const sortOrder = readOrder(params);
  const search = params.get('busca') ?? '';
  const from = `/items${location.search}`;
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
    queryKey: ['listaItems', { page, limit, search, sortField, sortOrder }],
    placeholderData: keepPreviousData,
    queryFn: () =>
      itemsService.list({
        page,
        limit,
        sortField,
        sortOrder,
        search: search || undefined,
      }),
  });

  const changeSort = (field: SortField) => {
    const next = new URLSearchParams(params);
    const order = sortField === field && sortOrder === 'asc' ? 'desc' : 'asc';
    if (field === 'code') next.delete('sortField');
    else next.set('sortField', field);
    if (order === 'asc') next.delete('sortOrder');
    else next.set('sortOrder', order);
    next.delete('page');
    setParams(next, { replace: true });
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

  return (
    <div className="space-y-4">
      <ListPageHeader title="Itens" description="Código, nome, medida e situação.">
        <Button asChild>
          <Link to="/items/new" state={{ from }}>
            <Plus className="h-4 w-4" />
            Novo item
          </Link>
        </Button>
      </ListPageHeader>

      <ListPanel
        title="Lista de itens"
        description="Clique na linha para abrir. Produto e serviço têm cores próprias; o inativo segue o cinza das outras listas."
        toolbar={
          <ListSearch
            value={searchText}
            onChange={setSearchText}
            placeholder="Buscar por código, SKU, nome ou barras..."
            label="Pesquisar itens"
          />
        }
      >
        <div className="overflow-x-auto">
          <div className="min-w-[1240px]">
            <StatusListHeader columns={columns}>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-left"
                onClick={() => changeSort('code')}
              >
                Código
                {sortIcon('code')}
              </button>
              <span>SKU</span>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-left"
                onClick={() => changeSort('name')}
              >
                Nome
                {sortIcon('name')}
              </button>
              <span>Tipo</span>
              <span>Medida</span>
              <span>Disponível</span>
              <span>Preço de lista</span>
              <span>Custo médio</span>
              <span>Margem</span>
              <span>Última entrada</span>
              <span>Situação</span>
            </StatusListHeader>

            {list.isLoading ? (
              <ListMessage>Carregando os itens...</ListMessage>
            ) : list.isError ? (
              <ListMessage tone="error">Não foi possível carregar os itens.</ListMessage>
            ) : rows.length === 0 ? (
              <ListMessage>
                {search ? 'Nenhum item encontrado.' : 'Ainda não há item.'}
              </ListMessage>
            ) : (
              rows.map((item) => {
                const status = item.isActive ? 'Ativo' : 'Inativo';
                return (
                  <StatusListRow
                    key={item.id}
                    columns={columns}
                    tone={itemTone(item)}
                    label={`${item.code}, ${item.name}, ${status}`}
                    onOpen={() => navigate(`/items/${item.id}`, { state: { from } })}
                  >
                    <span className="font-bold">{item.code}</span>
                    <span className="min-w-0 truncate">{item.sku || '—'}</span>
                    <span className="min-w-0 truncate">{item.name}</span>
                    <span className="min-w-0 truncate">
                      {catalogItemTypeLabels[item.type]}
                    </span>
                    <span>{item.measureAbbreviation}</span>
                    <span>{formatAvailable(item)}</span>
                    <span className="whitespace-nowrap">
                      {formatMoney4(item.listPrice)}
                    </span>
                    <span className="whitespace-nowrap">
                      {formatMoney4(item.averageCost)}
                    </span>
                    <span>{formatPercent(item.grossMargin)}</span>
                    <span className="whitespace-nowrap">
                      {formatRawDate(item.lastInboundOn) || '—'}
                    </span>
                    <span>
                      <StatusBadge label={status} />
                    </span>
                  </StatusListRow>
                );
              })
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
