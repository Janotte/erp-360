import { formatCurrency, formatRawDate } from '@erp-360/shared';
import { useQuery } from '@tanstack/react-query';

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
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['treasury', 'cash-entries'],
    queryFn: treasuryService.cashEntries,
  });

  const currentBalance = entries[0]?.balance ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-zinc-900">Livro caixa</h3>
          <p className="text-sm text-zinc-500">Entradas, saídas e saldo em dinheiro.</p>
        </div>
        <div className="rounded-md border bg-white px-4 py-2 text-right">
          <p className="text-xs text-zinc-500">Saldo em dinheiro</p>
          <p className="text-lg font-semibold tabular-nums">{formatCurrency(currentBalance)}</p>
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
    </div>
  );
}
