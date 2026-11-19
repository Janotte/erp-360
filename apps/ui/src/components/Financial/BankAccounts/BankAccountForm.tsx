import {
  formatCurrencyInput,
  maskCurrencyInput,
  parseCurrencyToCents,
} from '@erp-360/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { CatalogSearchSelect } from '@/components/ui/CatalogSearchSelect';
import { FloatingInput, FloatingSelect } from '@/components/ui/FloatingField';
import { financialService } from '@/services/financials';
import {
  type BankAccount,
  type BankAccountKind,
  treasuryService,
} from '@/services/treasury';

function accountKind(account: Pick<BankAccount, 'kind'>): BankAccountKind {
  return account.kind === 'investment' ? 'investment' : 'operating';
}

export function BankAccountForm({
  accountToUpdate,
  initialKind,
  onCancel,
  onSuccess,
}: {
  accountToUpdate: BankAccount | null;
  initialKind: BankAccountKind;
  onCancel: () => void;
  onSuccess: (account: BankAccount) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(accountToUpdate?.name ?? '');
  const [branchNumber, setBranchNumber] = useState(accountToUpdate?.branchNumber ?? '');
  const [accountCode, setAccountCode] = useState(accountToUpdate?.accountCode ?? '');
  const [planAccountId, setPlanAccountId] = useState(
    accountToUpdate?.planAccountId ?? '',
  );
  const [kind, setKind] = useState<BankAccountKind>(
    accountToUpdate ? accountKind(accountToUpdate) : initialKind,
  );
  const [openingOn, setOpeningOn] = useState(accountToUpdate?.openingOn ?? '');
  const [openingAmountStr, setOpeningAmountStr] = useState(
    accountToUpdate?.openingAmount
      ? formatCurrencyInput(accountToUpdate.openingAmount)
      : '',
  );

  const planAccounts = useQuery({
    queryKey: ['financial', 'plan-accounts', 'treasury'],
    queryFn: () =>
      financialService.listPlanAccounts({ isTreasury: true, acceptsEntries: true }),
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        name,
        branchNumber: branchNumber || undefined,
        accountCode: accountCode || undefined,
        planAccountId: planAccountId || undefined,
        kind,
        openingOn: openingOn || null,
        openingAmount: parseCurrencyToCents(openingAmountStr),
      };
      return accountToUpdate
        ? treasuryService.updateBankAccount(accountToUpdate.id, payload)
        : treasuryService.createBankAccount(payload);
    },
    onSuccess: (account) => {
      queryClient.invalidateQueries({ queryKey: ['treasury'] });
      toast.success(
        accountToUpdate ? 'Conta bancária atualizada.' : 'Conta bancária cadastrada.',
      );
      onSuccess(account);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim()) {
          toast.error('Informe o nome da conta.');
          return;
        }
        if (parseCurrencyToCents(openingAmountStr) !== 0 && !openingOn) {
          toast.error('Informe a data do saldo inicial.');
          return;
        }
        saveMutation.mutate();
      }}
    >
      <FloatingInput
        label="Nome"
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={60}
        required
        autoFocus
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <FloatingInput
          label="Agência"
          value={branchNumber}
          onChange={(event) => setBranchNumber(event.target.value)}
          maxLength={10}
        />
        <FloatingInput
          label="Conta"
          value={accountCode}
          onChange={(event) => setAccountCode(event.target.value)}
          maxLength={16}
        />
      </div>
      <FloatingSelect
        label="Tipo"
        value={kind}
        pinned
        onChange={(event) => setKind(event.target.value as BankAccountKind)}
      >
        <option value="operating">Conta corrente (entra no fluxo de caixa)</option>
        <option value="investment">Investimento (fora do fluxo de caixa)</option>
      </FloatingSelect>
      <CatalogSearchSelect
        label="Plano de contas"
        value={planAccountId}
        onChange={setPlanAccountId}
        options={planAccounts.data ?? []}
        placeholder="Conta bancária no plano"
        isLoading={planAccounts.isLoading}
        allowClear
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <FloatingInput
          label="Data do saldo inicial"
          type="date"
          value={openingOn}
          onChange={(event) => setOpeningOn(event.target.value)}
        />
        <FloatingInput
          label="Saldo inicial (R$)"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="0,00"
          pinned
          value={openingAmountStr}
          onChange={(event) => setOpeningAmountStr(maskCurrencyInput(event.target.value))}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={saveMutation.isPending}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={saveMutation.isPending}>
          {saveMutation.isPending
            ? 'Salvando...'
            : accountToUpdate
              ? 'Atualizar'
              : 'Cadastrar'}
        </Button>
      </div>
    </form>
  );
}
