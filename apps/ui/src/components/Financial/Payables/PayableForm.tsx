import {
  civilDate,
  formatCurrency,
  formatCurrencyInput,
  formatRawDate,
  maskCurrencyInput,
  parseCurrencyToCents,
  statementDueDates,
} from '@erp-360/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { PersonSearchSelect } from '@/components/Persons/PersonSearchSelect';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { CatalogSearchSelect } from '@/components/ui/CatalogSearchSelect';
import { FloatingInput } from '@/components/ui/FloatingField';
import { companyCardService } from '@/services/companyCards';
import {
  type CreatePayableInput,
  type FinancialAccount,
  financialService,
} from '@/services/financials';

interface PayableFormProps {
  accountToUpdate?: FinancialAccount | null;
  onSuccess?: () => void;
  onCancel?: () => void;
  onDeleted?: () => void;
  onPay?: () => void;
  onReplicate?: () => void;
}

const statusLabels: Record<FinancialAccount['status'], string> = {
  pendente: 'Pendente',
  pago: 'Pago',
  recebido: 'Recebido',
  cancelado: 'Cancelado',
};

export function PayableForm({
  accountToUpdate,
  onSuccess,
  onCancel,
  onDeleted,
  onPay,
  onReplicate,
}: PayableFormProps) {
  const queryClient = useQueryClient();
  const readOnly = Boolean(accountToUpdate && accountToUpdate.status !== 'pendente');
  const [personId, setPersonId] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [description, setDescription] = useState('');
  const [issueOn, setIssueOn] = useState(civilDate());
  const [dueOn, setDueOn] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [planAccountId, setPlanAccountId] = useState('');
  const [companyCardId, setCompanyCardId] = useState('');
  const [openDelete, setOpenDelete] = useState(false);
  const [openReverse, setOpenReverse] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!accountToUpdate) return;
    setPersonId(accountToUpdate.personId);
    setDocumentNumber(accountToUpdate.documentNumber || '');
    setDescription(accountToUpdate.description);
    setIssueOn(accountToUpdate.issueOn?.slice(0, 10) || '');
    setDueOn(accountToUpdate.dueOn?.slice(0, 10) || '');
    setAmountStr(formatCurrencyInput(accountToUpdate.installmentAmount));
    setPlanAccountId(accountToUpdate.planAccountId || '');
    setCompanyCardId(accountToUpdate.companyCardId || '');
  }, [accountToUpdate]);

  const { data: planAccounts = [] } = useQuery({
    queryKey: ['financial', 'plan-accounts'],
    queryFn: () => financialService.listPlanAccounts({ acceptsEntries: true }),
  });
  const cards = useQuery({
    queryKey: ['company-cards'],
    queryFn: companyCardService.list,
  });

  const mutation = useMutation({
    mutationFn: (dados: CreatePayableInput) =>
      accountToUpdate
        ? financialService.update('payable', accountToUpdate.id, dados)
        : financialService.create('payable', dados),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial', 'payable'] });
      queryClient.invalidateQueries({ queryKey: ['company-cards'] });
      toast.success(
        accountToUpdate
          ? 'Conta a pagar atualizada com sucesso!'
          : 'Conta a pagar lançada com sucesso!',
      );
      onSuccess?.();
    },
    onError: (err: Error) => toast.error(`Erro: ${err.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: () => financialService.delete('payable', accountToUpdate?.id ?? ''),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial', 'payable'] });
      toast.success('Conta a pagar excluída com sucesso!');
      onDeleted?.();
    },
    onError: (error: Error) => setActionError(error.message),
  });

  const reverseMutation = useMutation({
    mutationFn: () => financialService.reverse('payable', accountToUpdate?.id ?? ''),
    onSuccess: (saved) => {
      queryClient.setQueryData(['financial', 'payable', saved.id], saved);
      queryClient.invalidateQueries({ queryKey: ['financial', 'payable'] });
      setOpenReverse(false);
      setActionError(null);
      toast.success('Pagamento estornado com sucesso!');
    },
    onError: (error: Error) => setActionError(error.message),
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (readOnly) return;
    const installmentAmount = parseCurrencyToCents(amountStr);
    if (!personId) {
      toast.error('Informe o credor.');
      return;
    }
    if (!description.trim()) {
      toast.error('Informe a descrição.');
      return;
    }
    if (!dueOn) {
      toast.error('Informe o vencimento.');
      return;
    }
    if (installmentAmount <= 0) {
      toast.error('Informe o valor.');
      return;
    }

    mutation.mutate({
      personId,
      documentNumber: documentNumber || undefined,
      description,
      issueOn: issueOn || undefined,
      installmentAmount,
      dueOn,
      planAccountId: planAccountId || undefined,
      companyCardId: companyCardId || null,
    });
  };

  const selectCard = (nextId: string) => {
    setCompanyCardId(nextId);
    const card = (cards.data ?? []).find((item) => item.id === nextId);
    if (!card) return;
    setPersonId(card.issuerId);
    if (dueOn) return;
    const base = issueOn || civilDate();
    try {
      const [due] = statementDueDates(base, card.closingDay, card.dueDay, 1);
      if (due) setDueOn(due);
    } catch {
      // A emissão informada segue editável e o vencimento fica para o usuário.
    }
  };

  const showSettlement =
    accountToUpdate && (accountToUpdate.status === 'pago' || accountToUpdate.settledOn);
  const busy =
    mutation.isPending || deleteMutation.isPending || reverseMutation.isPending;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {showSettlement ? (
        <div className="space-y-1 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
          <p className="font-medium text-emerald-800">Liquidação</p>
          <p className="text-emerald-700">
            Data: <strong>{formatRawDate(accountToUpdate.settledOn) || '—'}</strong>
          </p>
          <p className="text-emerald-700">
            Valor pago: <strong>{formatCurrency(accountToUpdate.settledAmount)}</strong>
          </p>
          <p className="text-emerald-700">
            Situação: <strong>{statusLabels[accountToUpdate.status]}</strong>
          </p>
        </div>
      ) : null}

      <div className="space-y-2">
        <CatalogSearchSelect
          label="Cartão"
          value={companyCardId}
          onChange={selectCard}
          options={(cards.data ?? [])
            .filter((card) => card.isActive || card.id === companyCardId)
            .map((card) => ({ id: card.id, label: card.name }))}
          placeholder="Sem cartão"
          emptyMessage="Nenhum cartão cadastrado."
          allowClear={!readOnly}
          disabled={readOnly}
          isLoading={cards.isLoading}
        />
        {companyCardId ? (
          <p className="text-sm text-zinc-500">
            Entra na fatura do cartão. O credor fica o emissor; a descrição identifica o
            gasto.
          </p>
        ) : null}
      </div>

      <PersonSearchSelect
        label="Credor"
        value={personId}
        onChange={setPersonId}
        type={['fornecedor', 'colaborador', 'instituicao']}
        placeholder="Buscar fornecedor, colaborador ou instituição..."
        required={!readOnly}
        disabled={readOnly || Boolean(companyCardId)}
      />

      <FloatingInput
        id="documentNumber"
        label="Nº do documento"
        value={documentNumber}
        maxLength={44}
        disabled={readOnly}
        onChange={(event) => setDocumentNumber(event.target.value)}
      />

      <FloatingInput
        id="description"
        label="Descrição"
        value={description}
        maxLength={255}
        required={!readOnly}
        disabled={readOnly}
        onChange={(event) => setDescription(event.target.value)}
      />

      <CatalogSearchSelect
        label="Plano de contas"
        value={planAccountId}
        onChange={setPlanAccountId}
        options={planAccounts}
        placeholder="Buscar plano de contas..."
        emptyMessage="Nenhum plano de contas cadastrado."
        allowClear={!readOnly}
        disabled={readOnly}
      />

      <div className="grid grid-cols-2 gap-4">
        <FloatingInput
          id="issueOn"
          label="Emissão"
          type="date"
          value={issueOn}
          required={!readOnly}
          disabled={readOnly}
          onChange={(event) => setIssueOn(event.target.value)}
        />
        <FloatingInput
          id="dueOn"
          label="Vencimento"
          type="date"
          value={dueOn}
          required={!readOnly}
          disabled={readOnly}
          onChange={(event) => setDueOn(event.target.value)}
        />
      </div>

      <FloatingInput
        id="amount"
        label="Valor"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={amountStr}
        required={!readOnly}
        disabled={readOnly}
        onChange={(event) => setAmountStr(maskCurrencyInput(event.target.value))}
      />

      {mutation.isError ? (
        <p className="rounded-md bg-destructive/10 p-3 text-sm font-medium text-destructive">
          {mutation.error.message}
        </p>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2 pt-2">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        ) : null}
        {accountToUpdate && onDeleted && accountToUpdate.status === 'pendente' ? (
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={() => {
              setActionError(null);
              setOpenDelete(true);
            }}
          >
            Excluir
          </Button>
        ) : null}
        {onReplicate && accountToUpdate ? (
          <Button type="button" variant="outline" disabled={busy} onClick={onReplicate}>
            Replicar
          </Button>
        ) : null}
        {accountToUpdate?.status === 'pago' ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              setActionError(null);
              setOpenReverse(true);
            }}
          >
            Estornar
          </Button>
        ) : null}
        {onPay ? (
          <Button type="button" disabled={busy} onClick={onPay}>
            Pagar
          </Button>
        ) : null}
        {readOnly ? null : (
          <Button type="submit" disabled={busy}>
            {mutation.isPending
              ? 'Salvando...'
              : accountToUpdate
                ? 'Atualizar'
                : 'Lançar'}
          </Button>
        )}
      </div>

      <AlertDialog open={openDelete} onOpenChange={setOpenDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conta a pagar</AlertDialogTitle>
            <AlertDialogDescription>
              {actionError ??
                `Deseja excluir ${description || 'esta conta'}? Essa ação não pode ser desfeita.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteMutation.isPending || !!actionError}
              onClick={(event) => {
                event.preventDefault();
                deleteMutation.mutate();
              }}
            >
              {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={openReverse} onOpenChange={setOpenReverse}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Estornar pagamento</AlertDialogTitle>
            <AlertDialogDescription>
              {actionError ??
                `Deseja estornar o pagamento de ${description || 'esta conta'}? O título voltará para pendente.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 hover:bg-amber-700"
              disabled={reverseMutation.isPending || !!actionError}
              onClick={(event) => {
                event.preventDefault();
                reverseMutation.mutate();
              }}
            >
              {reverseMutation.isPending ? 'Estornando...' : 'Estornar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
