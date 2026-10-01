import { formatCurrency, formatRawDate } from '@erp-360/shared';
import {
  keepPreviousData,
  useQuery,
} from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowDownLeft,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
  type FinancialSortField,
  financialService,
} from '@/services/financials';

import { PayModal } from '../Payables/PayModal';
import { ReceivableForm } from './ReceivableForm';

export function ReceivableList() {
  const [openReceive, setOpenReceive] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<FinancialAccount | null>(null);
  const [openInsertReceivable, setOpenInsertReceivable] = useState(false);

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
      'receivable',
      { page, status, search, dueFrom, dueTo, sortField, sortOrder },
    ],
    placeholderData: keepPreviousData,
    queryFn: () =>
      financialService.list('receivable', {
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

  const handleReceive = (account: FinancialAccount) => {
    setSelectedAccount(account);
    setOpenReceive(true);
  };

  if (isLoading && !response)
    return <p className="text-sm text-zinc-500">Carregando contas a receber...</p>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-bold text-zinc-900">Contas a Receber</h3>
          <p className="text-sm text-zinc-500">Gerencie contas a receber.</p>
        </div>
        <Dialog open={openInsertReceivable} onOpenChange={setOpenInsertReceivable}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" /> Novo Receber
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Lançar Conta a Receber</DialogTitle>
            </DialogHeader>
            <ReceivableForm onSuccess={() => setOpenInsertReceivable(false)} />
          </DialogContent>
        </Dialog>
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
              <SelectItem value="recebido">Recebido</SelectItem>
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
              <TableHead
                onClick={() => changeSort('description')}
                className="cursor-pointer select-none hover:bg-zinc-50"
              >
                <div className="flex items-center">
                  Descrição {renderSortIcon('description')}
                </div>
              </TableHead>
              <TableHead>Nº Documento</TableHead>
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
                className="cursor-pointer select-none hover:bg-zinc-50"
              >
                <div className="flex items-center">
                  Valor {renderSortIcon('installmentAmount')}
                </div>
              </TableHead>
              <TableHead>Recebido</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[100px]" />
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
                  <TableCell className="font-medium">{acc.description}</TableCell>
                  <TableCell>{acc.documentNumber || '-'}</TableCell>
                  <TableCell>{formatRawDate(acc.dueOn)}</TableCell>
                  <TableCell className="text-emerald-600">
                    {formatCurrency(acc.installmentAmount)}
                  </TableCell>
                  <TableCell>
                    {acc.settledAmount ? formatCurrency(acc.settledAmount) : '-'}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                        acc.status === 'recebido'
                          ? 'bg-emerald-50 text-emerald-600'
                          : 'bg-amber-50 text-amber-600'
                      }`}
                    >
                      {acc.status}
                    </span>
                  </TableCell>
                  <TableCell>
                    {acc.status === 'pendente' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleReceive(acc)}
                        className="h-7 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50 gap-1"
                      >
                        <ArrowDownLeft className="h-3.5 w-3.5" /> Receber
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-4 text-zinc-500">
                  Nenhuma conta a receber encontrada.
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

      <Dialog open={openReceive} onOpenChange={setOpenReceive}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Receber Conta a Receber</DialogTitle>
          </DialogHeader>
          {selectedAccount && (
            <PayModal
              tipo="receivable"
              account={selectedAccount}
              onSuccess={() => setOpenReceive(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
