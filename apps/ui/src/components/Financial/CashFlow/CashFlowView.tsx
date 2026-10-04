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

export function CashFlowView() {
  const { data, isLoading } = useQuery({
    queryKey: ['treasury', 'cash-flow'],
    queryFn: treasuryService.cashFlow,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-zinc-900">Fluxo de caixa</h3>
          <p className="text-sm text-zinc-500">
            Projeção de 60 dias com títulos pendentes e saldo de tesouraria.
          </p>
        </div>
        <div className="rounded-md border bg-white px-4 py-2 text-right">
          <p className="text-xs text-zinc-500">Saldo inicial</p>
          <p className="text-lg font-semibold tabular-nums">
            {formatCurrency(data?.openingBalance ?? 0)}
          </p>
        </div>
      </div>

      <div className="rounded-md border border-zinc-200 bg-white shadow-2xs">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead className="text-right">Entradas previstas</TableHead>
              <TableHead className="text-right">Saídas previstas</TableHead>
              <TableHead className="text-right">Saldo projetado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-4">
                  Carregando fluxo de caixa...
                </TableCell>
              </TableRow>
            ) : data?.days.length ? (
              data.days.map((day) => (
                <TableRow key={day.date}>
                  <TableCell>{formatRawDate(day.date)}</TableCell>
                  <TableCell className="text-right tabular-nums text-emerald-600">
                    {day.inflows ? formatCurrency(day.inflows) : '-'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-red-600">
                    {day.outflows ? formatCurrency(day.outflows) : '-'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(day.balance)}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-4 text-zinc-500">
                  Sem dados para o período.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
