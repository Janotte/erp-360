import {
  formatCurrency,
  formatCurrencyInput,
  maskCurrencyInput,
  parseCurrencyToCents,
} from '@erp-360/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { type FinancialAccount, financialService } from '@/services/financials';

interface PayModalProps {
  tipo: 'payable' | 'receivable';
  account: FinancialAccount;
  onSuccess: () => void;
}

export function PayModal({ tipo, account, onSuccess }: PayModalProps) {
  const queryClient = useQueryClient();
  const [settledOn, setSettledOn] = useState(new Date().toISOString().split('T')[0]);
  const [valorPagoStr, setValorPagoStr] = useState(
    formatCurrencyInput(account.installmentAmount),
  );

  const mutation = useMutation({
    mutationFn: (data: { settledOn: string; settledAmount: number }) =>
      financialService.pay(tipo, account.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial', tipo] });
      toast.success('Baixa processada com sucesso!');
      onSuccess();
    },
    onError: (err: Error) => toast.error(`Erro: ${err.message}`),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const settledAmount = parseCurrencyToCents(valorPagoStr);
    if (settledAmount <= 0) return;
    mutation.mutate({ settledOn, settledAmount });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-4">
      <div className="bg-zinc-50 p-3 rounded-lg border text-sm space-y-1">
        <p className="text-zinc-500">
          Título: <strong className="text-zinc-900">{account.description}</strong>
        </p>
        <p className="text-zinc-500">
          Valor Original:{' '}
          <strong className="text-zinc-900">
            {formatCurrency(account.installmentAmount)}
          </strong>
        </p>
      </div>

      <div className="space-y-1">
        <Label htmlFor="settledOn">
          Data do {tipo === 'payable' ? 'Pagamento' : 'Recebimento'}
        </Label>
        <Input
          id="settledOn"
          type="date"
          value={settledOn}
          onChange={(e) => setSettledOn(e.target.value)}
          required
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="valorPago">
          Valor Efetivamente {tipo === 'payable' ? 'Pago' : 'Recebido'} (R$)
        </Label>
        <Input
          id="valorPago"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="0,00"
          value={valorPagoStr}
          onChange={(e) => setValorPagoStr(maskCurrencyInput(e.target.value))}
          required
        />
      </div>

      <Button
        type="submit"
        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
        disabled={mutation.isPending}
      >
        {mutation.isPending ? 'Processando Baixa...' : 'Confirmar Liquidação'}
      </Button>
    </form>
  );
}
