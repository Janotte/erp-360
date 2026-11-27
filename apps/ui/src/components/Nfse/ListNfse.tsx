import { formatCurrency, type ListPageSize, listPageSizes } from '@erp-360/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ArrowUpDown, FileText } from 'lucide-react';
import type { MouseEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';

import {
  monthRange,
  shortKey,
  todayInSaoPaulo,
} from '@/components/Inbound/inboundQuery';
import { danfseDocument } from '@/components/Nfse/danfseDocument';
import { NfseNoteMenu } from '@/components/Nfse/NfseNoteMenu';
import { nfseStatusTone } from '@/components/Nfse/nfseTone';
import { Button } from '@/components/ui/button';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ListPagination } from '@/components/ui/ListPagination';
import {
  ListFilter,
  ListMessage,
  ListPageHeader,
  ListPanel,
  ListSearch,
} from '@/components/ui/ListShell';
import { StatusBadge, StatusListHeader, StatusListRow } from '@/components/ui/StatusList';
import { useDebouncedSearch } from '@/hooks/useDebouncedSearch';
import {
  type NfseListItem,
  type NfseListSortField,
  type NfseListStatus,
  nfseService,
  nfseStatusLabel,
} from '@/services/nfse';


const columns =
  'grid grid-cols-[44px_120px_110px_130px_110px_minmax(160px,1.4fr)_110px_minmax(120px,1fr)]';

const sortFields: NfseListSortField[] = [
  'dpsNumber',
  'nfseNumber',
  'status',
  'createdAt',
  'customerName',
  'serviceAmount',
  'accessKey',
];

function formatDpsSeries(dpsNumber: number | null, series: string | null) {
  if (dpsNumber == null && !series) return '—';
  if (dpsNumber == null) return series ?? '—';
  if (!series) return String(dpsNumber);
  return `${dpsNumber} / ${series}`;
}

const statuses = Object.keys(nfseStatusLabel) as NfseListStatus[];

