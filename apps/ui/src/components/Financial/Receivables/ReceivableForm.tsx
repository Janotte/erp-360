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

import { financialService } from '../../../services/financials';
import { personsService } from '../../../services/persons';

interface ReceivableFormProps {
  onSuccess: () => void;
}

export function ReceivableForm({ onSuccess }: ReceivableFormProps) {
  const queryClient = useQueryClient();
  const [personId, setPersonId] = useState('');
  const [document, setDocument] = useState('');
  const [description, setDescription] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [dueDate, setDueDate] = useState('');

  const { data: personsResponse } = useQuery({
    queryKey: ['personList', 'receivable'],
    queryFn: () =>
      personsService.list({
        page: 1,
        limit: 100,
        sortField: 'name',
        sortOrder: 'asc',
        type: 'cliente',
      }),
  });
  const persons = personsResponse?.data;

  const mutation = useMutation({
    mutationFn: (dados: any) => financialService.create('receivable', dados),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial', 'receivable'] });
      toast.success('Conta a receber lançada com sucesso!');
      onSuccess();
    },
    onError: (err: any) => toast.error(`Erro: ${err.message}`),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!personId || !description || !amountStr || !dueDate) return;

    const amount = Math.round(parseFloat(amountStr.replace(',', '.')) * 100);

    mutation.mutate({
      personId,
      document: document || undefined,
      description,
      amount,
      dueDate,
      // Enviar novos campos futuramente aqui
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-2">
      <div className="space-y-1">
        <Label>Cliente</Label>
        <Select value={personId} onValueChange={setPersonId} required>
          <SelectTrigger>
            <SelectValue placeholder="Selecione um cliente..." />
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
          <Label htmlFor="document">Nº Fatura / Contrato</Label>
          <Input
            id="document"
            value={document}
            onChange={(e) => setDocument(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="dueDate">Previsão de Recebimento</Label>
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
        <Label htmlFor="description">Descrição da Venda / Serviço</Label>
        <Input
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="amount">Valor a Receber (R\$)</Label>
        <Input
          id="amount"
          type="number"
          step="0.01"
          value={amountStr}
          onChange={(e) => setAmountStr(e.target.value)}
          required
        />
      </div>

      {/* Injetar novas inputs visuais de boletos ou cobranças futuramente aqui */}

      <Button
        type="submit"
        className="w-full mt-2 bg-zinc-900 text-white hover:bg-zinc-800"
        disabled={mutation.isPending}
      >
        {mutation.isPending ? 'Salvando...' : 'Confirmar Lançamento'}
      </Button>
    </form>
  );
}
