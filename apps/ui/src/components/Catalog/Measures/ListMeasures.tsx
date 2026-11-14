import { measureTypeLabels } from '@erp-360/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { type Measure, measuresService } from '@/services/measures';

function visibilityLabel(measure: Measure) {
  if (measure.showOnProduct && measure.showOnService) return 'Produto e serviço';
  if (measure.showOnProduct) return 'Produto';
  return 'Serviço';
}

type SortField = 'abbreviation' | 'name';

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

export function ListMeasures() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [searchText, setSearchText] = useState(params.get('busca') ?? '');
  const page = readPage(params);
  const sortField = readSort(params);
  const sortOrder = readOrder(params);
  const search = params.get('busca') ?? '';
  const from = `/measures${location.search}`;

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = searchText.trim();
      const current = params.get('busca') ?? '';
      if (next === current) return;
      const updated = new URLSearchParams(params);
      if (next) updated.set('busca', next);
      else updated.delete('busca');
      updated.delete('page');
      setParams(updated, { replace: true });
    }, 500);
    return () => clearTimeout(timer);
  }, [searchText, params, setParams]);

  const { data: response, isLoading } = useQuery({
    queryKey: ['listaMeasures', { page, search, sortField, sortOrder }],
    placeholderData: keepPreviousData,
    queryFn: () =>
      measuresService.list({
        page,
        limit: 10,
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

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="ml-2 h-4 w-4 shrink-0" />;
    return sortOrder === 'asc' ? (
      <ArrowUp className="ml-2 h-4 w-4 shrink-0 text-primary" />
    ) : (
      <ArrowDown className="ml-2 h-4 w-4 shrink-0 text-primary" />
    );
  };

  const openMeasure = (id: string) => {
    navigate(`/measures/${id}`, { state: { from } });
  };

  const meta = response?.meta;
  const rows = response?.data;

  if (isLoading && !response) return <p>Carregando registros...</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-400" />
          <Input
            placeholder="Buscar por sigla ou nome..."
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            className="pl-9"
          />
        </div>
        <Button asChild>
          <Link to="/measures/new" state={{ from }}>
            <Plus className="h-4 w-4" /> Nova medida
          </Link>
        </Button>
      </div>

      <div className="rounded-md border border-zinc-200 bg-white shadow-2xs">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Button
                  variant="ghost"
                  className="px-0"
                  onClick={() => changeSort('abbreviation')}
                >
                  Sigla
                  {renderSortIcon('abbreviation')}
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  className="px-0"
                  onClick={() => changeSort('name')}
                >
                  Nome
                  {renderSortIcon('name')}
                </Button>
              </TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Exibir em</TableHead>
              <TableHead>Situação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows?.map((measure) => (
              <TableRow
                key={measure.id}
                className={
                  measure.isActive ? 'cursor-pointer' : 'cursor-pointer text-zinc-400'
                }
                onClick={() => openMeasure(measure.id)}
              >
                <TableCell className="font-medium">
                  <Link
                    to={`/measures/${measure.id}`}
                    state={{ from }}
                    className="font-medium"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {measure.abbreviation}
                  </Link>
                </TableCell>
                <TableCell>{measure.name}</TableCell>
                <TableCell>{measureTypeLabels[measure.measureType]}</TableCell>
                <TableCell>{visibilityLabel(measure)}</TableCell>
                <TableCell>{measure.isActive ? 'Ativa' : 'Inativa'}</TableCell>
              </TableRow>
            ))}
            {rows && rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-4 text-center text-zinc-500">
                  Nenhuma medida encontrada.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      {meta && meta.totalPages > 1 ? (
        <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-3">
          <div className="text-sm text-zinc-500">
            Mostrando página <strong className="text-zinc-900">{meta.page}</strong> de{' '}
            <strong className="text-zinc-900">{meta.totalPages}</strong> ({meta.total}{' '}
            registros no total)
          </div>
          <div className="flex space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(Math.max(page - 1, 1))}
              disabled={page === 1}
              className="gap-1"
            >
              <ChevronLeft className="h-4 w-4" /> Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page < meta.totalPages ? page + 1 : page)}
              disabled={page === meta.totalPages}
              className="gap-1"
            >
              Próximo <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
