import { type ListPageSize, listPageSizes, measureTypeLabels } from '@erp-360/shared';
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
import { type Measure, measuresService } from '@/services/measures';

const columns = 'grid grid-cols-[88px_minmax(140px,1.2fr)_120px_minmax(140px,1fr)_132px]';

const activeTone: StatusTone = {
  background: '#F0FDF4',
  hover: '#DCFCE7',
  border: '#16A34A',
  text: '#166534',
};

const inactiveTone: StatusTone = {
  background: '#F8FAFC',
  hover: '#F1F5F9',
  border: '#64748B',
  text: '#334155',
};

type SortField = 'abbreviation' | 'name';

function visibilityLabel(measure: Measure) {
  if (measure.showOnProduct && measure.showOnService) return 'Produto e serviço';
  if (measure.showOnProduct) return 'Produto';
  return 'Serviço';
}

function readPage(params: URLSearchParams) {
  const page = Number(params.get('page') ?? '1');
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function readSort(params: URLSearchParams): SortField {
  return params.get('sortField') === 'name' ? 'name' : 'abbreviation';
}

function readOrder(params: URLSearchParams): 'asc' | 'desc' {
  return params.get('sortOrder') === 'desc' ? 'desc' : 'asc';
}

function readLimit(params: URLSearchParams): ListPageSize {
  const value = Number(params.get('limit'));
  if ((listPageSizes as readonly number[]).includes(value)) return value as ListPageSize;
  return 10;
}

export function ListMeasures() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const page = readPage(params);
  const limit = readLimit(params);
  const sortField = readSort(params);
  const sortOrder = readOrder(params);
  const search = params.get('busca') ?? '';
  const from = `/measures${location.search}`;
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
    queryKey: ['listaMeasures', { page, limit, search, sortField, sortOrder }],
    placeholderData: keepPreviousData,
    queryFn: () =>
      measuresService.list({
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
    if (field === 'abbreviation') next.delete('sortField');
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
      <ListPageHeader title="Medidas" description="Sigla, nome, tipo e situação.">
        <Button asChild>
          <Link to="/measures/new" state={{ from }}>
            <Plus className="h-4 w-4" />
            Nova medida
          </Link>
        </Button>
      </ListPageHeader>

      <ListPanel
        title="Lista de medidas"
        description="Clique na linha para abrir. O hover mantém a cor de cada situação."
        toolbar={
          <ListSearch
            value={searchText}
            onChange={setSearchText}
            placeholder="Buscar por sigla ou nome..."
            label="Pesquisar medidas"
          />
        }
      >
        <div className="overflow-x-auto">
          <div className="min-w-[680px]">
            <StatusListHeader columns={columns}>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-left"
                onClick={() => changeSort('abbreviation')}
              >
                Sigla
                {sortIcon('abbreviation')}
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-left"
                onClick={() => changeSort('name')}
              >
                Nome
                {sortIcon('name')}
              </button>
              <span>Tipo</span>
              <span>Exibir em</span>
              <span>Situação</span>
            </StatusListHeader>

            {list.isLoading ? (
              <ListMessage>Carregando as medidas...</ListMessage>
            ) : list.isError ? (
              <ListMessage tone="error">
                Não foi possível carregar as medidas.
              </ListMessage>
            ) : rows.length === 0 ? (
              <ListMessage>
                {search ? 'Nenhuma medida encontrada.' : 'Ainda não há medida.'}
              </ListMessage>
            ) : (
              rows.map((measure) => {
                const status = measure.isActive ? 'Ativa' : 'Inativa';
                return (
                  <StatusListRow
                    key={measure.id}
                    columns={columns}
                    tone={measure.isActive ? activeTone : inactiveTone}
                    label={`${measure.abbreviation}, ${measure.name}, ${status}`}
                    onOpen={() =>
                      navigate(`/measures/${measure.id}`, { state: { from } })
                    }
                  >
                    <span className="font-bold">{measure.abbreviation}</span>
                    <span className="min-w-0 truncate">{measure.name}</span>
                    <span className="min-w-0 truncate">
                      {measureTypeLabels[measure.measureType]}
                    </span>
                    <span className="min-w-0 truncate">{visibilityLabel(measure)}</span>
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
