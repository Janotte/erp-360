import {
  formatCurrencyInput,
  formatRawDate,
  maskCurrencyInput,
  parseCurrencyToCents,
} from '@erp-360/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  type CreatePayableInput,
  type FinancialAccount,
  financialService,
} from '@/services/financials';
import {
  type DueMode,
  type IssueMode,
  advanceDocumentNumber,
  buildReplicateStep,
  parseIsoDate,
} from '@/utils/replicatePayable';

interface ReplicatePayableDialogProps {
  source: FinancialAccount;
  onSuccess: () => void;
  onCancel: () => void;
}

export function ReplicatePayableDialog({
  source,
  onSuccess,
  onCancel,
}: ReplicatePayableDialogProps) {
  const queryClient = useQueryClient();
  const [dueMode, setDueMode] = useState<DueMode>('fixedDay');
  const [intervalDays, setIntervalDays] = useState('30');
  const [fixedDay, setFixedDay] = useState(
    String(parseIsoDate(source.dueOn).getDate()),
  );
  const [issueMode, setIssueMode] = useState<IssueMode>('advance');
  const [quantity, setQuantity] = useState('1');
  const [amountStr, setAmountStr] = useState(
    formatCurrencyInput(source.installmentAmount),
  );
  const [documentNumber, setDocumentNumber] = useState(
    advanceDocumentNumber(source.documentNumber, 1) ?? source.documentNumber ?? '',
  );

  const qty = Math.min(12, Math.max(1, Number.parseInt(quantity, 10) || 1));
  const days = Math.max(1, Number.parseInt(intervalDays, 10) || 30);
  const day = Math.min(31, Math.max(1, Number.parseInt(fixedDay, 10) || 1));

  const schedule = useMemo(
    () => ({
      dueMode,
      intervalDays: days,
      fixedDay: day,
      issueMode,
      quantity: qty,
    }),
    [dueMode, days, day, issueMode, qty],
  );

  const preview = useMemo(() => {
    const first = buildReplicateStep(
      {
        issueOn: source.issueOn,
        dueOn: source.dueOn,
        documentNumber: source.documentNumber,
      },
      1,
      schedule,
    );
    return {
      ...first,
      documentNumber:
        documentNumber || first.documentNumber || source.documentNumber,
    };
  }, [source, schedule, documentNumber]);

  const mutation = useMutation({
    mutationFn: async () => {
      const installmentAmount = parseCurrencyToCents(amountStr);
      if (installmentAmount <= 0) {
        throw new Error('Informe um valor válido.');
      }

      const payloads: CreatePayableInput[] = [];
      for (let step = 1; step <= qty; step += 1) {
        const dates = buildReplicateStep(
          {
            issueOn: source.issueOn,
            dueOn: source.dueOn,
            documentNumber: source.documentNumber,
          },
          step,
          schedule,
        );

        payloads.push({
          personId: source.personId,
          description: source.description,
          installmentAmount,
          planAccountId: source.planAccountId || undefined,
          issueOn: dates.issueOn,
          dueOn: dates.dueOn,
          documentNumber:
            step === 1
              ? documentNumber || dates.documentNumber || undefined
              : dates.documentNumber || undefined,
        });
      }

      for (const payload of payloads) {
        await financialService.create('payable', payload);
      }
      return payloads.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['financial', 'payable'] });
      toast.success(
        count === 1
          ? 'Conta a pagar replicada com sucesso!'
          : `${count} contas a pagar replicadas com sucesso!`,
      );
      onSuccess();
    },
    onError: (err: Error) => toast.error(`Erro: ${err.message}`),
  });

  return (
    <div className="space-y-4 pt-2">
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm space-y-1">
        <p className="text-zinc-500">
          Origem: <strong className="text-zinc-900">{source.description}</strong>
        </p>
        <p className="text-zinc-500">
          Documento atual:{' '}
          <strong className="text-zinc-900">{source.documentNumber || '-'}</strong>
        </p>
      </div>

      <div className="space-y-1">
        <Label htmlFor="replicateAmount">Valor (R$)</Label>
        <Input
          id="replicateAmount"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={amountStr}
          onChange={(e) => setAmountStr(maskCurrencyInput(e.target.value))}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="replicateDoc">Nº Documento (1ª réplica)</Label>
        <Input
          id="replicateDoc"
          value={documentNumber}
          maxLength={44}
          onChange={(e) => setDocumentNumber(e.target.value)}
        />
        <p className="text-xs text-zinc-500">
          Se for AAAAMM (ex.: 202608), as próximas réplicas avançam o mês
          automaticamente.
        </p>
      </div>

      <div className="space-y-1">
        <Label>Vencimento</Label>
        <Select value={dueMode} onValueChange={(v) => setDueMode(v as DueMode)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fixedDay">Dia fixo no próximo mês</SelectItem>
            <SelectItem value="intervalDays">Somar intervalo de dias</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {dueMode === 'fixedDay' ? (
        <div className="space-y-1">
          <Label htmlFor="fixedDay">Dia do vencimento</Label>
          <Input
            id="fixedDay"
            type="number"
            min={1}
            max={31}
            value={fixedDay}
            onChange={(e) => setFixedDay(e.target.value)}
          />
        </div>
      ) : (
        <div className="space-y-1">
          <Label htmlFor="intervalDays">Intervalo (dias)</Label>
          <Input
            id="intervalDays"
            type="number"
            min={1}
            value={intervalDays}
            onChange={(e) => setIntervalDays(e.target.value)}
          />
        </div>
      )}

      <div className="space-y-1">
        <Label>Emissão</Label>
        <Select value={issueMode} onValueChange={(v) => setIssueMode(v as IssueMode)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="advance">Avançar junto com o vencimento</SelectItem>
            <SelectItem value="keep">Manter emissão original</SelectItem>
            <SelectItem value="today">Usar data de hoje</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label htmlFor="quantity">Quantidade de réplicas</Label>
        <Input
          id="quantity"
          type="number"
          min={1}
          max={12}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-3 text-sm space-y-1">
        <p className="font-medium text-zinc-900">Preview da 1ª réplica</p>
        <p className="text-zinc-500">
          Documento: <strong className="text-zinc-900">{preview.documentNumber || '-'}</strong>
        </p>
        <p className="text-zinc-500">
          Emissão:{' '}
          <strong className="text-zinc-900">{formatRawDate(preview.issueOn)}</strong>
        </p>
        <p className="text-zinc-500">
          Vencimento:{' '}
          <strong className="text-zinc-900">{formatRawDate(preview.dueOn)}</strong>
        </p>
        {qty > 1 && (
          <p className="text-xs text-zinc-500">Serão criados {qty} títulos em sequência.</p>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          type="button"
          className="flex-1"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? 'Replicando...' : 'Confirmar réplica'}
        </Button>
      </div>
    </div>
  );
}
