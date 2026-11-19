import {
  formatCurrency,
  formatCurrencyInput,
  formatRawDate,
  type ListPageSize,
  listPageSizes,
  maskCurrencyInput,
  parseCurrencyToCents,
} from '@erp-360/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
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
import { FloatingInput } from '@/components/ui/FloatingField';
import { Input } from '@/components/ui/input';
import { ListPagination } from '@/components/ui/ListPagination';
import {
  ListFilter,
  ListMessage,
  ListPageHeader,
  ListPanel,
  ListSearch,
} from '@/components/ui/ListShell';
import { StatusListHeader, StatusListRow } from '@/components/ui/StatusList';
import { type StatusTone } from '@/components/ui/statusTone';
import { useDebouncedSearch } from '@/hooks/useDebouncedSearch';
import { type TreasuryEntry, treasuryService } from '@/services/treasury';

const columns = 'grid grid-cols-[104px_minmax(220px,1.6fr)_120px_120px_130px_108px]';

const kinds = ['entrada', 'saida', 'abertura'] as const;
type CashKind = (typeof kinds)[number];

const kindLabels: Record<CashKind, string> = {
  entrada: 'Entrada',
  saida: 'Saída',
  abertura: 'Saldo inicial',
};

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

function readKind(params: URLSearchParams): CashKind | 'all' {
  const value = params.get('tipo');
  return kinds.includes(value as CashKind) ? (value as CashKind) : 'all';
}

function occurredOn(entry: TreasuryEntry) {
  return entry.occurredOn.slice(0, 10);
}

function entryKind(entry: TreasuryEntry): CashKind | 'lancamento' {
  if (entry.openingBalance) return 'abertura';
  if (entry.inflowAmount > 0 && entry.outflowAmount === 0) return 'entrada';
  if (entry.outflowAmount > 0 && entry.inflowAmount === 0) return 'saida';
  return 'lancamento';
}

function entryTone(entry: TreasuryEntry): StatusTone {
  const kind = entryKind(entry);
  if (kind === 'entrada') return inflowTone;
  if (kind === 'saida') return outflowTone;
  if (kind === 'abertura') return openingTone;
  return plainTone;
}

