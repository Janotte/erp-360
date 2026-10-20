import { civilDate, maskCurrencyInput, parseCurrencyToCents } from '@erp-360/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { CatalogSearchSelect } from '@/components/ui/CatalogSearchSelect';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { financialService } from '@/services/financials';
import { treasuryService } from '@/services/treasury';

interface InvestmentEntryModalProps {
  bankAccountId: string;
  onSuccess: () => void;
}

export function InvestmentEntryModal({ bankAccountId, onSuccess }: InvestmentEntryModalProps) {
  const queryClient = useQueryClient();
  const [occurredOn, setOccurredOn] = useState(civilDate());
  const [description, setDescription] = useState('');
  const [direction, setDirection] = useState<'in' | 'out'>('in');
  const [amountStr, setAmountStr] = useState('');
  const [planAccountId, setPlanAccountId] = useState('');

  const { data: planAccounts = [], isLoading } = useQuery({
    queryKey: ['financial', 'plan-accounts', 'investment-entry'],
    queryFn: () => financialService.listPlanAccounts({ acceptsEntries: true, isTreasury: false }),
  });

  const mutation = useMutation({
    mutationFn: () =>
      treasuryService.createInvestmentEntry(bankAccountId, {
        occurredOn,
        description: description.trim(),
        direction,
        amount: parseCurrencyToCents(amountStr),
        planAccountId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['treasury'] });
      queryClient.invalidateQueries({ queryKey: ['listaPlanAccounts'] });
      toast.success('Lançamento registrado.');
      onSuccess();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <form
      className="space-y-3 pt-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!description.trim()) {
          toast.error('Informe o histórico.');
          return;
        }
        if (parseCurrencyToCents(amountStr) <= 0) {
          toast.error('Informe um valor maior que zero.');
          return;
        }
        if (!planAccountId) {
          toast.error('Selecione a conta do plano.');
          return;
        }
        mutation.mutate();
      }}
    >
      <p className="text-sm text-zinc-500">
        Entra só nesta conta de investimento. Não movimenta a conta corrente.
      </p>
      <div className="space-y-1">
        <Label htmlFor="entryOn">Data</Label>
        <Input
          id="entryOn"
          type="date"
          value={occurredOn}
          onChange={(event) => setOccurredOn(event.target.value)}
          required
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="entryDescription">Histórico</Label>
        <Input
          id="entryDescription"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={255}
          required
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="entryDirection">Movimento</Label>
        <select
          id="entryDirection"
          value={direction}
          onChange={(event) => setDirection(event.target.value as 'in' | 'out')}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
        >
          <option value="in">Entrada</option>
          <option value="out">Saída</option>
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="entryAmount">Valor (R$)</Label>
        <Input
          id="entryAmount"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="0,00"
          value={amountStr}
          onChange={(event) => setAmountStr(maskCurrencyInput(event.target.value))}
          required
        />
      </div>
      <div className="space-y-1">
        <Label>Conta do plano</Label>
        <CatalogSearchSelect
          value={planAccountId}
          onChange={setPlanAccountId}
          options={planAccounts}
          placeholder="Receita, despesa ou ativo"
          isLoading={isLoading}
          required
        />
      </div>
      <Button type="submit" className="w-full" disabled={mutation.isPending}>
        {mutation.isPending ? 'Registrando...' : 'Confirmar'}
      </Button>
    </form>
  );
}