function readPage(params: URLSearchParams) {
  const page = Number(params.get('page') ?? '1');
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function readSort(params: URLSearchParams): NfseListSortField {
  const value = params.get('sortField');
  return sortFields.includes(value as NfseListSortField)
    ? (value as NfseListSortField)
    : 'dpsNumber';
}

function readOrder(params: URLSearchParams): 'asc' | 'desc' {
  return params.get('sortOrder') === 'desc' ? 'desc' : 'asc';
}

function readLimit(params: URLSearchParams): ListPageSize {
  const value = Number(params.get('limit'));
  if ((listPageSizes as readonly number[]).includes(value)) return value as ListPageSize;
  return 10;
}

function readStatus(params: URLSearchParams): NfseListStatus | 'all' {
  const value = params.get('status');
  return statuses.includes(value as NfseListStatus) ? (value as NfseListStatus) : 'all';
}

function readDate(params: URLSearchParams, key: string) {
  const value = params.get(key) ?? '';
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
}

function formatIssuedOn(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
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

export function ListNfse() {
  const [params, setParams] = useSearchParams();
  const [danfseId, setDanfseId] = useState<string | null>(null);
  const [danfseHtml, setDanfseHtml] = useState('');
  const [noteMenu, setNoteMenu] = useState<{
    row: NfseListItem;
    x: number;
    y: number;
  } | null>(null);
  const danfseFrame = useRef<HTMLIFrameElement>(null);
  const page = readPage(params);
  const limit = readLimit(params);
  const sortField = readSort(params);
  const sortOrder = readOrder(params);
  const search = params.get('q') ?? '';
  const status = readStatus(params);
  const issuedFrom = readDate(params, 'issuedFrom');
  const issuedTo = readDate(params, 'issuedTo');
  const today = todayInSaoPaulo();
  const month = monthRange(today);

  const { text: searchText, setText: setSearchText } = useDebouncedSearch(
    (next) => {
      setParams(
        (current) => {
          const updated = new URLSearchParams(current);
          if ((updated.get('q') ?? '') === next) return current;
          if (next) updated.set('q', next);
          else updated.delete('q');
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
    queryKey: [
      'nfse',
      {
        page,
        limit,
        status,
        search,
        issuedFrom,
        issuedTo,
        sortField,
        sortOrder,
      },
    ],
    placeholderData: keepPreviousData,
    queryFn: () =>
      nfseService.list({
        page,
        limit,
        sortField,
        sortOrder,
        status: status === 'all' ? undefined : status,
        q: search || undefined,
        issuedFrom: issuedFrom || undefined,
        issuedTo: issuedTo || undefined,
      }),
  });

  const danfse = useQuery({
    queryKey: ['nfse', 'danfse', danfseId],
    queryFn: () => nfseService.danfse(danfseId!),
    enabled: Boolean(danfseId),
  });

  useEffect(() => {
    let cancelled = false;
    if (!danfse.data) {
      setDanfseHtml('');
      return;
    }
    void danfseDocument(danfse.data)
      .then((html) => {
        if (!cancelled) setDanfseHtml(html);
      })
      .catch(() => {
        if (!cancelled) {
          setDanfseHtml('');
          toast.error('Não foi possível montar a DANFSe.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [danfse.data]);

  const replaceParams = (change: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(params);
    change(next);
    next.delete('page');
    setParams(next, { replace: true });
  };

  const changeSort = (field: NfseListSortField) => {
    const order = sortField === field && sortOrder === 'asc' ? 'desc' : 'asc';
    replaceParams((next) => {
      if (field === 'dpsNumber') next.delete('sortField');
      else next.set('sortField', field);
      if (order === 'asc') next.delete('sortOrder');
      else next.set('sortOrder', order);
    });
  };

  const changeStatus = (nextStatus: NfseListStatus | 'all') => {
    replaceParams((next) => {
      if (nextStatus === 'all') next.delete('status');
      else next.set('status', nextStatus);
    });
  };

  const changeDate = (key: string, value: string) => {
    replaceParams((next) => {
      if (value) next.set(key, value);
      else next.delete(key);
    });
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

  const sortIcon = (field: NfseListSortField) => {
    if (sortField !== field) return <ArrowUpDown className="h-3.5 w-3.5" />;
    return sortOrder === 'asc' ? (
      <ArrowUp className="h-3.5 w-3.5" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5" />
    );
  };

  const copyKey = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success('Chave copiada.');
    } catch {
      toast.error('Não foi possível copiar a chave.');
    }
  };

  const rows = list.data?.data ?? [];
  const meta = list.data?.meta;
  const filtered = Boolean(search || status !== 'all' || issuedFrom || issuedTo);

  return (
    <div className="space-y-4">
      <ListPageHeader
        title="NFS-e"
        description="Consulta dos pedidos de NFS-e. A cor da linha indica a situação."
      />

      <ListPanel
        title="Notas"
        description="Busque por DPS, série, cliente ou chave. O intervalo de emissão usa a data do pedido."
      >
        <div className="mb-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                replaceParams((next) => {
                  next.set('issuedFrom', today);
                  next.set('issuedTo', today);
                })
              }
            >
              Hoje
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                replaceParams((next) => {
                  next.set('issuedFrom', month.from);
                  next.set('issuedTo', month.to);
                })
              }
            >
              Este mês
            </Button>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <ListSearch
              value={searchText}
              onChange={setSearchText}
              placeholder="DPS, série, cliente ou chave"
              label="Pesquisar NFS-e"
            />
            <ListFilter
              value={status}
              onValueChange={changeStatus}
              label="Filtrar por situação"
              allLabel="Todas as situações"
              options={statuses.map((value) => ({
                value,
                label: nfseStatusLabel[value],
              }))}
            />
            <DateFilter
              label="Emissão de"
              value={issuedFrom}
              onChange={(value) => changeDate('issuedFrom', value)}
            />
            <DateFilter
              label="Emissão até"
              value={issuedTo}
              onChange={(value) => changeDate('issuedTo', value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[900px]">
            <StatusListHeader columns={columns}>
              <span />
              <button
                type="button"
                className="inline-flex items-center gap-1 text-left"
                onClick={() => changeSort('dpsNumber')}
              >
                DPS/Série
                {sortIcon('dpsNumber')}
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-left"
                onClick={() => changeSort('nfseNumber')}
              >
                NFS-e
                {sortIcon('nfseNumber')}
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-left"
                onClick={() => changeSort('status')}
              >
                Status
                {sortIcon('status')}
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-left"
                onClick={() => changeSort('createdAt')}
              >
                Emissão
                {sortIcon('createdAt')}
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-left"
                onClick={() => changeSort('customerName')}
              >
                Cliente
                {sortIcon('customerName')}
              </button>
              <button
                type="button"
                className="inline-flex w-full items-center justify-end gap-1 text-right"
                onClick={() => changeSort('serviceAmount')}
              >
                Total
                {sortIcon('serviceAmount')}
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-left"
                onClick={() => changeSort('accessKey')}
              >
                Chave
                {sortIcon('accessKey')}
              </button>
            </StatusListHeader>

            {list.isLoading ? (
              <ListMessage>Carregando a NFS-e...</ListMessage>
            ) : list.isError ? (
              <ListMessage tone="error">Não foi possível carregar a NFS-e.</ListMessage>
            ) : rows.length === 0 ? (
              <ListMessage>
                {filtered ? 'Nenhuma NFS-e encontrada.' : 'Ainda não há NFS-e.'}
              </ListMessage>
            ) : (
              rows.map((row) => (
                <StatusListRow
                  key={row.id}
                  columns={columns}
                  tone={nfseStatusTone[row.status]}
                  label={`DPS ${row.dpsNumber ?? 'sem número'}, ${nfseStatusLabel[row.status]}, ${row.customerName}`}
                  onContextMenu={(event: MouseEvent<HTMLDivElement>) => {
                    event.preventDefault();
                    setNoteMenu({ row, x: event.clientX, y: event.clientY });
                  }}
                >
                  <span data-row-ignore>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      title="DANFSe"
                      aria-label="DANFSe"
                      disabled={row.status !== 'authorized' || !row.accessKey}
                      onClick={() => setDanfseId(row.id)}
                    >
                      <FileText />
                    </Button>
                  </span>
                  <span className="tabular-nums text-[var(--status-text)]">
                    {formatDpsSeries(row.dpsNumber, row.series)}
                  </span>
                  <span className="tabular-nums text-[var(--status-text)]">
                    {row.nfseNumber ?? '—'}
                  </span>
                  <span>
                    <StatusBadge
                      label={nfseStatusLabel[row.status]}
                      tone={nfseStatusTone[row.status]}
                    />
                  </span>
                  <span className="text-[var(--status-text)]">
                    {formatIssuedOn(row.createdAt)}
                  </span>
                  <span className="min-w-0 truncate text-[var(--status-text)]">
                    {row.customerName}
                  </span>
                  <span className="text-right tabular-nums text-[var(--status-text)]">
                    {formatCurrency(row.serviceAmount)}
                  </span>
                  <span data-row-ignore>
                    {row.accessKey ? (
                      <button
                        type="button"
                        className="font-mono text-xs text-[var(--status-text)] underline-offset-2 hover:underline"
                        title={row.accessKey}
                        onClick={() => void copyKey(row.accessKey!)}
                      >
                        {shortKey(row.accessKey)}
                      </button>
                    ) : (
                      <span className="text-[var(--status-text)]">—</span>
                    )}
                  </span>
                </StatusListRow>
              ))
            )}
          </div>
        </div>
        {meta ? (
          <ListPagination
            page={page}
            limit={limit}
            total={meta.total}
            totalPages={meta.totalPages}
            onPageChange={setPage}
            onLimitChange={setLimit}
          />
        ) : null}
      </ListPanel>

      <NfseNoteMenu
        cursor={noteMenu}
        onClose={() => setNoteMenu(null)}
        onOpenDanfse={(row) => setDanfseId(row.id)}
        onCanceled={() => {
          void list.refetch();
        }}
      />

      <Dialog
        open={Boolean(danfseId)}
        onOpenChange={(open) => {
          if (open) return;
          setDanfseId(null);
          setDanfseHtml('');
        }}
      >
        <DialogContent className="max-h-[92vh] max-w-[1100px]">
          <DialogHeader>
            <DialogTitle>DANFSe</DialogTitle>
            <DialogDescription>
              Visualização da NFS-e autorizada a partir do XML local.
            </DialogDescription>
          </DialogHeader>
          {danfse.isPending ? (
            <p className="text-sm text-zinc-500">Carregando...</p>
          ) : null}
          {danfse.isError ? (
            <p className="text-sm text-rose-700">{danfse.error.message}</p>
          ) : null}
          {danfseHtml ? (
            <>
              <iframe
                ref={danfseFrame}
                title="DANFSe"
                className="h-[65vh] w-full rounded-md border bg-white"
                srcDoc={danfseHtml}
              />
              <DialogFooter>
                <Button
                  type="button"
                  onClick={() => {
                    const frame = danfseFrame.current?.contentWindow;
                    if (!frame) {
                      toast.error('Não foi possível imprimir a DANFSe.');
                      return;
                    }
                    void (async () => {
                      try {
                        await frame.document.fonts.ready;
                        frame.focus();
                        frame.print();
                      } catch {
                        toast.error('Não foi possível imprimir a DANFSe.');
                      }
                    })();
                  }}
                >
                  Imprimir
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
