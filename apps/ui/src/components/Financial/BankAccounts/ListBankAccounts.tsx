import {
  formatCurrency,
  formatCurrencyInput,
  formatRawDate,
  maskCurrencyInput,
  parseCurrencyToCents,
} from '@erp-360/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { CatalogSearchSelect } from '@/components/ui/CatalogSearchSelect';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { financialService } from '@/services/financials';
import {
  type BankAccount,
  type BankAccountKind,
  type TreasuryEntry,
  treasuryService,
} from '@/services/treasury';

import { InvestmentEntryModal } from './InvestmentEntryModal';
import { TransferModal, type TransferMode } from './TransferModal';

function accountKind(account: Pick<BankAccount, 'kind'>): BankAccountKind {
  return account.kind === 'investment' ? 'investment' : 'operating';
}

function canDeleteInvestmentEntry(entry: TreasuryEntry) {
  return (
    !entry.openingBalance &&
    !entry.transferId &&
    !entry.settlementId &&
    !entry.receivableId &&
    !entry.payableId &&
    !entry.reconciled
  );
}

export function ListBankAccounts() {
  const queryClient = useQueryClient();
  const [accountTab, setAccountTab] = useState<BankAccountKind>('operating');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openForm, setOpenForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [branchNumber, setBranchNumber] = useState('');
  const [accountCode, setAccountCode] = useState('');
  const [planAccountId, setPlanAccountId] = useState('');
  const [kind, setKind] = useState<BankAccountKind>('operating');
  const [openingOn, setOpeningOn] = useState('');
  const [openingAmountStr, setOpeningAmountStr] = useState('');
  const [transferMode, setTransferMode] = useState<TransferMode | null>(null);
  const [reverseTransferId, setReverseTransferId] = useState<string | null>(null);
  const [openEntry, setOpenEntry] = useState(false);
  const [deleteEntryId, setDeleteEntryId] = useState<string | null>(null);

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setBranchNumber('');
    setAccountCode('');
    setPlanAccountId('');
    setKind('operating');
    setOpeningOn('');
    setOpeningAmountStr('');
  };

  const openCreate = () => {
    resetForm();
    setKind(accountTab);
    setOpenForm(true);
  };

  const openEdit = (account: BankAccount) => {
    setEditingId(account.id);
    setName(account.name);
    setBranchNumber(account.branchNumber ?? '');
    setAccountCode(account.accountCode ?? '');
    setPlanAccountId(account.planAccountId ?? '');
    setKind(account.kind ?? 'operating');
    setOpeningOn(account.openingOn ?? '');
    setOpeningAmountStr(
      account.openingAmount ? formatCurrencyInput(account.openingAmount) : '',
    );
    setOpenForm(true);
  };

  const accountPayload = () => ({
    name,
    branchNumber: branchNumber || undefined,
    accountCode: accountCode || undefined,
    planAccountId: planAccountId || undefined,
    kind,
    openingOn: openingOn || null,
    openingAmount: parseCurrencyToCents(openingAmountStr),
  });

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['treasury', 'bank-accounts'],
    queryFn: treasuryService.bankAccounts,
  });

  const selected: BankAccount | undefined = accounts.find((item) => item.id === selectedId);
  const selectedOnTab =
    selected && accountKind(selected) === accountTab ? selected : undefined;

  const { data: bankPlanAccounts = [] } = useQuery({
    queryKey: ['financial', 'plan-accounts', 'treasury'],
    queryFn: () =>
      financialService.listPlanAccounts({ isTreasury: true, acceptsEntries: true }),
  });

  const { data: statement } = useQuery({
    queryKey: ['treasury', 'bank-entries', selectedOnTab?.id],
    queryFn: () => treasuryService.bankEntries(selectedOnTab!.id),
    enabled: Boolean(selectedOnTab),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      editingId
        ? treasuryService.updateBankAccount(editingId, accountPayload())
        : treasuryService.createBankAccount(accountPayload()),
    onSuccess: (account) => {
      queryClient.invalidateQueries({ queryKey: ['treasury'] });
      setOpenForm(false);
      resetForm();
      setAccountTab(accountKind(account));
      setSelectedId(account.id);
      toast.success(editingId ? 'Conta bancária atualizada.' : 'Conta bancária cadastrada.');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const reconcileMutation = useMutation({
    mutationFn: ({ id, reconciled }: { id: string; reconciled: boolean }) =>
      treasuryService.reconcile(id, reconciled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['treasury', 'bank-entries', selectedId] });
      toast.success('Conciliação atualizada.');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteEntryMutation = useMutation({
    mutationFn: (id: string) => treasuryService.deleteInvestmentEntry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['treasury'] });
      queryClient.invalidateQueries({ queryKey: ['listaPlanAccounts'] });
      setDeleteEntryId(null);
      toast.success('Lançamento excluído.');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const reverseMutation = useMutation({
    mutationFn: (id: string) => treasuryService.reverseTransfer(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['treasury'] });
      setReverseTransferId(null);
      toast.success('Transferência estornada.');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const visibleAccounts = accounts.filter((item) => accountKind(item) === accountTab);
  const tabBalance = visibleAccounts.reduce((sum, item) => sum + (item.balance ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-zinc-900">Contas bancárias</h3>
          <p className="text-sm text-zinc-500">
            {accountTab === 'investment'
              ? 'Aplicações fora do fluxo de caixa.'
              : 'Contas que entram no fluxo de caixa.'}
          </p>
          <p className="mt-1 text-xs text-zinc-500">Saldo {formatCurrency(tabBalance)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setTransferMode('transfer')}>
            Transferir
          </Button>
          <Button variant="outline" size="sm" onClick={() => setTransferMode('apply')}>
            Aplicar
          </Button>
          <Button variant="outline" size="sm" onClick={() => setTransferMode('redeem')}>
            Resgatar
          </Button>
          <Button size="sm" onClick={openCreate}>
            Nova conta
          </Button>
        </div>
      </div>

      <Tabs
        value={accountTab}
        onValueChange={(value) => setAccountTab(value as BankAccountKind)}
      >
        <TabsList>
          <TabsTrigger value="operating">Contas corrente</TabsTrigger>
          <TabsTrigger value="investment">Investimentos</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <div className="rounded-md border bg-white">
          {isLoading ? (
            <p className="p-4 text-sm text-zinc-500">Carregando contas...</p>
          ) : visibleAccounts.length ? (
            visibleAccounts.map((account) => (
              <button
                key={account.id}
                type="button"
                className={`flex w-full flex-col items-start border-b px-4 py-3 text-left last:border-b-0 ${
                  selectedId === account.id ? 'bg-zinc-100' : 'hover:bg-zinc-50'
                }`}
                onClick={() => setSelectedId(account.id)}
              >
                <span className="font-medium">{account.name}</span>
                <span className="text-sm tabular-nums text-zinc-500">
                  {formatCurrency(account.balance ?? 0)}
                </span>
              </button>
            ))
          ) : (
            <p className="p-4 text-sm text-zinc-500">
              {accountTab === 'investment'
                ? 'Nenhuma conta de investimento cadastrada.'
                : 'Nenhuma conta corrente cadastrada.'}
            </p>
          )}
        </div>

        <div className="rounded-md border bg-white">
          {selectedOnTab && statement?.account.id === selectedOnTab.id ? (
            <>
              <div className="flex items-center justify-between border-b px-4 py-3">
                <div>
                  <p className="font-medium">{statement.account.name}</p>
                  <p className="text-sm text-zinc-500">
                    {statement.account.kind === 'investment' ? 'Investimento' : 'Conta corrente'} ·
                    Saldo {formatCurrency(statement.account.balance ?? 0)}
                  </p>
                </div>
                <div className="flex gap-2">
                  {statement.account.kind === 'investment' ? (
                    <Button size="sm" onClick={() => setOpenEntry(true)}>
                      Lançar
                    </Button>
                  ) : null}
                  <Button variant="outline" size="sm" onClick={() => openEdit(selectedOnTab)}>
                    Editar
                  </Button>
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Histórico</TableHead>
                    <TableHead className="text-right">Entrada</TableHead>
                    <TableHead className="text-right">Saída</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                    <TableHead>Conciliação</TableHead>
                    <TableHead className="w-[100px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {statement.entries.length ? (
                    statement.entries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>{formatRawDate(entry.occurredOn)}</TableCell>
                        <TableCell>{entry.description}</TableCell>
                        <TableCell className="text-right tabular-nums text-emerald-600">
                          {entry.inflowAmount ? formatCurrency(entry.inflowAmount) : '-'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-red-600">
                          {entry.outflowAmount ? formatCurrency(entry.outflowAmount) : '-'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(entry.balance)}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              reconcileMutation.mutate({
                                id: entry.id,
                                reconciled: !entry.reconciled,
                              })
                            }
                          >
                            {entry.reconciled ? 'Conciliado' : 'Conciliar'}
                          </Button>
                        </TableCell>
                        <TableCell className="text-right">
                          {entry.transferId ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setReverseTransferId(entry.transferId!)}
                            >
                              Estornar
                            </Button>
                          ) : null}
                          {statement.account.kind === 'investment' &&
                          canDeleteInvestmentEntry(entry) ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setDeleteEntryId(entry.id)}
                            >
                              Excluir
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                        <TableCell colSpan={7} className="text-center py-4 text-zinc-500">
                        Nenhum lançamento nesta conta.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </>
          ) : (
            <p className="p-6 text-sm text-zinc-500">Selecione uma conta para ver o extrato.</p>
          )}
        </div>
      </div>

      <AlertDialog
        open={Boolean(reverseTransferId)}
        onOpenChange={(open) => {
          if (!open) setReverseTransferId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Estornar transferência</AlertDialogTitle>
            <AlertDialogDescription>
              Os dois lançamentos desta transferência serão excluídos e os saldos recalculados.
              Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 hover:bg-amber-700"
              disabled={reverseMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (reverseTransferId) reverseMutation.mutate(reverseTransferId);
              }}
            >
              {reverseMutation.isPending ? 'Estornando...' : 'Estornar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(deleteEntryId)}
        onOpenChange={(open) => {
          if (!open) setDeleteEntryId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lançamento</AlertDialogTitle>
            <AlertDialogDescription>
              O lançamento será removido do extrato e o saldo da conta de investimento será
              recalculado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteEntryMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (deleteEntryId) deleteEntryMutation.mutate(deleteEntryId);
              }}
            >
              {deleteEntryMutation.isPending ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={openEntry}
        onOpenChange={setOpenEntry}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lançar na conta de investimento</DialogTitle>
          </DialogHeader>
          {selectedId ? (
            <InvestmentEntryModal
              key={selectedId}
              bankAccountId={selectedId}
              onSuccess={() => setOpenEntry(false)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={openForm}
        onOpenChange={(open) => {
          setOpenForm(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar conta bancária' : 'Nova conta bancária'}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (parseCurrencyToCents(openingAmountStr) !== 0 && !openingOn) {
                toast.error('Informe a data do saldo inicial.');
                return;
              }
              saveMutation.mutate();
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="bankName">Nome</Label>
              <Input
                id="bankName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="branchNumber">Agência</Label>
                <Input
                  id="branchNumber"
                  value={branchNumber}
                  onChange={(e) => setBranchNumber(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="accountCode">Conta</Label>
                <Input
                  id="accountCode"
                  value={accountCode}
                  onChange={(e) => setAccountCode(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="bankKind">Tipo</Label>
              <select
                id="bankKind"
                value={kind}
                onChange={(e) => setKind(e.target.value as BankAccountKind)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                <option value="operating">Conta corrente (entra no fluxo de caixa)</option>
                <option value="investment">Investimento (fora do fluxo de caixa)</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>Plano de contas</Label>
              <CatalogSearchSelect
                value={planAccountId}
                onChange={setPlanAccountId}
                options={bankPlanAccounts}
                placeholder="Conta bancária no plano"
                allowClear
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="openingOn">Data do saldo inicial</Label>
                <Input
                  id="openingOn"
                  type="date"
                  value={openingOn}
                  onChange={(e) => setOpeningOn(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="openingAmount">Saldo inicial (R$)</Label>
                <Input
                  id="openingAmount"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="0,00"
                  value={openingAmountStr}
                  onChange={(e) => setOpeningAmountStr(maskCurrencyInput(e.target.value))}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? 'Salvando...' : editingId ? 'Salvar' : 'Cadastrar'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(transferMode)}
        onOpenChange={(open) => {
          if (!open) setTransferMode(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {transferMode === 'apply'
                ? 'Aplicar'
                : transferMode === 'redeem'
                  ? 'Resgatar'
                  : 'Transferir'}
            </DialogTitle>
          </DialogHeader>
          {transferMode ? (
            <TransferModal
              key={transferMode}
              mode={transferMode}
              accounts={accounts}
              onSuccess={() => setTransferMode(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