function entrySituation(entry: TreasuryEntry) {
  const kind = entryKind(entry);
  if (kind === 'entrada') return 'entrada';
  if (kind === 'saida') return 'saída';
  if (kind === 'abertura') return 'saldo inicial';
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

export function ListCashBook() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const page = readPage(params);
  const limit = readLimit(params);
  const search = params.get('busca') ?? '';
  const from = readDate(params, 'from');
  const to = readDate(params, 'to');
  const kind = readKind(params);
  const [openOpening, setOpenOpening] = useState(false);
  const [openingOn, setOpeningOn] = useState('');
  const [openingAmountStr, setOpeningAmountStr] = useState('');
  const [reverseTransferId, setReverseTransferId] = useState<string | null>(null);
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

  const list = useQuery({
    queryKey: ['treasury', 'cash-entries'],
    queryFn: treasuryService.cashEntries,
  });

  const settings = useQuery({
    queryKey: ['treasury', 'settings'],
    queryFn: treasuryService.settings,
  });

  const saveOpening = useMutation({
    mutationFn: () =>
      treasuryService.saveCashOpening({
        cashOpeningOn: openingOn || null,
        cashOpeningAmount: parseCurrencyToCents(openingAmountStr),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['treasury'] });
      setOpenOpening(false);
      toast.success('Saldo inicial do caixa salvo.');
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

  const entries = useMemo(() => list.data ?? [], [list.data]);
  const currentBalance = entries[0]?.balance ?? settings.data?.cashOpeningAmount ?? 0;
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return entries.filter((entry) => {
      const date = occurredOn(entry);
      if (from && date < from) return false;
      if (to && date > to) return false;
      const movement = entryKind(entry);
      if (kind !== 'all' && movement !== kind) return false;
      if (term && !entry.description.toLocaleLowerCase('pt-BR').includes(term))
        return false;
      return true;
    });
  }, [entries, from, kind, search, to]);
  const total = filtered.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  const rows = filtered.slice((page - 1) * limit, page * limit);
  const hasFilter = Boolean(search || from || to || kind !== 'all');

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

  const openBalanceDialog = () => {
    setOpeningOn(settings.data?.cashOpeningOn ?? '');
    setOpeningAmountStr(
      settings.data?.cashOpeningAmount
        ? formatCurrencyInput(settings.data.cashOpeningAmount)
        : '',
    );
    setOpenOpening(true);
  };

  return (
    <div className="space-y-4">
      <ListPageHeader
        title="Livro caixa"
        description="Entradas, saídas e saldo em dinheiro. A cor da linha indica o movimento."
      >
        <div className="rounded-[10px] border border-[#dfe5ee] bg-white px-4 py-2 text-right">
          <p className="text-xs text-[#64748b]">Saldo em dinheiro</p>
          <p className="text-lg font-semibold tabular-nums text-[#172337]">
            {formatCurrency(currentBalance)}
          </p>
        </div>
        <Button variant="outline" onClick={openBalanceDialog}>
          Saldo inicial
        </Button>
      </ListPageHeader>

      <ListPanel
        title="Lançamentos"
        description="Os mais recentes aparecem primeiro. O saldo de cada linha é o saldo após o lançamento."
        toolbar={
          <>
            <ListSearch
              value={searchText}
              onChange={setSearchText}
              placeholder="Buscar pelo histórico..."
              label="Pesquisar o livro caixa"
            />
            <ListFilter
              value={kind}
              onValueChange={(next) =>
                replaceParams((updated) => {
                  if (next === 'all') updated.delete('tipo');
                  else updated.set('tipo', next);
                })
              }
              label="Filtrar por movimento"
              allLabel="Todos os movimentos"
              options={kinds.map((value) => ({ value, label: kindLabels[value] }))}
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
        }
      >
        <div className="overflow-x-auto">
          <div className="min-w-[860px]">
            <StatusListHeader columns={columns}>
              <span>Data</span>
              <span>Histórico</span>
              <span className="text-right">Entrada</span>
              <span className="text-right">Saída</span>
              <span className="text-right">Saldo</span>
              <span className="sr-only">Ações</span>
            </StatusListHeader>

            {list.isLoading ? (
              <ListMessage>Carregando o livro caixa...</ListMessage>
            ) : list.isError ? (
              <ListMessage tone="error">
                Não foi possível carregar o livro caixa.
              </ListMessage>
            ) : rows.length === 0 ? (
              <ListMessage>
                {hasFilter
                  ? 'Nenhum lançamento encontrado.'
                  : 'Nenhum lançamento em caixa.'}
              </ListMessage>
            ) : (
              rows.map((entry) => (
                <StatusListRow
                  key={entry.id}
                  columns={columns}
                  tone={entryTone(entry)}
                  label={`${formatRawDate(entry.occurredOn)}, ${entry.description}, ${entrySituation(entry)}`}
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
                    {entry.outflowAmount ? formatCurrency(entry.outflowAmount) : '—'}
                  </span>
                  <span className="text-right font-semibold tabular-nums text-[var(--status-text)]">
                    {formatCurrency(entry.balance)}
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
                  </span>
                </StatusListRow>
              ))
            )}
          </div>
        </div>
        {!list.isLoading && !list.isError ? (
          <ListPagination
            page={page}
            limit={limit}
            total={total}
            totalPages={totalPages}
            onPageChange={setPage}
            onLimitChange={setLimit}
          />
        ) : null}
      </ListPanel>

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

      <Dialog open={openOpening} onOpenChange={setOpenOpening}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Saldo inicial do caixa</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (parseCurrencyToCents(openingAmountStr) !== 0 && !openingOn) {
                toast.error('Informe a data do saldo inicial.');
                return;
              }
              saveOpening.mutate();
            }}
          >
            <FloatingInput
              id="cashOpeningOn"
              label="Data do saldo inicial"
              type="date"
              value={openingOn}
              onChange={(event) => setOpeningOn(event.target.value)}
            />
            <FloatingInput
              id="cashOpeningAmount"
              label="Valor (R$)"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="0,00"
              value={openingAmountStr}
              onChange={(event) =>
                setOpeningAmountStr(maskCurrencyInput(event.target.value))
              }
            />
            <div className="flex justify-end">
              <Button type="submit" disabled={saveOpening.isPending}>
                {saveOpening.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
