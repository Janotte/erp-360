import {
  dreLinesForNature,
  type PlanAccountDreLine,
  planAccountDreLineLabels,
  planAccountDreLines,
  type PlanAccountNature,
  planAccountNatureLabels,
  planAccountNatures,
} from '@erp-360/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { FloatingInput, FloatingSelect } from '@/components/ui/FloatingField';
import {
  type PlanAccount,
  type PlanAccountInput,
  planAccountsService,
} from '@/services/planAccounts';

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

export function FormPlanAccount({
  accountToUpdate,
  onSuccess,
  onCancel,
  onDeleted,
}: {
  accountToUpdate?: PlanAccount | null;
  onSuccess?: () => void;
  onCancel?: () => void;
  onDeleted?: () => void;
}) {
  const queryClient = useQueryClient();
  const accountId = accountToUpdate?.id;
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
  const [openDelete, setOpenDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (dados: PlanAccountInput) =>
      accountId
        ? planAccountsService.update(accountId, dados)
        : planAccountsService.create(dados),
    onSuccess: (saved) => {
      queryClient.setQueryData(['plan-account', saved.id], saved);
      queryClient.invalidateQueries({ queryKey: ['listaPlanAccounts'] });
      queryClient.invalidateQueries({ queryKey: ['financial', 'plan-accounts'] });
      toast.success(
        accountId
          ? 'Plano de contas atualizado com sucesso!'
          : 'Plano de contas cadastrado com sucesso!',
      );
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Falha ao salvar o plano de contas.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => planAccountsService.delete(accountId ?? ''),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['listaPlanAccounts'] });
      queryClient.invalidateQueries({ queryKey: ['financial', 'plan-accounts'] });
      toast.success('Plano de contas removido com sucesso!');
      onDeleted?.();
    },
    onError: (error: Error) => setDeleteError(error.message),
  });

  const dreLines =
    nature === 'revenue' || nature === 'expense' ? dreLinesForNature(nature) : [];
  const busy = mutation.isPending || deleteMutation.isPending;

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!accountCode.trim()) {
          toast.error('Informe o código.');
          return;
        }
        if (!name.trim()) {
          toast.error('Informe o nome.');
          return;
        }
        if (!nature) {
          toast.error('Informe a natureza.');
          return;
        }
        if (dreLines.length > 0 && !dreLine) {
          toast.error('Informe a linha da DRE.');
          return;
        }
        mutation.mutate({
          accountCode,
          name,
          nature,
          dreLine: dreLines.length > 0 ? dreLine || null : null,
          acceptsEntries,
          isTreasury: nature === 'asset' ? isTreasury : false,
          parentAccountCode: parentAccountCode || null,
          isActive,
          accountingDescription: accountingDescription || null,
          accountIdentifier: accountIdentifier || null,
          accountingAccountCode: accountingAccountCode || null,
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FloatingInput
          label="Código"
          value={accountCode}
          maxLength={15}
          onChange={(event) => setAccountCode(event.target.value)}
          required
          autoFocus
        />
        <FloatingSelect
          label="Natureza"
          value={nature}
          pinned={Boolean(nature)}
          required
          onChange={(event) => {
            const next = parseNature(event.target.value);
            setNature(next);
            if (
              !next ||
              !dreLinesForNature(next).includes(dreLine as PlanAccountDreLine)
            ) {
              setDreLine('');
            }
            if (next !== 'asset') setIsTreasury(false);
          }}
        >
          <option value="" disabled>
            Selecione a natureza
          </option>
          {planAccountNatures.map((item) => (
            <option key={item} value={item}>
              {planAccountNatureLabels[item]}
            </option>
          ))}
        </FloatingSelect>
        <FloatingInput
          label="Conta pai"
          value={parentAccountCode}
          maxLength={15}
          onChange={(event) => setParentAccountCode(event.target.value)}
        />
        <FloatingInput
          label="Identificador"
          value={accountIdentifier}
          maxLength={10}
          onChange={(event) => setAccountIdentifier(event.target.value)}
        />
      </div>

      {dreLines.length > 0 ? (
        <FloatingSelect
          label="Linha da DRE"
          value={dreLine}
          pinned={Boolean(dreLine)}
          required
          onChange={(event) => setDreLine(parseDreLine(event.target.value))}
        >
          <option value="" disabled>
            Selecione a linha
          </option>
          {dreLines.map((line) => (
            <option key={line} value={line}>
              {planAccountDreLineLabels[line]}
            </option>
          ))}
        </FloatingSelect>
      ) : null}

      <FloatingInput
        label="Nome"
        value={name}
        maxLength={120}
        onChange={(event) => setName(event.target.value)}
        required
      />
      <FloatingInput
        label="Descrição contábil"
        value={accountingDescription}
        maxLength={60}
        onChange={(event) => setAccountingDescription(event.target.value)}
      />
      <FloatingInput
        label="Código contábil"
        value={accountingAccountCode}
        maxLength={20}
        onChange={(event) => setAccountingAccountCode(event.target.value)}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <FloatingSelect
          label="Recebe lançamento"
          value={acceptsEntries ? 'sim' : 'nao'}
          pinned
          onChange={(event) => setAcceptsEntries(event.target.value === 'sim')}
        >
          <option value="sim">Sim</option>
          <option value="nao">Não</option>
        </FloatingSelect>
        {nature === 'asset' ? (
          <FloatingSelect
            label="Conta de caixa ou banco"
            value={isTreasury ? 'sim' : 'nao'}
            pinned
            onChange={(event) => setIsTreasury(event.target.value === 'sim')}
          >
            <option value="sim">Sim</option>
            <option value="nao">Não</option>
          </FloatingSelect>
        ) : null}
        <FloatingSelect
          label="Situação"
          value={isActive ? 'ativo' : 'inativo'}
          pinned
          onChange={(event) => setIsActive(event.target.value === 'ativo')}
        >
          <option value="ativo">Ativo</option>
          <option value="inativo">Inativo</option>
        </FloatingSelect>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
        ) : null}
        {accountId && onDeleted ? (
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={() => {
              setDeleteError(null);
              setOpenDelete(true);
            }}
          >
            Excluir
          </Button>
        ) : null}
        <Button type="submit" disabled={busy}>
          {mutation.isPending ? 'Salvando...' : accountId ? 'Atualizar' : 'Cadastrar'}
        </Button>
      </div>

      <AlertDialog open={openDelete} onOpenChange={setOpenDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir plano de contas</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteError ??
                `Deseja excluir ${name || 'esta conta'}? Essa ação não pode ser desfeita.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteMutation.isPending || !!deleteError}
              onClick={(event) => {
                event.preventDefault();
                deleteMutation.mutate();
              }}
            >
              {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
