import { formatCurrency, formatRawDate } from '@erp-360/shared';
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
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Eye,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  type FinancialAccount,
  financialService,
  type FinancialSortField,
} from '@/services/financials';

import { PayableForm } from './PayableForm';
import { PayModal } from './PayModal';

type ConfirmAction = 'delete' | 'reverse' | null;

export function PayableList() {
  const queryClient = useQueryClient();
  const [openPay, setOpenPay] = useState(false);
  const [openForm, setOpenForm] = useState(false);
  const [formReadOnly, setFormReadOnly] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<FinancialAccount | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('todos');
  const [dueFrom, setDueFrom] = useState('');
  const [dueTo, setDueTo] = useState('');
  const [page, setPage] = useState(1);
  const [sortField, setSortField] = useState<FinancialSortField>('dueOn');
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
    queryKey: [
      'financial',
      'payable',
      { page, status, search, dueFrom, dueTo, sortField, sortOrder },
    ],
    placeholderData: keepPreviousData,
    queryFn: () =>
      financialService.list('payable', {
        page,
        limit: 10,
        sortField,
        sortOrder,
        status: status === 'todos' ? undefined : status,
        search: search || undefined,
        dueFrom: dueFrom || undefined,
        dueTo: dueTo || undefined,
      }),
  });

  const changeSort = (field: FinancialSortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
    setPage(1);
  };

  const renderSortIcon = (field: FinancialSortField) => {
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
    mutationFn: (id: string) => financialService.delete('payable', id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial', 'payable'] });
      setConfirmAction(null);
      setActionError(null);
      toast.success('Conta a pagar excluída com sucesso!');
    },
    onError: (error: Error) => setActionError(error.message),
  });

  const reverseMutation = useMutation({
    mutationFn: (id: string) => financialService.reverse('payable', id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial', 'payable'] });
      setConfirmAction(null);
      setActionError(null);
      toast.success('Pagamento estornado com sucesso!');
    },
    onError: (error: Error) => setActionError(error.message),
  });

  const openCreate = () => {
    setSelectedAccount(null);
    setFormReadOnly(false);
    setOpenForm(true);
  };

  const openEdit = (account: FinancialAccount) => {
    setSelectedAccount(account);
    setFormReadOnly(false);
    setOpenForm(true);
  };

  const openView = (account: FinancialAccount) => {
    setSelectedAccount(account);
    setFormReadOnly(true);
    setOpenForm(true);
  };

  const handlePay = (account: FinancialAccount) => {
    setSelectedAccount(account);
    setOpenPay(true);
  };

  const openConfirm = (account: FinancialAccount, action: ConfirmAction) => {
    setSelectedAccount(account);
    setActionError(null);
    setConfirmAction(action);
  };

  if (isLoading && !response)
    return <p className="text-sm text-zinc-500">Carregando contas a pagar...</p>;

  const confirmPending =
    deleteMutation.isPending || reverseMutation.isPending;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-bold text-zinc-900">Contas a Pagar</h3>
          <p className="text-sm text-zinc-500">Gerencie contas a pagar.</p>
        </div>
        <Button size="sm" className="gap-2" onClick={openCreate}>
          <Plus className="h-4 w-4" /> Novo Pagar
        </Button>
      </div>

      <div className="flex flex-col gap-3 bg-white p-4 rounded-lg border border-zinc-200">
        <div className="flex flex-col sm:flex-row gap-3 items-center">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-400" />
            <Input
              placeholder="Buscar por descrição ou documento..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="pago">Pago</SelectItem>
              <SelectItem value="cancelado">Cancelado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 items-center">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-sm text-zinc-500 shrink-0">Venc. de</span>
            <Input
              type="date"
              value={dueFrom}
              onChange={(e) => {
                setDueFrom(e.target.value);
                setPage(1);
              }}
              className="w-full sm:w-40"
            />
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-sm text-zinc-500 shrink-0">até</span>
            <Input
              type="date"
              value={dueTo}
              onChange={(e) => {
                setDueTo(e.target.value);
                setPage(1);
              }}
              className="w-full sm:w-40"
            />
          </div>
        </div>
      </div>

      <div className="rounded-md border border-zinc-200 bg-white shadow-2xs">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Documento</TableHead>
              <TableHead
                onClick={() => changeSort('description')}
                className="cursor-pointer select-none hover:bg-zinc-50"
              >
                <div className="flex items-center">
                  Descrição {renderSortIcon('description')}
                </div>
              </TableHead>
              <TableHead
                onClick={() => changeSort('dueOn')}
                className="cursor-pointer select-none hover:bg-zinc-50"
              >
                <div className="flex items-center">
                  Vencimento {renderSortIcon('dueOn')}
                </div>
              </TableHead>
              <TableHead
                onClick={() => changeSort('installmentAmount')}
                className="cursor-pointer select-none hover:bg-zinc-50 text-right"
              >
                <div className="flex items-center justify-end">
                  Valor {renderSortIcon('installmentAmount')}
                </div>
              </TableHead>
              <TableHead className="text-right">Pago</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-4">
                  Carregando dados...
                </TableCell>
              </TableRow>
            ) : accounts?.length ? (
              accounts.map((acc) => (
                <TableRow key={acc.id}>
                  <TableCell>{acc.documentNumber || '-'}</TableCell>
                  <TableCell className="font-medium">{acc.description}</TableCell>
                  <TableCell>{formatRawDate(acc.dueOn)}</TableCell>
                  <TableCell className="text-right tabular-nums text-red-600">
                    {formatCurrency(acc.installmentAmount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {acc.settledAmount ? formatCurrency(acc.settledAmount) : '-'}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                        acc.status === 'pago'
                          ? 'bg-emerald-50 text-emerald-600'
                          : 'bg-amber-50 text-amber-600'
                      }`}
                    >
                      {acc.status}
                    </span>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Ações de ${acc.description}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {acc.status === 'pendente' && (
                          <>
                            <DropdownMenuItem onClick={() => openEdit(acc)}>
                              <Pencil className="h-4 w-4" /> Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handlePay(acc)}>
                              <CheckCircle2 className="h-4 w-4" /> Pagar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-red-600 focus:text-red-600"
                              onClick={() => openConfirm(acc, 'delete')}
                            >
                              <Trash2 className="h-4 w-4" /> Excluir
                            </DropdownMenuItem>
                          </>
                        )}
                        {(acc.status === 'pago' || acc.status === 'cancelado') && (
                          <>
                            <DropdownMenuItem onClick={() => openView(acc)}>
                              <Eye className="h-4 w-4" /> Visualizar
                            </DropdownMenuItem>
                            {acc.status === 'pago' && (
                              <DropdownMenuItem
                                onClick={() => openConfirm(acc, 'reverse')}
                              >
                                <RotateCcw className="h-4 w-4" /> Estornar
                              </DropdownMenuItem>
                            )}
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-4 text-zinc-500">
                  Nenhuma conta a pagar encontrada.
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
        open={openForm}
        onOpenChange={(open) => {
          setOpenForm(open);
          if (!open) {
            setSelectedAccount(null);
            setFormReadOnly(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {formReadOnly
                ? 'Visualizar Conta a Pagar'
                : selectedAccount
                  ? 'Editar Conta a Pagar'
                  : 'Lançar Conta a Pagar'}
            </DialogTitle>
          </DialogHeader>
          <PayableForm
            key={`${selectedAccount?.id ?? 'new'}-${formReadOnly ? 'view' : 'edit'}`}
            accountToUpdate={selectedAccount}
            readOnly={formReadOnly}
            onSuccess={() => {
              setOpenForm(false);
              setSelectedAccount(null);
              setFormReadOnly(false);
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={openPay}
        onOpenChange={(open) => {
          setOpenPay(open);
          if (!open) setSelectedAccount(null);
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Liquidar Conta a Pagar</DialogTitle>
          </DialogHeader>
          {selectedAccount && (
            <PayModal
              tipo="payable"
              account={selectedAccount}
              onSuccess={() => {
                setOpenPay(false);
                setSelectedAccount(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirmAction !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmAction(null);
            setActionError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === 'delete' ? 'Excluir conta a pagar' : 'Estornar pagamento'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {actionError ??
                (confirmAction === 'delete'
                  ? `Deseja excluir ${selectedAccount?.description ?? 'esta conta'}? Essa ação não pode ser desfeita.`
                  : `Deseja estornar o pagamento de ${selectedAccount?.description ?? 'esta conta'}? O título voltará para pendente.`)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className={
                confirmAction === 'delete'
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-amber-600 hover:bg-amber-700'
              }
              disabled={confirmPending || !!actionError}
              onClick={(event) => {
                event.preventDefault();
                if (!selectedAccount) return;
                if (confirmAction === 'delete') {
                  deleteMutation.mutate(selectedAccount.id);
                } else if (confirmAction === 'reverse') {
                  reverseMutation.mutate(selectedAccount.id);
                }
              }}
            >
              {confirmPending
                ? 'Processando...'
                : confirmAction === 'delete'
                  ? 'Excluir'
                  : 'Estornar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
