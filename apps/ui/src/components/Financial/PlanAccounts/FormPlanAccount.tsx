import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  type PlanAccount,
  type PlanAccountInput,
  planAccountsService,
} from '@/services/planAccounts';

interface FormPlanAccountProps {
  accountToUpdate?: PlanAccount | null;
  onSuccess?: () => void;
}

export function FormPlanAccount({ accountToUpdate, onSuccess }: FormPlanAccountProps) {
  const queryClient = useQueryClient();
  const [accountId, setAccountId] = useState(accountToUpdate?.id);
  const [accountCode, setAccountCode] = useState('');
  const [name, setName] = useState('');
  const [accountingDescription, setAccountingDescription] = useState('');
  const [accountIdentifier, setAccountIdentifier] = useState('');
  const [accountingAccountCode, setAccountingAccountCode] = useState('');

  const { data: accountLoaded } = useQuery({
    queryKey: ['plan-account', accountId],
    enabled: Boolean(accountId),
    staleTime: 0,
    queryFn: () => planAccountsService.get(accountId!),
  });

  useEffect(() => {
    if (!accountLoaded && !accountToUpdate) return;
    const account = { ...accountToUpdate, ...accountLoaded };
    setAccountCode(account.accountCode ?? '');
    setName(account.name ?? '');
    setAccountingDescription(account.accountingDescription || '');
    setAccountIdentifier(account.accountIdentifier || '');
    setAccountingAccountCode(account.accountingAccountCode || '');
  }, [accountLoaded, accountToUpdate]);

  const mutation = useMutation({
    mutationFn: (dados: PlanAccountInput) =>
      accountId
        ? planAccountsService.update(accountId, dados)
        : planAccountsService.create(dados),
    onSuccess: (saved) => {
      const created = !accountId;
      setAccountId(saved.id);
      queryClient.setQueryData(['plan-account', saved.id], saved);
      queryClient.invalidateQueries({ queryKey: ['listaPlanAccounts'] });
      queryClient.invalidateQueries({ queryKey: ['financial', 'plan-accounts'] });
      onSuccess?.();
      toast.success(
        created
          ? 'Plano de contas cadastrado com sucesso!'
          : 'Plano de contas atualizado com sucesso!',
      );
    },
    onError: (error) => {
      toast.error(`Falha ao salvar: ${error.message || 'Erro inesperado'}`);
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      accountCode,
      name,
      accountingDescription: accountingDescription || null,
      accountIdentifier: accountIdentifier || null,
      accountingAccountCode: accountingAccountCode || null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-2">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="accountCode">Código</Label>
          <Input
            id="accountCode"
            value={accountCode}
            maxLength={30}
            onChange={(e) => setAccountCode(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="accountIdentifier">Identificador</Label>
          <Input
            id="accountIdentifier"
            value={accountIdentifier}
            maxLength={10}
            onChange={(e) => setAccountIdentifier(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="name">Nome</Label>
        <Input
          id="name"
          value={name}
          maxLength={120}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="accountingDescription">Descrição contábil</Label>
        <Input
          id="accountingDescription"
          value={accountingDescription}
          maxLength={60}
          onChange={(e) => setAccountingDescription(e.target.value)}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="accountingAccountCode">Código contábil</Label>
        <Input
          id="accountingAccountCode"
          value={accountingAccountCode}
          maxLength={20}
          onChange={(e) => setAccountingAccountCode(e.target.value)}
        />
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Salvando...' : accountId ? 'Atualizar' : 'Cadastrar'}
        </Button>
      </div>
    </form>
  );
}
