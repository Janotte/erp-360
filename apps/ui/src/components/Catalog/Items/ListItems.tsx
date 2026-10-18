import { catalogItemTypeLabels } from '@erp-360/shared';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { type CatalogItem, itemsService } from '@/services/items';

import { FormItem } from './FormItem';

type SortField = 'code' | 'name';

export function ListItems() {
  const queryClient = useQueryClient();
  const [openDialog, setOpenDialog] = useState(false);
  const [openAlert, setOpenAlert] = useState(false);
  const [selected, setSelected] = useState<CatalogItem | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sortField, setSortField] = useState<SortField>('code');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch((current) => {
        const next = searchText.trim();
        if (current !== next) setPage(1);
        return next;
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [searchText]);

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
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
    setPage(1);
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="ml-2 h-4 w-4 shrink-0" />;
    return sortOrder === 'asc' ? (
      <ArrowUp className="ml-2 h-4 w-4 shrink-0 text-primary" />
    ) : (
      <ArrowDown className="ml-2 h-4 w-4 shrink-0 text-primary" />
    );
  };

  const meta = response?.meta;
  const rows = response?.data;

  const deleteMutation = useMutation({
    mutationFn: itemsService.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['listaItems'] });
      setOpenAlert(false);
      setDeleteError(null);
      toast.success('Item removido com sucesso!');
    },
    onError: (error: Error) => {
      setDeleteError(error.message);
    },
  });

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
        <Button
          onClick={() => {
            setSelected(null);
            setOpenDialog(true);
          }}
        >
          <Plus className="h-4 w-4" /> Novo item
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
                  onClick={() => changeSort('code')}
                >
                  Código
                  {renderSortIcon('code')}
                </Button>
              </TableHead>
              <TableHead>SKU</TableHead>
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
              <TableHead>Medida</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows?.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.code}</TableCell>
                <TableCell>{item.sku || '—'}</TableCell>
                <TableCell>{item.name}</TableCell>
                <TableCell>{catalogItemTypeLabels[item.type]}</TableCell>
                <TableCell>{item.measureAbbreviation}</TableCell>
                <TableCell>{item.isActive ? 'Ativo' : 'Inativo'}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label="Ações">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => {
                          setSelected(item);
                          setOpenDialog(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" /> Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-red-600"
                        onClick={() => {
                          setSelected(item);
                          setDeleteError(null);
                          setOpenAlert(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4" /> Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
            {rows && rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-4 text-center text-zinc-500">
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
              onClick={() => setPage((old) => Math.max(old - 1, 1))}
              disabled={page === 1}
              className="gap-1"
            >
              <ChevronLeft className="h-4 w-4" /> Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((old) => (page < meta.totalPages ? old + 1 : old))}
              disabled={page === meta.totalPages}
              className="gap-1"
            >
              Próximo <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}

      <Dialog
        open={openDialog}
        onOpenChange={(open) => {
          setOpenDialog(open);
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{selected ? 'Editar item' : 'Novo item'}</DialogTitle>
          </DialogHeader>
          <FormItem
            key={selected?.id ?? 'new'}
            itemToUpdate={selected}
            onSuccess={() => setOpenDialog(false)}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={openAlert} onOpenChange={setOpenAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir item</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteError ??
                `Deseja excluir ${selected?.name ?? 'este item'}? Essa ação não pode ser desfeita.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteMutation.isPending || !!deleteError}
              onClick={(event) => {
                event.preventDefault();
                if (selected) deleteMutation.mutate(selected.id);
              }}
            >
              {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
