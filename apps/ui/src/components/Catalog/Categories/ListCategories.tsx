import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
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
import { categoriesService } from '@/services/categories';

function readPage(params: URLSearchParams) {
  const page = Number(params.get('page') ?? '1');
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function readOrder(params: URLSearchParams): 'asc' | 'desc' {
  return params.get('sortOrder') === 'desc' ? 'desc' : 'asc';
}

export function ListCategories() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [searchText, setSearchText] = useState(params.get('busca') ?? '');
  const page = readPage(params);
  const sortOrder = readOrder(params);
  const search = params.get('busca') ?? '';
  const from = `/categories${location.search}`;

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
    queryKey: ['listaCategories', { page, search, sortField: 'name', sortOrder }],
    placeholderData: keepPreviousData,
    queryFn: () =>
      categoriesService.list({
        page,
        limit: 10,
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

  const openCategory = (id: string) => {
    navigate(`/categories/${id}`, { state: { from } });
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
            placeholder="Buscar por nome..."
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            className="pl-9"
          />
        </div>
        <Button asChild>
          <Link to="/categories/new" state={{ from }}>
            <Plus className="h-4 w-4" /> Nova categoria
          </Link>
        </Button>
      </div>

      <div className="rounded-md border border-zinc-200 bg-white shadow-2xs">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Button variant="ghost" className="px-0" onClick={changeSort}>
                  Nome
                  {sortOrder === 'asc' ? (
                    <ArrowUp className="ml-2 h-4 w-4 shrink-0 text-primary" />
                  ) : (
                    <ArrowDown className="ml-2 h-4 w-4 shrink-0 text-primary" />
                  )}
                </Button>
              </TableHead>
              <TableHead>Categoria pai</TableHead>
              <TableHead>Situação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows?.map((category) => (
              <TableRow
                key={category.id}
                className={
                  category.isActive ? 'cursor-pointer' : 'cursor-pointer text-zinc-400'
                }
                onClick={() => openCategory(category.id)}
              >
                <TableCell className="font-medium">
                  <Link
                    to={`/categories/${category.id}`}
                    state={{ from }}
                    className="font-medium"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {category.name}
                  </Link>
                </TableCell>
                <TableCell>{category.parentName ?? 'Raiz'}</TableCell>
                <TableCell>{category.isActive ? 'Ativa' : 'Inativa'}</TableCell>
              </TableRow>
            ))}
            {rows && rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="py-4 text-center text-zinc-500">
                  Nenhuma categoria encontrada.
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
