import { formatCurrency } from '@erp-360/shared';
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
import { type PlanAccount, planAccountsService } from '@/services/planAccounts';

import { FormPlanAccount } from './FormPlanAccount';

type SortField = 'accountCode' | 'name';

export function ListPlanAccounts() {
  const queryClient = useQueryClient();
  const [openDialog, setOpenDialog] = useState(false);
  const [openAlert, setOpenAlert] = useState(false);
  const [selected, setSelected] = useState<PlanAccount | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sortField, setSortField] = useState<SortField>('accountCode');
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
    queryKey: ['listaPlanAccounts', { page, search, sortField, sortOrder }],
    placeholderData: keepPreviousData,
    queryFn: () =>
      planAccountsService.list({
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
  const accounts = response?.data;

  const deleteMutation = useMutation({
    mutationFn: planAccountsService.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['listaPlanAccounts'] });
      queryClient.invalidateQueries({ queryKey: ['financial', 'plan-accounts'] });
      setOpenAlert(false);
      setDeleteError(null);
      toast.success('Plano de contas removido com sucesso!');
    },
    onError: (error: Error) => {
      setDeleteError(error.message);
    },
  });

  const openEdit = (account: PlanAccount) => {
    setSelected(account);
    setOpenDialog(true);
  };

  const openDelete = (account: PlanAccount) => {
    setSelected(account);
    setDeleteError(null);
    setOpenAlert(true);
  };

  if (isLoading && !response) return <p>Carregando registros...</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-white p-4 rounded-lg border border-zinc-200">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-400" />
          <Input
            placeholder="Buscar por código ou nome..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button
          onClick={() => {
            setSelected(null);
            setOpenDialog(true);
          }}
        >
          <Plus className="h-4 w-4" /> Novo Plano
        </Button>
      </div>

      <div className="rounded-md border border-zinc-200 bg-white shadow-2xs">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead
                onClick={() => changeSort('accountCode')}
                className="cursor-pointer select-none hover:bg-zinc-50"
              >
                <div className="flex items-center">
                  Código {renderSortIcon('accountCode')}
                </div>
              </TableHead>
              <TableHead
                onClick={() => changeSort('name')}
                className="cursor-pointer select-none hover:bg-zinc-50"
              >
                <div className="flex items-center">Nome {renderSortIcon('name')}</div>
              </TableHead>
              <TableHead>Descrição contábil</TableHead>
              <TableHead>Código contábil</TableHead>
              <TableHead>Saldo</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-4">
                  Carregando dados...
                </TableCell>
              </TableRow>
            ) : accounts?.length ? (
              accounts.map((account) => (
                <TableRow key={account.id}>
                  <TableCell className="font-medium">{account.accountCode}</TableCell>
                  <TableCell>{account.name}</TableCell>
                  <TableCell>{account.accountingDescription || '-'}</TableCell>
                  <TableCell>{account.accountingAccountCode || '-'}</TableCell>
                  <TableCell>
                    {account.balance != null ? formatCurrency(account.balance) : '-'}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Ações de ${account.name}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(account)}>
                          <Pencil className="h-4 w-4" /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-red-600 focus:text-red-600"
                          onClick={() => openDelete(account)}
                        >
                          <Trash2 className="h-4 w-4" /> Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-4 text-zinc-500">
                  Nenhum plano de contas encontrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between bg-white px-4 py-3 rounded-lg border border-zinc-200">
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
      )}

      <Dialog
        open={openDialog}
        onOpenChange={(open) => {
          setOpenDialog(open);
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {selected ? 'Editar Plano de Contas' : 'Novo Plano de Contas'}
            </DialogTitle>
          </DialogHeader>
          <FormPlanAccount
            key={selected?.id ?? 'new'}
            accountToUpdate={selected}
            onSuccess={() => setOpenDialog(false)}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={openAlert} onOpenChange={setOpenAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir plano de contas</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteError ??
                `Deseja excluir ${selected?.name ?? 'este plano de contas'}? Essa ação não pode ser desfeita.`}
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
