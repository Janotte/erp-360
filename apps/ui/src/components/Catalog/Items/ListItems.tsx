import { catalogItemTypeLabels, formatRawDate } from '@erp-360/shared';
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
import { itemsService } from '@/services/items';

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

export function ListItems() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [searchText, setSearchText] = useState(params.get('busca') ?? '');
  const page = readPage(params);
  const sortField = readSort(params);
  const sortOrder = readOrder(params);
  const search = params.get('busca') ?? '';
  const from = `/items${location.search}`;

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
    queryKey: ['listaItems', { page, search, sortField, sortOrder }],
    placeholderData: keepPreviousData,
    queryFn: () =>
      itemsService.list({
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

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="ml-2 h-4 w-4 shrink-0" />;
    return sortOrder === 'asc' ? (
      <ArrowUp className="ml-2 h-4 w-4 shrink-0 text-primary" />
    ) : (
      <ArrowDown className="ml-2 h-4 w-4 shrink-0 text-primary" />
    );
  };

  const openItem = (id: string) => {
    navigate(`/items/${id}`, { state: { from } });
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
            placeholder="Buscar por código, SKU, nome ou barras..."
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            className="pl-9"
          />
        </div>
        <Button asChild>
          <Link to="/items/new" state={{ from }}>
            <Plus className="h-4 w-4" /> Novo item
          </Link>
        </Button>
      </div>

      <div className="rounded-md border border-zinc-200 bg-white shadow-2xs">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Button variant="ghost" className="px-0" onClick={() => changeSort('code')}>
                  Código
                  {renderSortIcon('code')}
                </Button>
              </TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>
                <Button variant="ghost" className="px-0" onClick={() => changeSort('name')}>
                  Nome
                  {renderSortIcon('name')}
                </Button>
              </TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Medida</TableHead>
              <TableHead>Disponível</TableHead>
              <TableHead>Preço de lista</TableHead>
              <TableHead>Custo médio</TableHead>
              <TableHead>Margem</TableHead>
              <TableHead>Última entrada</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows?.map((item) => (
              <TableRow
                key={item.id}
                className={item.isActive ? 'cursor-pointer' : 'cursor-pointer text-zinc-400'}
                onClick={() => openItem(item.id)}
              >
                <TableCell className="font-medium">
                  <Link
                    to={`/items/${item.id}`}
                    state={{ from }}
                    className="font-medium"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {item.code}
                  </Link>
                </TableCell>
                <TableCell>{item.sku || '—'}</TableCell>
                <TableCell>{item.name}</TableCell>
                <TableCell>{catalogItemTypeLabels[item.type]}</TableCell>
                <TableCell>{item.measureAbbreviation}</TableCell>
                <TableCell>{formatAvailable(item)}</TableCell>
                <TableCell>{formatMoney4(item.listPrice)}</TableCell>
                <TableCell>{formatMoney4(item.averageCost)}</TableCell>
                <TableCell>{formatPercent(item.grossMargin)}</TableCell>
                <TableCell>{formatRawDate(item.lastInboundOn) || '—'}</TableCell>
              </TableRow>
            ))}
            {rows && rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="py-4 text-center text-zinc-500">
                  Nenhum item encontrado.
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
