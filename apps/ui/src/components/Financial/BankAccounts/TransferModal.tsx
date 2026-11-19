import { civilDate, maskCurrencyInput, parseCurrencyToCents } from '@erp-360/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { FloatingInput, FloatingSelect } from '@/components/ui/FloatingField';
import { type BankAccount, treasuryService } from '@/services/treasury';

export type TransferMode = 'transfer' | 'apply' | 'redeem';

interface TransferModalProps {
  mode: TransferMode;
  accounts: BankAccount[];
  onSuccess: () => void;
}

const titles: Record<TransferMode, string> = {
  transfer: 'Transferir',
  apply: 'Aplicar',
  redeem: 'Resgatar',
};

function parseSide(value: string): {
  treasury: 'cash' | 'bank';
  bankAccountId: string | null;
} {
  if (value === 'cash') return { treasury: 'cash', bankAccountId: null };
  return { treasury: 'bank', bankAccountId: value };
}

export function TransferModal({ mode, accounts, onSuccess }: TransferModalProps) {
  const queryClient = useQueryClient();
  const today = civilDate();
  const operating = accounts.filter((item) => (item.kind ?? 'operating') === 'operating');
  const investments = accounts.filter((item) => item.kind === 'investment');

  const sourceOptions = useMemo(() => {
    const cash = [{ id: 'cash', label: 'Caixa' }];
    if (mode === 'redeem') {
      return investments.map((item) => ({ id: item.id, label: item.name }));
    }
    return [...cash, ...operating.map((item) => ({ id: item.id, label: item.name }))];
  }, [mode, investments, operating]);

  const destOptions = useMemo(() => {
    const cash = [{ id: 'cash', label: 'Caixa' }];
    if (mode === 'apply') {
      return investments.map((item) => ({ id: item.id, label: item.name }));
    }
    if (mode === 'redeem') {
      return [...cash, ...operating.map((item) => ({ id: item.id, label: item.name }))];
    }
    return [
      ...cash,
      ...accounts.map((item) => ({
        id: item.id,
        label: `${item.name}${item.kind === 'investment' ? ' (investimento)' : ''}`,
      })),
    ];
  }, [mode, investments, operating, accounts]);

  const [occurredOn, setOccurredOn] = useState(today);
  const [amountStr, setAmountStr] = useState('');
  const [fromSide, setFromSide] = useState(sourceOptions[0]?.id ?? 'cash');
  const [toSide, setToSide] = useState(destOptions[0]?.id ?? '');

  const mutation = useMutation({
    mutationFn: () => {
      const from = parseSide(fromSide);
      const to = parseSide(toSide);
      return treasuryService.transfer({
        occurredOn,
        amount: parseCurrencyToCents(amountStr),
        fromTreasury: from.treasury,
        fromBankAccountId: from.bankAccountId,
        toTreasury: to.treasury,
        toBankAccountId: to.bankAccountId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['treasury'] });
      toast.success(
        mode === 'apply'
          ? 'Aplicação registrada.'
          : mode === 'redeem'
            ? 'Resgate registrado.'
            : 'Transferência registrada.',
      );
      onSuccess();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <form
      className="space-y-3 pt-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (parseCurrencyToCents(amountStr) <= 0) {
          toast.error('Informe um valor maior que zero.');
          return;
        }
        if (!fromSide || !toSide) {
          toast.error('Selecione origem e destino.');
          return;
        }
        mutation.mutate();
      }}
    >
      <p className="text-sm text-[#64748b]">{titles[mode]} entre tesourarias.</p>
      <FloatingInput
        id="transferOn"
        label="Data"
        type="date"
        value={occurredOn}
        onChange={(event) => setOccurredOn(event.target.value)}
        required
      />
      <FloatingSelect
        id="transferFrom"
        label="Origem"
        value={fromSide}
        pinned
        onChange={(event) => setFromSide(event.target.value)}
        required
      >
        {sourceOptions.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </FloatingSelect>
      <FloatingSelect
        id="transferTo"
        label="Destino"
        value={toSide}
        pinned
        onChange={(event) => setToSide(event.target.value)}
        required
      >
        {destOptions.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </FloatingSelect>
      <FloatingInput
        id="transferAmount"
        label="Valor (R$)"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="0,00"
        pinned
        value={amountStr}
        onChange={(event) => setAmountStr(maskCurrencyInput(event.target.value))}
        required
      />
      <div className="flex justify-end">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Registrando...' : 'Confirmar'}
        </Button>
      </div>
    </form>
  );
}
