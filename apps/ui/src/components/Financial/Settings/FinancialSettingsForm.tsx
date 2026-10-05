import {
  formatCurrencyInput,
  maskCurrencyInput,
  parseCurrencyToCents,
} from '@erp-360/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { treasuryService } from '@/services/treasury';

export function FinancialSettingsForm() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['treasury', 'settings'],
    queryFn: treasuryService.settings,
  });
  const [lateFeeBps, setLateFeeBps] = useState('200');
  const [dailyInterestBps, setDailyInterestBps] = useState('3');
  const [graceDays, setGraceDays] = useState('0');
  const [cashOpeningOn, setCashOpeningOn] = useState('');
  const [cashOpeningAmountStr, setCashOpeningAmountStr] = useState('');

  useEffect(() => {
    if (!data) return;
    setLateFeeBps(String(data.lateFeeBps));
    setDailyInterestBps(String(data.dailyInterestBps));
    setGraceDays(String(data.graceDays));
    setCashOpeningOn(data.cashOpeningOn ?? '');
    setCashOpeningAmountStr(
      data.cashOpeningAmount ? formatCurrencyInput(data.cashOpeningAmount) : '',
    );
  }, [data]);

  const mutation = useMutation({
    mutationFn: () =>
      treasuryService.saveSettings({
        lateFeeBps: Number(lateFeeBps),
        dailyInterestBps: Number(dailyInterestBps),
        graceDays: Number(graceDays),
        cashPlanAccountId: data?.cashPlanAccountId,
        discountObtainedPlanAccountId: data?.discountObtainedPlanAccountId,
        discountGrantedPlanAccountId: data?.discountGrantedPlanAccountId,
        lateFeePaidPlanAccountId: data?.lateFeePaidPlanAccountId,
        lateFeeReceivedPlanAccountId: data?.lateFeeReceivedPlanAccountId,
        cashOpeningOn: cashOpeningOn || null,
        cashOpeningAmount: parseCurrencyToCents(cashOpeningAmountStr),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['treasury'] });
      toast.success('Configurações financeiras salvas.');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <form
      className="max-w-lg space-y-4 rounded-lg border bg-white p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (parseCurrencyToCents(cashOpeningAmountStr) !== 0 && !cashOpeningOn) {
          toast.error('Informe a data do saldo inicial do caixa.');
          return;
        }
        mutation.mutate();
      }}
    >
      <div>
        <h3 className="text-lg font-bold text-zinc-900">Financeiro</h3>
        <p className="text-sm text-zinc-500">
          Multa e juros usados na baixa de contas a receber. 100 basis points = 1,00%.
        </p>
      </div>
      <div className="space-y-1">
        <Label htmlFor="lateFeeBps">Multa por atraso (bps)</Label>
        <Input
          id="lateFeeBps"
          type="number"
          min={0}
          value={lateFeeBps}
          onChange={(e) => setLateFeeBps(e.target.value)}
          required
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="dailyInterestBps">Juros ao dia (bps)</Label>
        <Input
          id="dailyInterestBps"
          type="number"
          min={0}
          value={dailyInterestBps}
          onChange={(e) => setDailyInterestBps(e.target.value)}
          required
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="graceDays">Carência (dias)</Label>
        <Input
          id="graceDays"
          type="number"
          min={0}
          value={graceDays}
          onChange={(e) => setGraceDays(e.target.value)}
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="cashOpeningOn">Data do saldo inicial do caixa</Label>
          <Input
            id="cashOpeningOn"
            type="date"
            value={cashOpeningOn}
            onChange={(e) => setCashOpeningOn(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cashOpeningAmount">Saldo inicial do caixa (R$)</Label>
          <Input
            id="cashOpeningAmount"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="0,00"
            value={cashOpeningAmountStr}
            onChange={(e) => setCashOpeningAmountStr(maskCurrencyInput(e.target.value))}
          />
        </div>
      </div>
      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? 'Salvando...' : 'Salvar'}
      </Button>
    </form>
  );
}
