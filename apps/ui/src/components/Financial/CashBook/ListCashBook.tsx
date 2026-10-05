import {
  formatCurrency,
  formatCurrencyInput,
  formatRawDate,
  maskCurrencyInput,
  parseCurrencyToCents,
} from '@erp-360/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { treasuryService } from '@/services/treasury';

export function ListCashBook() {
  const queryClient = useQueryClient();
  const [openOpening, setOpenOpening] = useState(false);
  const [openingOn, setOpeningOn] = useState('');
  const [openingAmountStr, setOpeningAmountStr] = useState('');

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['treasury', 'cash-entries'],
    queryFn: treasuryService.cashEntries,
  });

  const { data: settings } = useQuery({
    queryKey: ['treasury', 'settings'],
    queryFn: treasuryService.settings,
  });

  useEffect(() => {
    if (!openOpening || !settings) return;
    setOpeningOn(settings.cashOpeningOn ?? '');
    setOpeningAmountStr(
      settings.cashOpeningAmount ? formatCurrencyInput(settings.cashOpeningAmount) : '',
    );
  }, [openOpening, settings]);

  const saveOpening = useMutation({
    mutationFn: () =>
      treasuryService.saveCashOpening({
        cashOpeningOn: openingOn || null,
        cashOpeningAmount: parseCurrencyToCents(openingAmountStr),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['treasury'] });
      setOpenOpening(false);
      toast.success('Saldo inicial do caixa salvo.');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const currentBalance = entries[0]?.balance ?? settings?.cashOpeningAmount ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-zinc-900">Livro caixa</h3>
          <p className="text-sm text-zinc-500">Entradas, saídas e saldo em dinheiro.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setOpenOpening(true)}>
            Saldo inicial
          </Button>
          <div className="rounded-md border bg-white px-4 py-2 text-right">
            <p className="text-xs text-zinc-500">Saldo em dinheiro</p>
            <p className="text-lg font-semibold tabular-nums">{formatCurrency(currentBalance)}</p>
          </div>
        </div>
      </div>

      <div className="rounded-md border border-zinc-200 bg-white shadow-2xs">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Histórico</TableHead>
              <TableHead className="text-right">Entrada</TableHead>
              <TableHead className="text-right">Saída</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-4">
                  Carregando livro caixa...
                </TableCell>
              </TableRow>
            ) : entries.length ? (
              entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>{formatRawDate(entry.occurredOn)}</TableCell>
                  <TableCell>{entry.description}</TableCell>
                  <TableCell className="text-right tabular-nums text-emerald-600">
                    {entry.inflowAmount ? formatCurrency(entry.inflowAmount) : '-'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-red-600">
                    {entry.outflowAmount ? formatCurrency(entry.outflowAmount) : '-'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(entry.balance)}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-4 text-zinc-500">
                  Nenhum lançamento em caixa.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={openOpening} onOpenChange={setOpenOpening}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Saldo inicial do caixa</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (parseCurrencyToCents(openingAmountStr) !== 0 && !openingOn) {
                toast.error('Informe a data do saldo inicial.');
                return;
              }
              saveOpening.mutate();
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="cashOpeningOn">Data do saldo inicial</Label>
              <Input
                id="cashOpeningOn"
                type="date"
                value={openingOn}
                onChange={(e) => setOpeningOn(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cashOpeningAmount">Valor (R$)</Label>
              <Input
                id="cashOpeningAmount"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="0,00"
                value={openingAmountStr}
                onChange={(e) => setOpeningAmountStr(maskCurrencyInput(e.target.value))}
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={saveOpening.isPending}>
                {saveOpening.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
