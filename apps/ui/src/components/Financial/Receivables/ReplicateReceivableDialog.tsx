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
import { FloatingInput, FloatingSelect } from '@/components/ui/FloatingField';
import {
  type CreateReceivableInput,
  type FinancialAccount,
  financialService,
} from '@/services/financials';
import {
  advanceDocumentNumber,
  buildReplicateStep,
  type DueMode,
  type IssueMode,
  parseIsoDate,
} from '@/utils/replicatePayable';

interface ReplicateReceivableDialogProps {
  source: FinancialAccount;
  onSuccess: () => void;
  onCancel: () => void;
}

export function ReplicateReceivableDialog({
  source,
  onSuccess,
  onCancel,
}: ReplicateReceivableDialogProps) {
  const queryClient = useQueryClient();
  const [dueMode, setDueMode] = useState<DueMode>('fixedDay');
  const [intervalDays, setIntervalDays] = useState('30');
  const [fixedDay, setFixedDay] = useState(String(parseIsoDate(source.dueOn).getDate()));
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
      documentNumber: documentNumber || first.documentNumber || source.documentNumber,
    };
  }, [source, schedule, documentNumber]);

  const mutation = useMutation({
    mutationFn: async () => {
      const installmentAmount = parseCurrencyToCents(amountStr);
      if (installmentAmount <= 0) {
        throw new Error('Informe um valor válido.');
      }

      const payloads: CreateReceivableInput[] = [];
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
          invoiceNumber: source.invoiceNumber || undefined,
          financialInstitutionId: source.financialInstitutionId || undefined,
          meansOfPaymentId: source.meansOfPaymentId || undefined,
          paymentMethodId: source.paymentMethodId || null,
          cardBrandId: source.cardBrandId || undefined,
          bearerName: source.bearerName || undefined,
          barcode: source.barcode || undefined,
          bankSlipOurNumber: source.bankSlipOurNumber || undefined,
          transactionAuthorization: source.transactionAuthorization || undefined,
          issueOn: dates.issueOn,
          dueOn: dates.dueOn,
          documentNumber:
            step === 1
              ? documentNumber || dates.documentNumber || undefined
              : dates.documentNumber || undefined,
        });
      }

      for (const payload of payloads) {
        await financialService.create('receivable', payload);
      }
      return payloads.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['financial', 'receivable'] });
      toast.success(
        count === 1
          ? 'Conta a receber replicada com sucesso!'
          : `${count} contas a receber replicadas com sucesso!`,
      );
      onSuccess();
    },
    onError: (err: Error) => toast.error(`Erro: ${err.message}`),
  });

  return (
    <div className="space-y-4">
      <div className="space-y-1 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm">
        <p className="text-zinc-500">
          Origem: <strong className="text-zinc-900">{source.description}</strong>
        </p>
        <p className="text-zinc-500">
          Documento atual:{' '}
          <strong className="text-zinc-900">{source.documentNumber || '—'}</strong>
        </p>
      </div>

      <FloatingInput
        id="replicateReceivableAmount"
        label="Valor"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={amountStr}
        onChange={(event) => setAmountStr(maskCurrencyInput(event.target.value))}
      />

      <div className="space-y-2">
        <FloatingInput
          id="replicateReceivableDoc"
          label="Nº do documento da 1ª réplica"
          value={documentNumber}
          maxLength={44}
          onChange={(event) => setDocumentNumber(event.target.value)}
        />
        <p className="text-sm text-zinc-500">
          Se terminar em AAAAMM, como 202608, as próximas réplicas avançam o mês.
        </p>
      </div>

      <FloatingSelect
        id="replicateReceivableDueMode"
        label="Vencimento"
        value={dueMode}
        pinned
        onChange={(event) => setDueMode(event.target.value as DueMode)}
      >
        <option value="fixedDay">Dia fixo no próximo mês</option>
        <option value="intervalDays">Somar intervalo de dias</option>
      </FloatingSelect>

      {dueMode === 'fixedDay' ? (
        <FloatingInput
          id="replicateReceivableFixedDay"
          label="Dia do vencimento"
          type="number"
          min={1}
          max={31}
          value={fixedDay}
          onChange={(event) => setFixedDay(event.target.value)}
        />
      ) : (
        <FloatingInput
          id="replicateReceivableInterval"
          label="Intervalo em dias"
          type="number"
          min={1}
          value={intervalDays}
          onChange={(event) => setIntervalDays(event.target.value)}
        />
      )}

      <FloatingSelect
        id="replicateReceivableIssueMode"
        label="Emissão"
        value={issueMode}
        pinned
        onChange={(event) => setIssueMode(event.target.value as IssueMode)}
      >
        <option value="advance">Avançar junto com o vencimento</option>
        <option value="keep">Manter emissão original</option>
        <option value="today">Usar data de hoje</option>
      </FloatingSelect>

      <FloatingInput
        id="replicateReceivableQuantity"
        label="Quantidade de réplicas"
        type="number"
        min={1}
        max={12}
        value={quantity}
        onChange={(event) => setQuantity(event.target.value)}
      />

      <div className="space-y-1 rounded-lg border border-zinc-200 p-3 text-sm">
        <p className="font-medium text-zinc-900">Prévia da 1ª réplica</p>
        <p className="text-zinc-500">
          Documento:{' '}
          <strong className="text-zinc-900">{preview.documentNumber || '—'}</strong>
        </p>
        <p className="text-zinc-500">
          Emissão:{' '}
          <strong className="text-zinc-900">{formatRawDate(preview.issueOn)}</strong>
        </p>
        <p className="text-zinc-500">
          Vencimento:{' '}
          <strong className="text-zinc-900">{formatRawDate(preview.dueOn)}</strong>
        </p>
        {qty > 1 ? (
          <p className="text-sm text-zinc-500">
            Serão criados {qty} títulos em sequência.
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          type="button"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? 'Replicando...' : 'Replicar'}
        </Button>
      </div>
    </div>
  );
}
