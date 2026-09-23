import { formatCurrency, formatRawDate } from '@erp-360/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownLeft, Plus } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { financialService } from '../../../services/financials';
import { PayModal } from '../Payables/PayModal';
import { ReceivableForm } from './ReceivableForm';

export function ReceivableList() {
  const [openReceive, setOpenReceive] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<any | null>(null);
  const [openInsertReceivable, setOpenInsertReceivable] = useState(false);
  const { data: accounts, isLoading } = useQuery({
    queryKey: ['financial', 'receivable'],
    queryFn: () => financialService.list('receivable'),
  });

  const handleReceive = (account: any) => {
    setSelectedAccount(account);
    setOpenReceive(true);
  };

  if (isLoading)
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
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Lançar Conta a Receber</DialogTitle>
            </DialogHeader>
            <ReceivableForm onSuccess={() => setOpenInsertReceivable(false)} />
          </DialogContent>
        </Dialog>
      </div>
      <div className="rounded-md border border-zinc-200 bg-white shadow-2xs">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Descrição</TableHead>
              <TableHead>Nº Fatura</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Recebido</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts?.map((acc) => (
              <TableRow key={acc.id}>
                <TableCell className="font-medium">{acc.description}</TableCell>
                <TableCell>{acc.document || '-'}</TableCell>
                <TableCell>{formatRawDate(acc.dueDate)}</TableCell>
                <TableCell className="text-emerald-600">
                  {formatCurrency(acc.amount)}
                </TableCell>
                <TableCell>
                  {acc.amountPaid ? formatCurrency(acc.amountPaid) : '-'}
                </TableCell>
                <TableCell>
                  <span
                    className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                      acc.status === 'pago'
                        ? 'bg-emerald-50 text-emerald-600'
                        : 'bg-amber-50 text-amber-600'
                    }`}
                  >
                    {acc.status === 'pago' ? 'recebido' : acc.status}
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
            ))}
          </TableBody>
        </Table>

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
    </div>
  );
}
