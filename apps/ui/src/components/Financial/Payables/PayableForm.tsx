import { formatCurrencyInput, maskCurrencyInput, parseCurrencyToCents } from '@erp-360/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { PersonSearchSelect } from '@/components/Persons/PersonSearchSelect';
import { Button } from '@/components/ui/button';
import { CatalogSearchSelect } from '@/components/ui/CatalogSearchSelect';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  type CreatePayableInput,
  type FinancialAccount,
  financialService,
} from '@/services/financials';

interface PayableFormProps {
  accountToUpdate?: FinancialAccount | null;
  onSuccess: () => void;
}

export function PayableForm({ accountToUpdate, onSuccess }: PayableFormProps) {
  const queryClient = useQueryClient();
  const [personId, setPersonId] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [description, setDescription] = useState('');
  const [issueOn, setIssueOn] = useState(new Date().toISOString().split('T')[0]);
  const [dueOn, setDueOn] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [planAccountId, setPlanAccountId] = useState('');

  useEffect(() => {
    if (!accountToUpdate) return;
    setPersonId(accountToUpdate.personId);
    setDocumentNumber(accountToUpdate.documentNumber || '');
    setDescription(accountToUpdate.description);
    setIssueOn(accountToUpdate.issueOn?.slice(0, 10) || '');
    setDueOn(accountToUpdate.dueOn?.slice(0, 10) || '');
    setAmountStr(formatCurrencyInput(accountToUpdate.installmentAmount));
    setPlanAccountId(accountToUpdate.planAccountId || '');
  }, [accountToUpdate]);

  const { data: planAccounts = [] } = useQuery({
    queryKey: ['financial', 'plan-accounts'],
    queryFn: () => financialService.listPlanAccounts(),
  });

  const mutation = useMutation({
    mutationFn: (dados: CreatePayableInput) =>
      accountToUpdate
        ? financialService.update('payable', accountToUpdate.id, dados)
        : financialService.create('payable', dados),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial', 'payable'] });
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
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="max-h-[70vh] space-y-4 overflow-y-auto pr-1 pt-2"
    >
      <div className="space-y-1">
        <Label>Credor</Label>
        <PersonSearchSelect
          value={personId}
          onChange={setPersonId}
          type={['fornecedor', 'colaborador', 'instituicao']}
          placeholder="Buscar fornecedor, colaborador ou instituição..."
          required
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="documentNumber">Nº Documento / NF</Label>
        <Input
          id="documentNumber"
          value={documentNumber}
          maxLength={44}
          onChange={(e) => setDocumentNumber(e.target.value)}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="description">Descrição</Label>
        <Input
          id="description"
          value={description}
          maxLength={255}
          onChange={(e) => setDescription(e.target.value)}
          required
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
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="dueOn">Vencimento</Label>
          <Input
            id="dueOn"
            type="date"
            value={dueOn}
            onChange={(e) => setDueOn(e.target.value)}
            required
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
          required
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
          allowClear
        />
      </div>

      <Button type="submit" className="mt-2 w-full" disabled={mutation.isPending}>
        {mutation.isPending
          ? 'Salvando...'
          : accountToUpdate
            ? 'Atualizar'
            : 'Confirmar Lançamento'}
      </Button>
    </form>
  );
}
