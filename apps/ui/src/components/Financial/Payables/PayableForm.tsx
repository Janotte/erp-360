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

export function PayableForm({ onSuccess }: PayableFormProps) {
  const queryClient = useQueryClient();
  const [personId, setPersonId] = useState('');
  const [document, setDocument] = useState('');
  const [description, setDescription] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [dueDate, setDueDate] = useState('');

  const { data: personsResponse } = useQuery({
    queryKey: ['personsList', 'payable'],
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

  const mutation = useMutation({
    mutationFn: (data: any) => financialService.create('payable', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial', 'payable'] });
      toast.success('Conta a pagar lançada com sucesso!');
      onSuccess();
    },
    onError: (err: any) => toast.error(`Erro: ${err.message}`),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!personId || !description || !amountStr || !dueDate) return;

    const amountCentavos = Math.round(parseFloat(amountStr.replace(',', '.')) * 100);

    mutation.mutate({
      personId,
      document: document || undefined,
      description,
      amount: amountCentavos,
      dueDate,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-2">
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

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="document">Nº Documento / NF</Label>
          <Input
            id="document"
            value={document}
            onChange={(e) => setDocument(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="dueDate">Vencimento</Label>
          <Input
            id="dueDate"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="description">Descrição</Label>
        <Input
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="amount">Valor Original (R\$)</Label>
        <Input
          id="amount"
          type="number"
          step="0.01"
          value={amountStr}
          onChange={(e) => setAmountStr(e.target.value)}
          required
        />
      </div>

      <Button type="submit" className="w-full mt-2" disabled={mutation.isPending}>
        {mutation.isPending ? 'Salvando...' : 'Confirmar Lançamento'}
      </Button>
    </form>
  );
}
