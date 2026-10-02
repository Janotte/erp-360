import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
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
import { financialService } from '@/services/financials';
import { personsService } from '@/services/persons';

interface ReceivableFormProps {
  onSuccess: () => void;
}

const NONE = '__none__';

export function ReceivableForm({ onSuccess }: ReceivableFormProps) {
  const queryClient = useQueryClient();
  const [personId, setPersonId] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [description, setDescription] = useState('');
  const [issueOn, setIssueOn] = useState(new Date().toISOString().split('T')[0]);
  const [dueOn, setDueOn] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [planAccountId, setPlanAccountId] = useState(NONE);
  const [financialInstitutionId, setFinancialInstitutionId] = useState(NONE);
  const [paymentMethodId, setPaymentMethodId] = useState(NONE);
  const [cardBrandId, setCardBrandId] = useState(NONE);
  const [bearerName, setBearerName] = useState('');
  const [barcode, setBarcode] = useState('');
  const [bankSlipOurNumber, setBankSlipOurNumber] = useState('');
  const [transactionAuthorization, setTransactionAuthorization] = useState('');

  const { data: clientsResponse } = useQuery({
    queryKey: ['personList', 'receivable', 'cliente'],
    queryFn: () =>
      personsService.list({
        page: 1,
        limit: 100,
        sortField: 'name',
        sortOrder: 'asc',
        type: 'cliente',
      }),
  });
  const clients = clientsResponse?.data;

  const { data: institutionsResponse } = useQuery({
    queryKey: ['personList', 'receivable', 'instituicao'],
    queryFn: () =>
      personsService.list({
        page: 1,
        limit: 100,
        sortField: 'name',
        sortOrder: 'asc',
        type: 'instituicao',
      }),
  });
  const institutions = institutionsResponse?.data;

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
    mutationFn: financialService.create.bind(null, 'receivable'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial', 'receivable'] });
      toast.success('Conta a receber lançada com sucesso!');
      onSuccess();
    },
    onError: (err: Error) => toast.error(`Erro: ${err.message}`),
  });

  const optionalId = (value: string) => (value === NONE ? undefined : value);

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
        <Select value={personId} onValueChange={setPersonId} required>
          <SelectTrigger>
            <SelectValue placeholder="Selecione um cliente..." />
          </SelectTrigger>
          <SelectContent>
            {clients?.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
        <Select value={planAccountId} onValueChange={setPlanAccountId}>
          <SelectTrigger>
            <SelectValue placeholder="Opcional" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Nenhum</SelectItem>
            {planAccounts.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label>Instituição financeira</Label>
        <Select value={financialInstitutionId} onValueChange={setFinancialInstitutionId}>
          <SelectTrigger>
            <SelectValue placeholder="Opcional" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Nenhuma</SelectItem>
            {institutions?.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Forma de pagamento</Label>
          <Select value={paymentMethodId} onValueChange={setPaymentMethodId}>
            <SelectTrigger>
              <SelectValue placeholder="Opcional" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Nenhuma</SelectItem>
              {paymentMethods.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Bandeira do cartão</Label>
          <Select value={cardBrandId} onValueChange={setCardBrandId}>
            <SelectTrigger>
              <SelectValue placeholder="Opcional" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Nenhuma</SelectItem>
              {cardBrands.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
        {mutation.isPending ? 'Salvando...' : 'Confirmar Lançamento'}
      </Button>
    </form>
  );
}
