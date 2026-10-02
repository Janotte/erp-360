import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { PersonSearchSelect } from '@/components/Persons/PersonSearchSelect';
import { Button } from '@/components/ui/button';
import { CatalogSearchSelect } from '@/components/ui/CatalogSearchSelect';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  type CreateReceivableInput,
  type FinancialAccount,
  financialService,
} from '@/services/financials';

interface ReceivableFormProps {
  accountToUpdate?: FinancialAccount | null;
  onSuccess: () => void;
}

export function ReceivableForm({ accountToUpdate, onSuccess }: ReceivableFormProps) {
  const queryClient = useQueryClient();
  const [personId, setPersonId] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [description, setDescription] = useState('');
  const [issueOn, setIssueOn] = useState(new Date().toISOString().split('T')[0]);
  const [dueOn, setDueOn] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [planAccountId, setPlanAccountId] = useState('');
  const [financialInstitutionId, setFinancialInstitutionId] = useState('');
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [cardBrandId, setCardBrandId] = useState('');
  const [bearerName, setBearerName] = useState('');
  const [barcode, setBarcode] = useState('');
  const [bankSlipOurNumber, setBankSlipOurNumber] = useState('');
  const [transactionAuthorization, setTransactionAuthorization] = useState('');

  useEffect(() => {
    if (!accountToUpdate) return;
    setPersonId(accountToUpdate.personId);
    setDocumentNumber(accountToUpdate.documentNumber || '');
    setInvoiceNumber(accountToUpdate.invoiceNumber || '');
    setDescription(accountToUpdate.description);
    setIssueOn(accountToUpdate.issueOn?.slice(0, 10) || '');
    setDueOn(accountToUpdate.dueOn?.slice(0, 10) || '');
    setAmountStr((accountToUpdate.installmentAmount / 100).toString());
    setPlanAccountId(accountToUpdate.planAccountId || '');
    setFinancialInstitutionId(accountToUpdate.financialInstitutionId || '');
    setPaymentMethodId(accountToUpdate.paymentMethodId || '');
    setCardBrandId(accountToUpdate.cardBrandId || '');
    setBearerName(accountToUpdate.bearerName || '');
    setBarcode(accountToUpdate.barcode || '');
    setBankSlipOurNumber(accountToUpdate.bankSlipOurNumber || '');
    setTransactionAuthorization(accountToUpdate.transactionAuthorization || '');
  }, [accountToUpdate]);

  const { data: planAccounts = [] } = useQuery({
    queryKey: ['financial', 'plan-accounts'],
    queryFn: () => financialService.listPlanAccounts(),
  });

  const { data: paymentMethods = [] } = useQuery({
    queryKey: ['financial', 'payment-methods'],
    queryFn: () => financialService.listPaymentMethods(),
  });

  const { data: cardBrands = [] } = useQuery({
    queryKey: ['financial', 'card-brands'],
    queryFn: () => financialService.listCardBrands(),
  });

  const mutation = useMutation({
    mutationFn: (dados: CreateReceivableInput) =>
      accountToUpdate
        ? financialService.update('receivable', accountToUpdate.id, dados)
        : financialService.create('receivable', dados),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial', 'receivable'] });
      toast.success(
        accountToUpdate
          ? 'Conta a receber atualizada com sucesso!'
          : 'Conta a receber lançada com sucesso!',
      );
      onSuccess();
    },
    onError: (err: Error) => toast.error(`Erro: ${err.message}`),
  });

  const optionalId = (value: string) => (value ? value : undefined);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!personId || !description || !amountStr || !dueOn) return;

    const installmentAmount = Math.round(parseFloat(amountStr.replace(',', '.')) * 100);

    mutation.mutate({
      personId,
      documentNumber: documentNumber || undefined,
      invoiceNumber: invoiceNumber || undefined,
      description,
      issueOn: issueOn || undefined,
      installmentAmount,
      dueOn,
      planAccountId: optionalId(planAccountId),
      financialInstitutionId: optionalId(financialInstitutionId),
      paymentMethodId: optionalId(paymentMethodId),
      cardBrandId: optionalId(cardBrandId),
      bearerName: bearerName || undefined,
      barcode: barcode || undefined,
      bankSlipOurNumber: bankSlipOurNumber || undefined,
      transactionAuthorization: transactionAuthorization || undefined,
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="max-h-[70vh] space-y-4 overflow-y-auto pr-1 pt-2"
    >
      <div className="space-y-1">
        <Label>Cliente</Label>
        <PersonSearchSelect
          value={personId}
          onChange={setPersonId}
          type="cliente"
          placeholder="Buscar cliente por nome ou documento..."
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="documentNumber">Nº Documento</Label>
          <Input
            id="documentNumber"
            value={documentNumber}
            maxLength={44}
            onChange={(e) => setDocumentNumber(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="invoiceNumber">Nº Fatura</Label>
          <Input
            id="invoiceNumber"
            value={invoiceNumber}
            maxLength={44}
            onChange={(e) => setInvoiceNumber(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="description">Descrição da venda ou serviço</Label>
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
          type="number"
          step="0.01"
          value={amountStr}
          onChange={(e) => setAmountStr(e.target.value)}
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

      <div className="space-y-1">
        <Label>Instituição financeira</Label>
        <PersonSearchSelect
          value={financialInstitutionId}
          onChange={setFinancialInstitutionId}
          type="instituicao"
          placeholder="Buscar instituição (opcional)..."
          allowClear
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Forma de pagamento</Label>
          <CatalogSearchSelect
            value={paymentMethodId}
            onChange={setPaymentMethodId}
            options={paymentMethods}
            placeholder="Buscar forma de pagamento..."
            emptyMessage="Nenhuma forma de pagamento cadastrada."
            allowClear
          />
        </div>
        <div className="space-y-1">
          <Label>Bandeira do cartão</Label>
          <CatalogSearchSelect
            value={cardBrandId}
            onChange={setCardBrandId}
            options={cardBrands}
            placeholder="Buscar bandeira..."
            emptyMessage="Nenhuma bandeira cadastrada."
            allowClear
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="bearerName">Portador do boleto</Label>
        <Input
          id="bearerName"
          value={bearerName}
          maxLength={60}
          onChange={(e) => setBearerName(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="bankSlipOurNumber">Nosso número</Label>
          <Input
            id="bankSlipOurNumber"
            value={bankSlipOurNumber}
            maxLength={20}
            onChange={(e) => setBankSlipOurNumber(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="barcode">Código de barras</Label>
          <Input
            id="barcode"
            value={barcode}
            maxLength={50}
            onChange={(e) => setBarcode(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="transactionAuthorization">Autorização da transação</Label>
        <Input
          id="transactionAuthorization"
          value={transactionAuthorization}
          maxLength={128}
          onChange={(e) => setTransactionAuthorization(e.target.value)}
        />
      </div>

      <Button
        type="submit"
        className="mt-2 w-full bg-zinc-900 text-white hover:bg-zinc-800"
        disabled={mutation.isPending}
      >
        {mutation.isPending
          ? 'Salvando...'
          : accountToUpdate
            ? 'Atualizar'
            : 'Confirmar Lançamento'}
      </Button>
    </form>
  );
}
