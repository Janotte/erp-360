import {
  formatCurrency,
  formatRawDate,
  type ListPageSize,
  listPageSizes,
} from '@erp-360/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ListPagination } from '@/components/ui/ListPagination';
import {
  ListMessage,
  ListPageHeader,
  ListPanel,
  ListSearch,
} from '@/components/ui/ListShell';
import { StatusListHeader, StatusListRow } from '@/components/ui/StatusList';
import { type StatusTone } from '@/components/ui/statusTone';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDebouncedSearch } from '@/hooks/useDebouncedSearch';
import {
  type BankAccount,
  type BankAccountKind,
  type TreasuryEntry,
  treasuryService,
} from '@/services/treasury';

import { InvestmentEntryModal } from './InvestmentEntryModal';
import { TransferModal, type TransferMode } from './TransferModal';

const accountColumns = 'grid grid-cols-[minmax(0,1fr)_auto]';
const entryColumns =
  'grid grid-cols-[104px_minmax(160px,1.4fr)_108px_108px_120px_112px_108px]';

const inflowTone: StatusTone = {
  background: '#ECFDF5',
  hover: '#D1FAE5',
  border: '#059669',
  text: '#047857',
};

const outflowTone: StatusTone = {
  background: '#FEF2F2',
  hover: '#FEE2E2',
  border: '#DC2626',
  text: '#B91C1C',
};

const openingTone: StatusTone = {
  background: '#EFF6FF',
  hover: '#DBEAFE',
  border: '#2563EB',
  text: '#1D4ED8',
};

const plainTone: StatusTone = {
  background: '#FFFFFF',
  hover: '#F8FAFC',
  border: '#94A3B8',
  text: '#172337',
};

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

