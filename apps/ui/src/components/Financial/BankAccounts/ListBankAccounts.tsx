import { formatCurrency, formatRawDate } from '@erp-360/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { CatalogSearchSelect } from '@/components/ui/CatalogSearchSelect';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { financialService } from '@/services/financials';
import { type BankAccount, treasuryService } from '@/services/treasury';

export function ListBankAccounts() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openForm, setOpenForm] = useState(false);
  const [name, setName] = useState('');
  const [branchNumber, setBranchNumber] = useState('');
  const [accountCode, setAccountCode] = useState('');
  const [planAccountId, setPlanAccountId] = useState('');

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['treasury', 'bank-accounts'],
    queryFn: treasuryService.bankAccounts,
  });

  const { data: bankPlanAccounts = [] } = useQuery({
    queryKey: ['financial', 'plan-accounts', 'bank'],
    queryFn: () => financialService.listPlanAccounts('bank'),
  });

  const { data: statement } = useQuery({
    queryKey: ['treasury', 'bank-entries', selectedId],
    queryFn: () => treasuryService.bankEntries(selectedId!),
    enabled: Boolean(selectedId),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      treasuryService.createBankAccount({
        name,
        branchNumber: branchNumber || undefined,
        accountCode: accountCode || undefined,
        planAccountId: planAccountId || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['treasury', 'bank-accounts'] });
      setOpenForm(false);
      setName('');
      setBranchNumber('');
      setAccountCode('');
      setPlanAccountId('');
      toast.success('Conta bancária cadastrada.');
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

  const selected: BankAccount | undefined = accounts.find((item) => item.id === selectedId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-zinc-900">Contas bancárias</h3>
          <p className="text-sm text-zinc-500">
            Extrato, saldo e conciliação por conta.
          </p>
        </div>
        <Button size="sm" onClick={() => setOpenForm(true)}>
          Nova conta
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <div className="rounded-md border bg-white">
          {isLoading ? (
            <p className="p-4 text-sm text-zinc-500">Carregando contas...</p>
          ) : accounts.length ? (
            accounts.map((account) => (
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
            <p className="p-4 text-sm text-zinc-500">Nenhuma conta bancária cadastrada.</p>
          )}
        </div>

        <div className="rounded-md border bg-white">
          {selected && statement ? (
            <>
              <div className="flex items-center justify-between border-b px-4 py-3">
                <div>
                  <p className="font-medium">{statement.account.name}</p>
                  <p className="text-sm text-zinc-500">
                    Saldo {formatCurrency(statement.account.balance ?? 0)}
                  </p>
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
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-4 text-zinc-500">
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

      <Dialog open={openForm} onOpenChange={setOpenForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova conta bancária</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              createMutation.mutate();
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
              <Label>Plano de contas</Label>
              <CatalogSearchSelect
                value={planAccountId}
                onChange={setPlanAccountId}
                options={bankPlanAccounts}
                placeholder="Conta bancária no plano"
                allowClear
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Salvando...' : 'Cadastrar'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
