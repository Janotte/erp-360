import { type ListPageSize, listPageSizes } from '@erp-360/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Plus } from 'lucide-react';
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
import { categoriesService } from '@/services/categories';

const columns = 'grid grid-cols-[minmax(180px,1.4fr)_minmax(160px,1fr)_132px]';

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

function readPage(params: URLSearchParams) {
  const page = Number(params.get('page') ?? '1');
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function readOrder(params: URLSearchParams): 'asc' | 'desc' {
  return params.get('sortOrder') === 'desc' ? 'desc' : 'asc';
}

function readLimit(params: URLSearchParams): ListPageSize {
  const value = Number(params.get('limit'));
  if ((listPageSizes as readonly number[]).includes(value)) return value as ListPageSize;
  return 10;
}

export function ListCategories() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const page = readPage(params);
  const limit = readLimit(params);
  const sortOrder = readOrder(params);
  const search = params.get('busca') ?? '';
  const from = `/categories${location.search}`;
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
    queryKey: ['listaCategories', { page, limit, search, sortField: 'name', sortOrder }],
    placeholderData: keepPreviousData,
    queryFn: () =>
      categoriesService.list({
        page,
        limit,
        sortField: 'name',
        sortOrder,
        search: search || undefined,
      }),
  });

  const changeSort = () => {
    const next = new URLSearchParams(params);
    if (sortOrder === 'asc') next.set('sortOrder', 'desc');
    else next.delete('sortOrder');
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

  const rows = list.data?.data ?? [];
  const meta = list.data?.meta;

  return (
    <div className="space-y-4">
      <ListPageHeader title="Categorias" description="Nome, categoria pai e situação.">
        <Button asChild>
          <Link to="/categories/new" state={{ from }}>
            <Plus className="h-4 w-4" />
            Nova categoria
          </Link>
        </Button>
      </ListPageHeader>

      <ListPanel
        title="Lista de categorias"
        description="Clique na linha para abrir. O hover mantém a cor de cada situação."
        toolbar={
          <ListSearch
            value={searchText}
            onChange={setSearchText}
            placeholder="Buscar por nome..."
            label="Pesquisar categorias"
          />
        }
      >
        <div className="overflow-x-auto">
          <div className="min-w-[560px]">
            <StatusListHeader columns={columns}>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-left"
                onClick={changeSort}
              >
                Nome
                {sortOrder === 'asc' ? (
                  <ArrowUp className="h-3.5 w-3.5" />
                ) : (
                  <ArrowDown className="h-3.5 w-3.5" />
                )}
              </button>
              <span>Categoria pai</span>
              <span>Situação</span>
            </StatusListHeader>

            {list.isLoading ? (
              <ListMessage>Carregando as categorias...</ListMessage>
            ) : list.isError ? (
              <ListMessage tone="error">
                Não foi possível carregar as categorias.
              </ListMessage>
            ) : rows.length === 0 ? (
              <ListMessage>
                {search ? 'Nenhuma categoria encontrada.' : 'Ainda não há categoria.'}
              </ListMessage>
            ) : (
              rows.map((category) => {
                const status = category.isActive ? 'Ativa' : 'Inativa';
                return (
                  <StatusListRow
                    key={category.id}
                    columns={columns}
                    tone={category.isActive ? activeTone : inactiveTone}
                    label={`${category.name}, ${category.parentName ?? 'Raiz'}, ${status}`}
                    onOpen={() =>
                      navigate(`/categories/${category.id}`, { state: { from } })
                    }
                  >
                    <span className="min-w-0 truncate font-bold">{category.name}</span>
                    <span className="min-w-0 truncate">
                      {category.parentName ?? 'Raiz'}
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
