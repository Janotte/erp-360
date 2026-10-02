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

interface PayableFormProps {
  onSuccess: () => void;
}

const NONE = '__none__';

export function PayableForm({ onSuccess }: PayableFormProps) {
  const queryClient = useQueryClient();
  const [personId, setPersonId] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [description, setDescription] = useState('');
  const [issueOn, setIssueOn] = useState(new Date().toISOString().split('T')[0]);
  const [dueOn, setDueOn] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [planAccountId, setPlanAccountId] = useState(NONE);

  const { data: personsResponse } = useQuery({
    queryKey: ['personsList', 'payable', 'fornecedor'],
    queryFn: () =>
      personsService.list({
        page: 1,
        limit: 100,
        sortField: 'name',
        sortOrder: 'asc',
        type: 'fornecedor',
      }),
  });
  const persons = personsResponse?.data;

  const { data: planAccounts = [] } = useQuery({
    queryKey: ['financial', 'plan-accounts'],
    queryFn: () => financialService.listPlanAccounts(),
  });

  const mutation = useMutation({
    mutationFn: financialService.create.bind(null, 'payable'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial', 'payable'] });
      toast.success('Conta a pagar lançada com sucesso!');
      onSuccess();
    },
    onError: (err: Error) => toast.error(`Erro: ${err.message}`),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!personId || !description || !amountStr || !dueOn) return;

    const installmentAmount = Math.round(parseFloat(amountStr.replace(',', '.')) * 100);

    mutation.mutate({
      personId,
      documentNumber: documentNumber || undefined,
      description,
      issueOn: issueOn || undefined,
      installmentAmount,
      dueOn,
      planAccountId: planAccountId === NONE ? undefined : planAccountId,
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="max-h-[70vh] space-y-4 overflow-y-auto pr-1 pt-2"
    >
      <div className="space-y-1">
        <Label>Fornecedor / Favorecido</Label>
        <Select value={personId} onValueChange={setPersonId} required>
          <SelectTrigger>
            <SelectValue placeholder="Selecione um fornecedor..." />
          </SelectTrigger>
          <SelectContent>
            {persons?.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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

      <Button type="submit" className="mt-2 w-full" disabled={mutation.isPending}>
        {mutation.isPending ? 'Salvando...' : 'Confirmar Lançamento'}
      </Button>
    </form>
  );
}
