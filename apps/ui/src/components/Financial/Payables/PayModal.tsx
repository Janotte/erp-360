import {
  formatCurrency,
  formatCurrencyInput,
  maskCurrencyInput,
  parseCurrencyToCents,
} from '@erp-360/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { CatalogSearchSelect } from '@/components/ui/CatalogSearchSelect';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { type FinancialAccount, financialService } from '@/services/financials';
import { treasuryService } from '@/services/treasury';

interface PayModalProps {
  tipo: 'payable' | 'receivable';
  account: FinancialAccount;
  onSuccess: () => void;
}

function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function PayModal({ tipo, account, onSuccess }: PayModalProps) {
  const queryClient = useQueryClient();
  const today = new Date().toISOString().split('T')[0];
  const [settledOn, setSettledOn] = useState(today);
  const [valorPagoStr, setValorPagoStr] = useState(
    formatCurrencyInput(account.installmentAmount),
  );
  const [treasury, setTreasury] = useState<'cash' | 'bank'>('cash');
  const [bankAccountId, setBankAccountId] = useState('');
  const [waiveCharges, setWaiveCharges] = useState(false);
  const [remainderMode, setRemainderMode] = useState<'new_title' | 'plan_account'>(
    'new_title',
  );
  const [differencePlanAccountId, setDifferencePlanAccountId] = useState('');
  const [remainderDueOn, setRemainderDueOn] = useState(addDays(today, 30));
  const [includeChargesOnNewTitle, setIncludeChargesOnNewTitle] = useState(false);

  const { data: preview } = useQuery({
    queryKey: ['settlement-preview', tipo, account.id, settledOn, waiveCharges],
    queryFn: () =>
      financialService.settlementPreview(tipo, account.id, settledOn, waiveCharges),
  });

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ['treasury', 'bank-accounts'],
    queryFn: treasuryService.bankAccounts,
  });

  const dueAmount = preview?.dueAmount ?? account.installmentAmount;
  const settledAmount = parseCurrencyToCents(valorPagoStr);
  const remainder = dueAmount - settledAmount;
  const extra = settledAmount - dueAmount;
  const differenceType = extra > 0
    ? tipo === 'payable' ? 'expense' : 'revenue'
    : tipo === 'payable' ? 'revenue' : 'expense';

  const { data: differenceAccounts = [] } = useQuery({
    queryKey: ['financial', 'plan-accounts', differenceType],
    queryFn: () => financialService.listPlanAccounts(differenceType),
    enabled: remainder > 0 || extra > 0,
  });

  useEffect(() => {
    if (!preview) return;
    setValorPagoStr(formatCurrencyInput(preview.dueAmount));
  }, [preview?.dueAmount, preview?.fineAmount, preview?.interestAmount, waiveCharges]);

  useEffect(() => {
    if (!preview?.settings || differencePlanAccountId) return;
    const settings = preview.settings;
    const suggested =
      extra > 0
        ? tipo === 'payable'
          ? settings.lateFeePaidPlanAccountId
          : settings.lateFeeReceivedPlanAccountId
        : tipo === 'payable'
          ? settings.discountObtainedPlanAccountId
          : settings.discountGrantedPlanAccountId;
    if (suggested) setDifferencePlanAccountId(suggested);
  }, [preview, extra, remainder, tipo, differencePlanAccountId]);

  const bankOptions = useMemo(
    () => bankAccounts.map((item) => ({ id: item.id, label: item.name })),
    [bankAccounts],
  );

  const mutation = useMutation({
    mutationFn: () =>
      financialService.pay(tipo, account.id, {
        settledOn,
        settledAmount,
        treasury,
        bankAccountId: treasury === 'bank' ? bankAccountId : null,
        waiveCharges,
        remainderMode: remainder > 0 ? remainderMode : 'none',
        differencePlanAccountId:
          remainder > 0 && remainderMode === 'plan_account'
            ? differencePlanAccountId
            : extra > 0
              ? differencePlanAccountId
              : null,
        remainderDueOn: remainder > 0 && remainderMode === 'new_title' ? remainderDueOn : null,
        includeChargesOnNewTitle,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial', tipo] });
      queryClient.invalidateQueries({ queryKey: ['treasury'] });
      toast.success('Baixa processada com sucesso!');
      onSuccess();
    },
    onError: (err: Error) => toast.error(`Erro: ${err.message}`),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (settledAmount <= 0) return;
    if (treasury === 'bank' && !bankAccountId) {
      toast.error('Selecione a conta bancária.');
      return;
    }
    mutation.mutate();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-4">
      <div className="bg-zinc-50 p-3 rounded-lg border text-sm space-y-1">
        <p className="text-zinc-500">
          Título: <strong className="text-zinc-900">{account.description}</strong>
        </p>
        <p className="text-zinc-500">
          Valor original:{' '}
          <strong className="text-zinc-900">
            {formatCurrency(account.installmentAmount)}
          </strong>
        </p>
        {tipo === 'receivable' && preview && preview.daysLate > 0 ? (
          <>
            <p className="text-zinc-500">
              Atraso: <strong className="text-zinc-900">{preview.daysLate} dia(s)</strong>
            </p>
            <p className="text-zinc-500">
              Multa:{' '}
              <strong className="text-zinc-900">{formatCurrency(preview.fineAmount)}</strong>
            </p>
            <p className="text-zinc-500">
              Juros:{' '}
              <strong className="text-zinc-900">
                {formatCurrency(preview.interestAmount)}
              </strong>
            </p>
          </>
        ) : null}
        <p className="text-zinc-500">
          Valor atual:{' '}
          <strong className="text-zinc-900">{formatCurrency(dueAmount)}</strong>
        </p>
      </div>

      <div className="space-y-1">
        <Label htmlFor="settledOn">
          Data do {tipo === 'payable' ? 'pagamento' : 'recebimento'}
        </Label>
        <Input
          id="settledOn"
          type="date"
          value={settledOn}
          onChange={(e) => setSettledOn(e.target.value)}
          required
        />
      </div>

      {tipo === 'receivable' && preview && preview.daysLate > 0 ? (
        <div className="flex items-center space-x-2">
          <Checkbox
            id="waiveCharges"
            checked={waiveCharges}
            onCheckedChange={(value) => setWaiveCharges(!!value)}
          />
          <label htmlFor="waiveCharges" className="text-sm font-medium">
            Dispensar multa e juros
          </label>
        </div>
      ) : null}

      <div className="space-y-1">
        <Label>Tesouraria</Label>
        <select
          value={treasury}
          onChange={(e) => setTreasury(e.target.value as 'cash' | 'bank')}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
        >
          <option value="cash">Caixa</option>
          <option value="bank">Conta bancária</option>
        </select>
      </div>

      {treasury === 'bank' ? (
        <div className="space-y-1">
          <Label>Conta bancária</Label>
          <CatalogSearchSelect
            value={bankAccountId}
            onChange={setBankAccountId}
            options={bankOptions}
            placeholder="Selecione a conta"
            required
          />
        </div>
      ) : null}

      <div className="space-y-1">
        <Label htmlFor="valorPago">
          Valor efetivamente {tipo === 'payable' ? 'pago' : 'recebido'} (R$)
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

      {remainder > 0 ? (
        <div className="space-y-3 rounded-md border p-3">
          <p className="text-sm text-zinc-600">
            Diferença a menor: {formatCurrency(remainder)}
          </p>
          <select
            value={remainderMode}
            onChange={(e) =>
              setRemainderMode(e.target.value as 'new_title' | 'plan_account')
            }
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
          >
            <option value="new_title">Criar novo título com o restante</option>
            <option value="plan_account">
              {tipo === 'payable'
                ? 'Lançar desconto obtido no plano de contas'
                : 'Lançar desconto concedido no plano de contas'}
            </option>
          </select>
          {remainderMode === 'new_title' ? (
            <>
              <div className="space-y-1">
                <Label htmlFor="remainderDueOn">Vencimento do restante</Label>
                <Input
                  id="remainderDueOn"
                  type="date"
                  value={remainderDueOn}
                  onChange={(e) => setRemainderDueOn(e.target.value)}
                  required
                />
              </div>
              {tipo === 'receivable' && preview && preview.daysLate > 0 && !waiveCharges ? (
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="includeChargesOnNewTitle"
                    checked={includeChargesOnNewTitle}
                    onCheckedChange={(value) => setIncludeChargesOnNewTitle(!!value)}
                  />
                  <label htmlFor="includeChargesOnNewTitle" className="text-sm font-medium">
                    Incluir multa e juros no novo título
                  </label>
                </div>
              ) : null}
            </>
          ) : (
            <div className="space-y-1">
              <Label>Conta do plano</Label>
              <CatalogSearchSelect
                value={differencePlanAccountId}
                onChange={setDifferencePlanAccountId}
                options={differenceAccounts}
                placeholder="Selecione a conta"
                required
              />
            </div>
          )}
        </div>
      ) : null}

      {extra > 0 ? (
        <div className="space-y-3 rounded-md border p-3">
          <p className="text-sm text-zinc-600">
            Diferença a maior: {formatCurrency(extra)}
          </p>
          <div className="space-y-1">
            <Label>Conta do plano para a diferença</Label>
            <CatalogSearchSelect
              value={differencePlanAccountId}
              onChange={setDifferencePlanAccountId}
              options={differenceAccounts}
              placeholder="Selecione a conta"
              required
            />
          </div>
        </div>
      ) : null}

      <Button
        type="submit"
        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
        disabled={mutation.isPending}
      >
        {mutation.isPending ? 'Processando baixa...' : 'Confirmar liquidação'}
      </Button>
    </form>
  );
}
