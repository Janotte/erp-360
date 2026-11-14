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
import { Button } from '@/components/ui/button';
import { CatalogSearchSelect } from '@/components/ui/CatalogSearchSelect';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { companyCardService } from '@/services/companyCards';
import {
  type CreatePayableInput,
  type FinancialAccount,
  financialService,
} from '@/services/financials';

interface PayableFormProps {
  accountToUpdate?: FinancialAccount | null;
  readOnly?: boolean;
  onSuccess: () => void;
  onReplicate?: () => void;
}

export function PayableForm({
  accountToUpdate,
  readOnly = false,
  onSuccess,
  onReplicate,
}: PayableFormProps) {
  const queryClient = useQueryClient();
  const [personId, setPersonId] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [description, setDescription] = useState('');
  const [issueOn, setIssueOn] = useState(civilDate());
  const [dueOn, setDueOn] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [planAccountId, setPlanAccountId] = useState('');
  const [companyCardId, setCompanyCardId] = useState('');

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
      onSuccess();
    },
    onError: (err: Error) => toast.error(`Erro: ${err.message}`),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    const installmentAmount = parseCurrencyToCents(amountStr);
    if (!personId || !description || !dueOn || installmentAmount <= 0) return;

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
    readOnly &&
    accountToUpdate &&
    (accountToUpdate.status === 'pago' || accountToUpdate.settledOn);

  return (
    <form
      onSubmit={handleSubmit}
      className="max-h-[70vh] space-y-4 overflow-y-auto pr-1 pt-2"
    >
      {showSettlement && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm space-y-1">
          <p className="font-medium text-emerald-800">Liquidação</p>
          <p className="text-emerald-700">
            Data: <strong>{formatRawDate(accountToUpdate.settledOn) || '-'}</strong>
          </p>
          <p className="text-emerald-700">
            Valor pago: <strong>{formatCurrency(accountToUpdate.settledAmount)}</strong>
          </p>
          <p className="text-emerald-700">
            Status: <strong>{accountToUpdate.status}</strong>
          </p>
        </div>
      )}

      <div className="space-y-1">
        <Label>Cartão</Label>
        <CatalogSearchSelect
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

      <div className="space-y-1">
        <Label>Credor</Label>
        <PersonSearchSelect
          value={personId}
          onChange={setPersonId}
          type={['fornecedor', 'colaborador', 'instituicao']}
          placeholder="Buscar fornecedor, colaborador ou instituição..."
          required={!readOnly}
          disabled={readOnly || Boolean(companyCardId)}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="documentNumber">Nº do Documento</Label>
        <Input
          id="documentNumber"
          value={documentNumber}
          maxLength={44}
          onChange={(e) => setDocumentNumber(e.target.value)}
          disabled={readOnly}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="description">Descrição</Label>
        <Input
          id="description"
          value={description}
          maxLength={255}
          onChange={(e) => setDescription(e.target.value)}
          required={!readOnly}
          disabled={readOnly}
        />
      </div>

      <div className="space-y-1">
        <Label>Plano de contas</Label>
        <CatalogSearchSelect
          value={planAccountId}
          onChange={setPlanAccountId}
          options={planAccounts}
          placeholder="Buscar plano de contas..."
          emptyMessage="Nenhum plano de contas cadastrado."
          allowClear={!readOnly}
          disabled={readOnly}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="issueOn">Emissão</Label>
          <Input
            id="issueOn"
            type="date"
            value={issueOn}
            onChange={(e) => setIssueOn(e.target.value)}
            required={!readOnly}
            disabled={readOnly}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="dueOn">Vencimento</Label>
          <Input
            id="dueOn"
            type="date"
            value={dueOn}
            onChange={(e) => setDueOn(e.target.value)}
            required={!readOnly}
            disabled={readOnly}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="amount">Valor (R$)</Label>
        <Input
          id="amount"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="0,00"
          value={amountStr}
          onChange={(e) => setAmountStr(maskCurrencyInput(e.target.value))}
          required={!readOnly}
          disabled={readOnly}
        />
      </div>

      {readOnly ? (
        <div className="mt-2 flex gap-2">
          {onReplicate && accountToUpdate && (
            <Button type="button" className="flex-1" onClick={onReplicate}>
              Replicar
            </Button>
          )}
          <Button type="button" variant="outline" className="flex-1" onClick={onSuccess}>
            Fechar
          </Button>
        </div>
      ) : (
        <div className="mt-2 flex gap-2">
          {onReplicate && accountToUpdate && (
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={onReplicate}
            >
              Replicar
            </Button>
          )}
          <Button type="submit" className="flex-1" disabled={mutation.isPending}>
            {mutation.isPending
              ? 'Salvando...'
              : accountToUpdate
                ? 'Atualizar'
                : 'Confirmar Lançamento'}
          </Button>
        </div>
      )}
    </form>
  );
}
