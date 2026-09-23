import { formatCurrency, formatRawDate } from '@erp-360/shared';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Plus } from 'lucide-react';
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
import { type FinancialAccount, financialService } from '@/services/financials';

import { PayableForm } from './PayableForm';
import { PayModal } from './PayModal';

export function PayableList() {
  const [openPay, setOpenPay] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<FinancialAccount | null>(null);
  const [openInsertPayable, setOpenInsertPayable] = useState(false);

  const { data: accounts, isLoading } = useQuery({
    queryKey: ['financial', 'payable'],
    queryFn: () => financialService.list('payable'),
  });

  const handlePay = (account: FinancialAccount) => {
    setSelectedAccount(account);
    setOpenPay(true);
  };

  if (isLoading)
    return <p className="text-sm text-zinc-500">Carregando contas a pagar...</p>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-bold text-zinc-900">Contas a Pagar</h3>
          <p className="text-sm text-zinc-500">Gerencie contas a pagar.</p>
        </div>
        <Dialog open={openInsertPayable} onOpenChange={setOpenInsertPayable}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" /> Novo Pagar
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Lançar Conta a Pagar</DialogTitle>
            </DialogHeader>
            <PayableForm onSuccess={() => setOpenInsertPayable(false)} />
          </DialogContent>
        </Dialog>
      </div>
      <div className="rounded-md border border-zinc-200 bg-white shadow-2xs">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Documento</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Pago</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts?.map((acc) => (
              <TableRow key={acc.id}>
                <TableCell>{acc.document || '-'}</TableCell>
                <TableCell className="font-medium">{acc.description}</TableCell>
                <TableCell>{formatRawDate(acc.dueDate)}</TableCell>
                <TableCell className="text-red-600">
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
                    {acc.status}
                  </span>
                </TableCell>
                <TableCell>
                  {acc.status === 'pendente' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePay(acc)}
                      className="h-7 text-xs border-emerald-200 text-emerald-600 hover:bg-emerald-50 gap-1"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> Pagar
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <Dialog open={openPay} onOpenChange={setOpenPay}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Liquidar Conta a Pagar</DialogTitle>
            </DialogHeader>
            {selectedAccount && (
              <PayModal
                tipo="payable"
                account={selectedAccount}
                onSuccess={() => setOpenPay(false)}
              />
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
