import {
  dreLinesForNature,
  type PlanAccountDreLine,
  planAccountDreLineLabels,
  planAccountDreLines,
  type PlanAccountNature,
  planAccountNatureLabels,
  planAccountNatures,
} from '@erp-360/shared';
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
  planAccountsService,
} from '@/services/planAccounts';

const selectClassName =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

function parseNature(value: unknown): PlanAccountNature | '' {
  return planAccountNatures.includes(value as PlanAccountNature)
    ? (value as PlanAccountNature)
    : '';
}

function parseDreLine(value: unknown): PlanAccountDreLine | '' {
  return planAccountDreLines.includes(value as PlanAccountDreLine)
    ? (value as PlanAccountDreLine)
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
  const [nature, setNature] = useState<PlanAccountNature | ''>(
    parseNature(accountToUpdate?.nature),
  );
  const [dreLine, setDreLine] = useState<PlanAccountDreLine | ''>(
    parseDreLine(accountToUpdate?.dreLine),
  );
  const [acceptsEntries, setAcceptsEntries] = useState(
    accountToUpdate?.acceptsEntries !== false,
  );
  const [isTreasury, setIsTreasury] = useState(accountToUpdate?.isTreasury === true);
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
    setNature(parseNature(account.nature));
    setDreLine(parseDreLine(account.dreLine));
    setAcceptsEntries(account.acceptsEntries !== false);
    setIsTreasury(account.isTreasury === true);
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
    if (!nature) return;
    const allowedLines = dreLinesForNature(nature);
    if (allowedLines.length > 0 && !dreLine) return;
    mutation.mutate({
      accountCode,
      name,
      nature,
      dreLine: allowedLines.length > 0 ? dreLine || null : null,
      acceptsEntries,
      isTreasury: nature === 'asset' ? isTreasury : false,
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
            maxLength={15}
            onChange={(e) => setAccountCode(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="planAccountNature">Natureza</Label>
          <select
            id="planAccountNature"
            value={nature}
            onChange={(event) => {
              const next = parseNature(event.target.value);
              setNature(next);
              if (!next || !dreLinesForNature(next).includes(dreLine as PlanAccountDreLine)) {
                setDreLine('');
              }
              if (next !== 'asset') setIsTreasury(false);
            }}
            className={selectClassName}
            required
          >
            <option value="" disabled>
              Selecione a natureza
            </option>
            {planAccountNatures.map((item) => (
              <option key={item} value={item}>
                {planAccountNatureLabels[item]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="parentAccountCode">Conta pai</Label>
          <Input
            id="parentAccountCode"
            value={parentAccountCode}
            maxLength={15}
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

      {nature === 'revenue' || nature === 'expense' ? (
        <div className="space-y-1">
          <Label htmlFor="planAccountDreLine">Linha da DRE</Label>
          <select
            id="planAccountDreLine"
            value={dreLine}
            onChange={(event) => setDreLine(parseDreLine(event.target.value))}
            className={selectClassName}
            required
          >
            <option value="" disabled>
              Selecione a linha
            </option>
            {dreLinesForNature(nature).map((line) => (
              <option key={line} value={line}>
                {planAccountDreLineLabels[line]}
              </option>
            ))}
          </select>
        </div>
      ) : null}

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

      <div className="flex flex-col gap-3">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="acceptsEntries"
            checked={acceptsEntries}
            onCheckedChange={(v) => setAcceptsEntries(!!v)}
          />
          <label htmlFor="acceptsEntries" className="text-sm font-medium">
            Recebe lançamento
          </label>
        </div>
        {nature === 'asset' ? (
          <div className="flex items-center space-x-2">
            <Checkbox
              id="isTreasury"
              checked={isTreasury}
              onCheckedChange={(v) => setIsTreasury(!!v)}
            />
            <label htmlFor="isTreasury" className="text-sm font-medium">
              Conta de caixa ou banco
            </label>
          </div>
        ) : null}
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
