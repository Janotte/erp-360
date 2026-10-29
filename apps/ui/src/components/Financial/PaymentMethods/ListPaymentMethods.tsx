import { paymentReceiptKindLabels } from '@erp-360/shared';
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
import { financialService } from '@/services/financials';
import {
  type PaymentMethod,
  type PaymentMethodChannel,
  type PaymentMethodSortField,
  paymentMethodsService,
} from '@/services/paymentMethods';

import { FormPaymentMethod } from './FormPaymentMethod';

const selectClassName =
  'flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

const channelLabels: Record<PaymentMethodChannel, string> = {
  quote: 'Orçamento',
  sale: 'Venda',
  pos: 'PDV',
  serviceOrder: 'OS',
};

function channelsOf(method: PaymentMethod) {
  const labels = [
    method.useInQuote ? channelLabels.quote : null,
    method.useInSale ? channelLabels.sale : null,
    method.useInPos ? channelLabels.pos : null,
    method.useInServiceOrder ? channelLabels.serviceOrder : null,
  ].filter((label): label is string => Boolean(label));
  return labels.join(', ');
}

function termsOf(method: PaymentMethod) {
  return method.terms.map((term) => `${term.installmentCount}x`).join(', ');
}

export function ListPaymentMethods() {
  const queryClient = useQueryClient();
  const [openDialog, setOpenDialog] = useState(false);
  const [openAlert, setOpenAlert] = useState(false);
  const [selected, setSelected] = useState<PaymentMethod | null>(null);
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sortField, setSortField] = useState<PaymentMethodSortField>('sortOrder');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [activeFilter, setActiveFilter] = useState<'' | 'true' | 'false'>('');
  const [channel, setChannel] = useState<'' | PaymentMethodChannel>('');

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

  const { data: response, isLoading, isError, error } = useQuery({
    queryKey: ['payment-methods', { page, search, sortField, sortOrder, activeFilter, channel }],
    placeholderData: keepPreviousData,
    queryFn: () =>
      paymentMethodsService.list({
        page,
        limit: 10,
        sortField,
        sortOrder,
        search: search || undefined,
        isActive: activeFilter === '' ? undefined : activeFilter === 'true',
        channel: channel || undefined,
      }),
  });

  const { data: means = [] } = useQuery({
    queryKey: ['financial', 'means-of-payment'],
    queryFn: () => financialService.listMeansOfPayment(),
  });

  const changeSort = (field: PaymentMethodSortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
    setPage(1);
  };

  const renderSortIcon = (field: PaymentMethodSortField) => {
    if (sortField !== field) return <ArrowUpDown className="ml-2 h-4 w-4 shrink-0" />;
    return sortOrder === 'asc' ? (
      <ArrowUp className="ml-2 h-4 w-4 shrink-0 text-primary" />
    ) : (
      <ArrowDown className="ml-2 h-4 w-4 shrink-0 text-primary" />
    );
  };

  const activeMutation = useMutation({
    mutationFn: (method: PaymentMethod) =>
      paymentMethodsService.setActive(method.id, !method.isActive),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['payment-methods'] });
      queryClient.invalidateQueries({ queryKey: ['payment-method', saved.id] });
      setOpenAlert(false);
      toast.success(saved.isActive ? 'Forma ativada.' : 'Forma desativada.');
    },
    onError: (failure: Error) => {
      toast.error(failure.message);
      setOpenAlert(false);
    },
  });

  const meta = response?.meta;
  const methods = response?.data;
  const meanLabel = (id: string) => means.find((item) => item.id === id)?.label ?? '—';

  if (isLoading && !response) return <p>Carregando registros...</p>;
  if (isError && !response) {
    return <p>{error instanceof Error ? error.message : 'Falha ao carregar as formas.'}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 bg-white p-4 rounded-lg border border-zinc-200 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex w-full flex-col gap-3 sm:flex-row">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-400" />
            <Input
              placeholder="Buscar por código ou nome..."
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              className="pl-9"
            />
          </div>
          <select
            aria-label="Situação"
            value={activeFilter}
            onChange={(event) => {
              setActiveFilter(event.target.value as '' | 'true' | 'false');
              setPage(1);
            }}
            className={selectClassName}
          >
            <option value="">Todas</option>
            <option value="true">Ativas</option>
            <option value="false">Inativas</option>
          </select>
          <select
            aria-label="Canal"
            value={channel}
            onChange={(event) => {
              setChannel(event.target.value as '' | PaymentMethodChannel);
              setPage(1);
            }}
            className={selectClassName}
          >
            <option value="">Todos os canais</option>
            <option value="quote">Orçamento</option>
            <option value="sale">Venda</option>
            <option value="pos">PDV</option>
            <option value="serviceOrder">Ordem de serviço</option>
          </select>
        </div>
        <Button
          onClick={() => {
            setSelected(null);
            setOpenDialog(true);
          }}
        >
          <Plus className="h-4 w-4" /> Nova forma
        </Button>
      </div>

      <div className="rounded-md border border-zinc-200 bg-white shadow-2xs">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead
                onClick={() => changeSort('sortOrder')}
                className="cursor-pointer select-none hover:bg-zinc-50"
              >
                <div className="flex items-center">Ordem {renderSortIcon('sortOrder')}</div>
              </TableHead>
              <TableHead
                onClick={() => changeSort('code')}
                className="cursor-pointer select-none hover:bg-zinc-50"
              >
                <div className="flex items-center">Código {renderSortIcon('code')}</div>
              </TableHead>
              <TableHead
                onClick={() => changeSort('name')}
                className="cursor-pointer select-none hover:bg-zinc-50"
              >
                <div className="flex items-center">Nome {renderSortIcon('name')}</div>
              </TableHead>
              <TableHead>Meio</TableHead>
              <TableHead>Recebimento</TableHead>
              <TableHead>Condições</TableHead>
              <TableHead>Uso</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="py-4 text-center">
                  Carregando dados...
                </TableCell>
              </TableRow>
            ) : methods?.length ? (
              methods.map((method) => (
                <TableRow key={method.id}>
                  <TableCell>{method.sortOrder}</TableCell>
                  <TableCell className="font-medium">{method.code}</TableCell>
                  <TableCell>{method.name}</TableCell>
                  <TableCell className="max-w-48 truncate" title={meanLabel(method.meansOfPaymentId)}>
                    {meanLabel(method.meansOfPaymentId)}
                  </TableCell>
                  <TableCell>{paymentReceiptKindLabels[method.receiptKind]}</TableCell>
                  <TableCell>{termsOf(method)}</TableCell>
                  <TableCell>{channelsOf(method)}</TableCell>
                  <TableCell>{method.isActive ? 'Ativa' : 'Inativa'}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Ações de ${method.name}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            setSelected(method);
                            setOpenDialog(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setSelected(method);
                            setOpenAlert(true);
                          }}
                        >
                          {method.isActive ? 'Desativar' : 'Ativar'}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={9} className="py-4 text-center text-zinc-500">
                  Nenhuma forma de pagamento encontrada.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-3">
          <div className="text-sm text-zinc-500">
            Mostrando página <strong className="text-zinc-900">{meta.page}</strong> de{' '}
            <strong className="text-zinc-900">{meta.totalPages}</strong> ({meta.total} registros
            no total)
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
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {selected ? 'Editar forma de pagamento' : 'Nova forma de pagamento'}
            </DialogTitle>
          </DialogHeader>
          <FormPaymentMethod
            key={selected?.id ?? 'new'}
            methodToUpdate={selected}
            onSuccess={() => setOpenDialog(false)}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={openAlert} onOpenChange={setOpenAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {selected?.isActive ? 'Desativar forma' : 'Ativar forma'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {selected?.isActive
                ? `${selected.name} deixa de aparecer nos canais de uso.`
                : `${selected?.name ?? 'Esta forma'} volta a passar pelas regras do meio antes de ficar ativa.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={activeMutation.isPending || !selected}
              onClick={(event) => {
                event.preventDefault();
                if (selected) activeMutation.mutate(selected);
              }}
            >
              {activeMutation.isPending
                ? 'Salvando...'
                : selected?.isActive
                  ? 'Desativar'
                  : 'Ativar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
