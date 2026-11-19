import {
  formatCurrencyInput,
  maskCurrencyInput,
  parseCurrencyToCents,
} from '@erp-360/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { FloatingInput } from '@/components/ui/FloatingField';
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
      className="max-w-lg space-y-4 rounded-lg border bg-white p-6"
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
        <h3 className="text-lg font-bold text-[#172337]">Financeiro</h3>
        <p className="mt-1 text-sm text-[#64748b]">
          Multa e juros usados na baixa de contas a receber. 100 basis points = 1,00%.
        </p>
      </div>
      <FloatingInput
        id="lateFeeBps"
        label="Multa por atraso (bps)"
        type="number"
        min={0}
        value={lateFeeBps}
        onChange={(event) => setLateFeeBps(event.target.value)}
        required
      />
      <FloatingInput
        id="dailyInterestBps"
        label="Juros ao dia (bps)"
        type="number"
        min={0}
        value={dailyInterestBps}
        onChange={(event) => setDailyInterestBps(event.target.value)}
        required
      />
      <FloatingInput
        id="graceDays"
        label="Carência (dias)"
        type="number"
        min={0}
        value={graceDays}
        onChange={(event) => setGraceDays(event.target.value)}
        required
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <FloatingInput
          id="cashOpeningOn"
          label="Data do saldo inicial do caixa"
          type="date"
          value={cashOpeningOn}
          onChange={(event) => setCashOpeningOn(event.target.value)}
        />
        <FloatingInput
          id="cashOpeningAmount"
          label="Saldo inicial do caixa (R$)"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          pinned
          placeholder="0,00"
          value={cashOpeningAmountStr}
          onChange={(event) =>
            setCashOpeningAmountStr(maskCurrencyInput(event.target.value))
          }
        />
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>
    </form>
  );
}
