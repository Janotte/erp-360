import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  type PlanAccount,
  type PlanAccountInput,
  type PlanAccountType,
  planAccountTypeLabels,
  planAccountTypes,
  planAccountsService,
} from '@/services/planAccounts';

function parsePlanAccountType(value: unknown): PlanAccountType | '' {
  return planAccountTypes.includes(value as PlanAccountType)
    ? (value as PlanAccountType)
    : '';
}

interface FormPlanAccountProps {
  accountToUpdate?: PlanAccount | null;
  onSuccess?: () => void;
}

export function FormPlanAccount({ accountToUpdate, onSuccess }: FormPlanAccountProps) {
  const queryClient = useQueryClient();
  const [accountId, setAccountId] = useState(accountToUpdate?.id);
  const [accountCode, setAccountCode] = useState(accountToUpdate?.accountCode ?? '');
  const [name, setName] = useState(accountToUpdate?.name ?? '');
  const [type, setType] = useState<PlanAccountType | ''>(
    parsePlanAccountType(accountToUpdate?.type),
  );
  const [parentAccountCode, setParentAccountCode] = useState(
    accountToUpdate?.parentAccountCode || '',
  );
  const [isActive, setIsActive] = useState(accountToUpdate?.isActive !== false);
  const [accountingDescription, setAccountingDescription] = useState(
    accountToUpdate?.accountingDescription || '',
  );
  const [accountIdentifier, setAccountIdentifier] = useState(
    accountToUpdate?.accountIdentifier || '',
  );
  const [accountingAccountCode, setAccountingAccountCode] = useState(
    accountToUpdate?.accountingAccountCode || '',
  );

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
    setType(parsePlanAccountType(account.type));
    setParentAccountCode(account.parentAccountCode || '');
    setIsActive(account.isActive !== false);
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
    if (!type) return;
    mutation.mutate({
      accountCode,
      name,
      type,
      parentAccountCode: parentAccountCode || null,
      isActive,
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
            maxLength={10}
            onChange={(e) => setAccountCode(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="planAccountType">Tipo</Label>
          <select
            id="planAccountType"
            value={type}
            onChange={(event) => setType(parsePlanAccountType(event.target.value))}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            required
          >
            <option value="" disabled>
              Selecione o tipo
            </option>
            {planAccountTypes.map((planType) => (
              <option key={planType} value={planType}>
                {planAccountTypeLabels[planType]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="parentAccountCode">Conta pai</Label>
          <Input
            id="parentAccountCode"
            value={parentAccountCode}
            maxLength={10}
            onChange={(e) => setParentAccountCode(e.target.value)}
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

      <div className="flex items-center space-x-2">
        <Checkbox
          id="isActive"
          checked={isActive}
          onCheckedChange={(v) => setIsActive(!!v)}
        />
        <label htmlFor="isActive" className="text-sm font-medium">
          Ativo
        </label>
      </div>

      {mutation.isError && (
        <p className="text-sm font-medium text-destructive bg-destructive/10 p-3 rounded-md">
          {mutation.error.message}
        </p>
      )}

      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Salvando...' : accountId ? 'Atualizar' : 'Cadastrar'}
        </Button>
      </div>
    </form>
  );
}