function readPage(params: URLSearchParams) {
  const page = Number(params.get('page') ?? '1');
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function readLimit(params: URLSearchParams): ListPageSize {
  const value = Number(params.get('limit'));
  if ((listPageSizes as readonly number[]).includes(value)) return value as ListPageSize;
  return 10;
}

function readDate(params: URLSearchParams, key: string) {
  const value = params.get(key) ?? '';
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
}

function readTab(params: URLSearchParams): BankAccountKind {
  return params.get('aba') === 'investment' ? 'investment' : 'operating';
}

function readAccountId(params: URLSearchParams) {
  const value = params.get('conta') ?? '';
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

function occurredOn(entry: TreasuryEntry) {
  return entry.occurredOn.slice(0, 10);
}

function entryTone(entry: TreasuryEntry): StatusTone {
  if (entry.openingBalance) return openingTone;
  if (entry.inflowAmount > 0 && entry.outflowAmount === 0) return inflowTone;
  if (entry.outflowAmount > 0 && entry.inflowAmount === 0) return outflowTone;
  return plainTone;
}

function entrySituation(entry: TreasuryEntry) {
  if (entry.openingBalance) return 'saldo inicial';
  if (entry.inflowAmount > 0 && entry.outflowAmount === 0) return 'entrada';
  if (entry.outflowAmount > 0 && entry.inflowAmount === 0) return 'saída';
  return 'lançamento';
}

function DateFilter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-[13px] text-[#64748b]">
      {label}
      <Input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-[42px] w-[148px] border-[#cbd5e1]"
        aria-label={label}
      />
    </label>
  );
}

export function ListBankAccounts() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const page = readPage(params);
  const limit = readLimit(params);
  const search = params.get('busca') ?? '';
  const from = readDate(params, 'from');
  const to = readDate(params, 'to');
  const accountId = readAccountId(params);
  const listUrl = `/bank-accounts${location.search}`;
  const [transferMode, setTransferMode] = useState<TransferMode | null>(null);
  const [reverseTransferId, setReverseTransferId] = useState<string | null>(null);
  const [openEntry, setOpenEntry] = useState(false);
  const [deleteEntryId, setDeleteEntryId] = useState<string | null>(null);
  const { text: searchText, setText: setSearchText } = useDebouncedSearch(
    (next) => {
      setParams(
        (current) => {
          const updated = new URLSearchParams(current);
          if ((updated.get('busca') ?? '') === next) return current;
          if (next) updated.set('busca', next);
          else updated.delete('busca');
          updated.delete('page');
          return updated;
        },
        { replace: true },
      );
    },
    400,
    search,
  );

  useEffect(() => {
    setSearchText(search);
  }, [search, setSearchText]);

  const accountsQuery = useQuery({
    queryKey: ['treasury', 'bank-accounts'],
    queryFn: treasuryService.bankAccounts,
  });

  const accounts = useMemo(() => accountsQuery.data ?? [], [accountsQuery.data]);
  const selected = accounts.find((item) => item.id === accountId);
  const tab: BankAccountKind = selected ? accountKind(selected) : readTab(params);
  const visibleAccounts = accounts.filter((item) => accountKind(item) === tab);
  const tabBalance = visibleAccounts.reduce((sum, item) => sum + (item.balance ?? 0), 0);

  const statement = useQuery({
    queryKey: ['treasury', 'bank-entries', selected?.id],
    queryFn: () => treasuryService.bankEntries(selected!.id),
    enabled: Boolean(selected),
  });

  const reconcileMutation = useMutation({
    mutationFn: ({ id, reconciled }: { id: string; reconciled: boolean }) =>
      treasuryService.reconcile(id, reconciled),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['treasury', 'bank-entries', selected?.id],
      });
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

  const entries = useMemo(() => statement.data?.entries ?? [], [statement.data]);
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return entries.filter((entry) => {
      const date = occurredOn(entry);
      if (from && date < from) return false;
      if (to && date > to) return false;
      if (term && !entry.description.toLocaleLowerCase('pt-BR').includes(term))
        return false;
      return true;
    });
  }, [entries, from, search, to]);
  const total = filtered.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  const rows = filtered.slice((page - 1) * limit, page * limit);
  const hasFilter = Boolean(search || from || to);

  const replaceParams = (change: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(params);
    change(next);
    next.delete('page');
    setParams(next, { replace: true });
  };

  const setPage = (nextPage: number) => {
    const next = new URLSearchParams(params);
    if (nextPage <= 1) next.delete('page');
    else next.set('page', String(nextPage));
    setParams(next, { replace: true });
  };

  const setLimit = (nextLimit: ListPageSize) => {
    const next = new URLSearchParams(params);
    if (nextLimit === 10) next.delete('limit');
    else next.set('limit', String(nextLimit));
    next.delete('page');
    setParams(next, { replace: true });
  };

  const selectAccount = (id: string) => {
    replaceParams((updated) => {
      updated.set('conta', id);
      updated.delete('busca');
      updated.delete('from');
      updated.delete('to');
    });
  };

  const changeTab = (nextTab: BankAccountKind) => {
    replaceParams((updated) => {
      if (nextTab === 'operating') updated.delete('aba');
      else updated.set('aba', nextTab);
      const current = accounts.find((item) => item.id === updated.get('conta'));
      if (!current || accountKind(current) !== nextTab) updated.delete('conta');
      updated.delete('busca');
      updated.delete('from');
      updated.delete('to');
    });
  };

  return (
    <div className="space-y-4">
      <ListPageHeader
        title="Contas bancárias"
        description={
          tab === 'investment'
            ? 'Aplicações fora do fluxo de caixa. A cor do extrato indica o movimento.'
            : 'Contas que entram no fluxo de caixa. A cor do extrato indica o movimento.'
        }
      >
        <div className="rounded-[10px] border border-[#dfe5ee] bg-white px-4 py-2 text-right">
          <p className="text-xs text-[#64748b]">Saldo da aba</p>
          <p className="text-lg font-semibold tabular-nums text-[#172337]">
            {formatCurrency(tabBalance)}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setTransferMode('transfer')}
        >
          Transferir
        </Button>
        <Button type="button" variant="outline" onClick={() => setTransferMode('apply')}>
          Aplicar
        </Button>
        <Button type="button" variant="outline" onClick={() => setTransferMode('redeem')}>
          Resgatar
        </Button>
        <Button asChild>
          <Link to="/bank-accounts/new" state={{ from: listUrl, kind: tab }}>
            Nova conta
          </Link>
        </Button>
      </ListPageHeader>

      <Tabs value={tab} onValueChange={(value) => changeTab(value as BankAccountKind)}>
        <TabsList>
          <TabsTrigger value="operating">Contas corrente</TabsTrigger>
          <TabsTrigger value="investment">Investimentos</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid items-start gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <ListPanel title="Contas" description="Clique na conta para abrir o extrato.">
          {accountsQuery.isLoading ? (
            <ListMessage>Carregando contas...</ListMessage>
          ) : accountsQuery.isError ? (
            <ListMessage tone="error">Não foi possível carregar as contas.</ListMessage>
          ) : visibleAccounts.length === 0 ? (
            <ListMessage>
              {tab === 'investment'
                ? 'Nenhuma conta de investimento cadastrada.'
                : 'Nenhuma conta corrente cadastrada.'}
            </ListMessage>
          ) : (
            visibleAccounts.map((account) => (
              <StatusListRow
                key={account.id}
                columns={accountColumns}
                tone={account.id === selected?.id ? openingTone : plainTone}
                label={`${account.name}, saldo ${formatCurrency(account.balance ?? 0)}`}
                onOpen={() => selectAccount(account.id)}
              >
                <span className="min-w-0 truncate font-bold text-[var(--status-text)]">
                  {account.name}
                </span>
                <span className="tabular-nums text-[var(--status-text)]">
                  {formatCurrency(account.balance ?? 0)}
                </span>
              </StatusListRow>
            ))
          )}
        </ListPanel>

        <ListPanel
          title="Extrato"
          description={
            selected
              ? `${selected.name} · Saldo ${formatCurrency(selected.balance ?? 0)}. Os mais recentes aparecem primeiro.`
              : 'Selecione uma conta para ver o extrato.'
          }
          toolbar={
            selected ? (
              <>
                <Button variant="outline" asChild>
                  <Link to={`/bank-accounts/${selected.id}`} state={{ from: listUrl }}>
                    Editar
                  </Link>
                </Button>
                {accountKind(selected) === 'investment' ? (
                  <Button type="button" onClick={() => setOpenEntry(true)}>
                    Lançar
                  </Button>
                ) : null}
                <ListSearch
                  value={searchText}
                  onChange={setSearchText}
                  placeholder="Buscar pelo histórico..."
                  label="Pesquisar o extrato"
                />
                <DateFilter
                  label="De"
                  value={from}
                  onChange={(value) =>
                    replaceParams((updated) => {
                      if (value) updated.set('from', value);
                      else updated.delete('from');
                    })
                  }
                />
                <DateFilter
                  label="Até"
                  value={to}
                  onChange={(value) =>
                    replaceParams((updated) => {
                      if (value) updated.set('to', value);
                      else updated.delete('to');
                    })
                  }
                />
              </>
            ) : null
          }
        >
          {!selected ? (
            <ListMessage>Selecione uma conta para ver o extrato.</ListMessage>
          ) : statement.isLoading ? (
            <ListMessage>Carregando o extrato...</ListMessage>
          ) : statement.isError ? (
            <ListMessage tone="error">Não foi possível carregar o extrato.</ListMessage>
          ) : (
            <>
              <div className="overflow-x-auto">
                <div className="min-w-[980px]">
                  <StatusListHeader columns={entryColumns}>
                    <span>Data</span>
                    <span>Histórico</span>
                    <span className="text-right">Entrada</span>
                    <span className="text-right">Saída</span>
                    <span className="text-right">Saldo</span>
                    <span>Conciliação</span>
                    <span className="sr-only">Ações</span>
                  </StatusListHeader>
                  {rows.length === 0 ? (
                    <ListMessage>
                      {hasFilter
                        ? 'Nenhum lançamento encontrado.'
                        : 'Nenhum lançamento nesta conta.'}
                    </ListMessage>
                  ) : (
                    rows.map((entry) => (
                      <StatusListRow
                        key={entry.id}
                        columns={entryColumns}
                        tone={entryTone(entry)}
                        label={`${formatRawDate(entry.occurredOn)}, ${entry.description}, ${entrySituation(entry)}${entry.reconciled ? ', conciliado' : ''}`}
                      >
                        <span className="text-[var(--status-text)]">
                          {formatRawDate(entry.occurredOn)}
                        </span>
                        <span className="min-w-0 truncate font-bold text-[var(--status-text)]">
                          {entry.description}
                        </span>
                        <span className="text-right tabular-nums text-[var(--status-text)]">
                          {entry.inflowAmount ? formatCurrency(entry.inflowAmount) : '—'}
                        </span>
                        <span className="text-right tabular-nums text-[var(--status-text)]">
                          {entry.outflowAmount
                            ? formatCurrency(entry.outflowAmount)
                            : '—'}
                        </span>
                        <span className="text-right font-semibold tabular-nums text-[var(--status-text)]">
                          {formatCurrency(entry.balance)}
                        </span>
                        <span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={reconcileMutation.isPending}
                            onClick={() =>
                              reconcileMutation.mutate({
                                id: entry.id,
                                reconciled: !entry.reconciled,
                              })
                            }
                          >
                            {entry.reconciled ? 'Conciliado' : 'Conciliar'}
                          </Button>
                        </span>
                        <span className="text-right">
                          {entry.transferId ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setReverseTransferId(entry.transferId!)}
                            >
                              Estornar
                            </Button>
                          ) : null}
                          {accountKind(selected) === 'investment' &&
                          canDeleteInvestmentEntry(entry) ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setDeleteEntryId(entry.id)}
                            >
                              Excluir
                            </Button>
                          ) : null}
                        </span>
                      </StatusListRow>
                    ))
                  )}
                </div>
              </div>
              <ListPagination
                page={page}
                limit={limit}
                total={total}
                totalPages={totalPages}
                onPageChange={setPage}
                onLimitChange={setLimit}
              />
            </>
          )}
        </ListPanel>
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
              Os dois lançamentos desta transferência serão excluídos e os saldos
              recalculados. Essa ação não pode ser desfeita.
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
              O lançamento será removido do extrato e o saldo da conta de investimento
              será recalculado.
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

      <Dialog open={openEntry} onOpenChange={setOpenEntry}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lançar na conta de investimento</DialogTitle>
          </DialogHeader>
          {selected ? (
            <InvestmentEntryModal
              key={selected.id}
              bankAccountId={selected.id}
              onSuccess={() => setOpenEntry(false)}
            />
          ) : null}
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
