import {
  civilDate,
  formatCurrency,
  formatRawDate,
  type ListPageSize,
} from '@erp-360/shared';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ArrowUpDown, FileText, MoreHorizontal } from 'lucide-react';
import { type MouseEvent, useEffect, useLayoutEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';

import { InboundNoteMenu } from '@/components/Inbound/InboundNoteMenu';
import {
  filterFromSearch,
  monthRange,
  shortKey,
  statusDetail,
  todayInSaoPaulo,
} from '@/components/Inbound/inboundQuery';
import { inboundStatusTone } from '@/components/Inbound/inboundTone';
import { Button } from '@/components/ui/button';
import { FloatingInput } from '@/components/ui/FloatingField';
import { Label } from '@/components/ui/label';
import { ListPagination } from '@/components/ui/ListPagination';
import {
  ListFilter,
  ListMessage,
  ListPageHeader,
  ListPanel,
  ListSearch,
} from '@/components/ui/ListShell';
import { StatusListHeader } from '@/components/ui/StatusList';
import { statusToneStyle } from '@/components/ui/statusTone';
import { useDebouncedSearch } from '@/hooks/useDebouncedSearch';
import { cn } from '@/lib/utils';
import { dfeService, type DfeSyncResult } from '@/services/dfe';
import {
  discoveryConfirm,
  type InboundListItem,
  type InboundListSort,
  inboundService,
  type InboundStatus,
  inboundStatusLabel,
  type RecipientManifestation,
  recipientManifestationLabel,
} from '@/services/inbound';

const scrollPrefix = 'inbound-list-scroll';

const columns =
  'grid grid-cols-[168px_100px_minmax(180px,1.5fr)_120px_110px_110px_150px_minmax(140px,1fr)_150px_110px]';

const sortable = [
  ['number', 'Número'],
  ['supplier', 'Fornecedor'],
  ['totalAmount', 'Total'],
  ['inboundOn', 'Entrada'],
  ['issueOn', 'Emissão'],
  ['status', 'Situação'],
  ['nature', 'Natureza'],
  ['manifestation', 'Manifesto'],
] as const;

function formatWhen(iso: string | null) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function syncMessage(result: DfeSyncResult) {
  const until = formatWhen(result.blockedUntil);
  if (until) return `A SEFAZ pediu espera. Próxima consulta depois de ${until}.`;
  if (result.received === 0) return 'Nenhum documento novo.';
  return result.received === 1
    ? '1 documento recebido.'
    : `${result.received} documentos recebidos.`;
}

function knownStatus(value: string | null): InboundStatus | 'all' {
  if (value && value in inboundStatusLabel) return value as InboundStatus;
  return 'all';
}

function knownManifestation(value: string | null): RecipientManifestation | 'all' {
  if (value && value in recipientManifestationLabel)
    return value as RecipientManifestation;
  return 'all';
}

export function ListInbounds() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [noteMenu, setNoteMenu] = useState<{
    row: InboundListItem;
    x: number;
    y: number;
  } | null>(null);
  const [danfeRow, setDanfeRow] = useState<InboundListItem | null>(null);
  const filter = filterFromSearch(location.search);
  const today = todayInSaoPaulo();
  const month = monthRange(today);
  const search = params.get('q') ?? '';
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

  useLayoutEffect(() => {
    const saved = sessionStorage.getItem(`${scrollPrefix}${location.search}`);
    if (!saved) return;
    window.scrollTo(0, Number(saved));
  }, [location.search]);

  useEffect(() => {
    const key = `${scrollPrefix}${location.search}`;
    return () => {
      sessionStorage.setItem(key, String(window.scrollY));
    };
  }, [location.search]);

  const list = useQuery({
    queryKey: ['inbound', 'list', filter],
    queryFn: () => inboundService.list(filter),
    placeholderData: keepPreviousData,
  });

  function write(mutate: (next: URLSearchParams) => void) {
    const next = new URLSearchParams(params);
    mutate(next);
    next.delete('page');
    setParams(next, { replace: true });
  }

  function setPage(page: number) {
    const next = new URLSearchParams(params);
    if (page <= 1) next.delete('page');
    else next.set('page', String(page));
    setParams(next, { replace: true });
  }

  function setLimit(nextLimit: ListPageSize) {
    write((next) => {
      if (nextLimit === 10) next.delete('limit');
      else next.set('limit', String(nextLimit));
    });
  }

  function clearQueue(next: URLSearchParams) {
    next.delete('queue');
    next.delete('status');
    next.delete('manifestation');
    next.delete('issueFrom');
    next.delete('issueTo');
    next.delete('inboundFrom');
    next.delete('inboundTo');
  }

  const queueActive = params.get('queue') === 'to_post';
  const divergentActive = params.get('status') === 'divergent' && !queueActive;
  const manifestActive =
    params.get('manifestation') === 'none' && !queueActive && !params.get('status');
  const postedMonthActive =
    params.get('status') === 'posted' &&
    params.get('inboundFrom') === month.from &&
    params.get('inboundTo') === month.to &&
    !queueActive;

  function openNote(row: InboundListItem) {
    sessionStorage.setItem(`${scrollPrefix}${location.search}`, String(window.scrollY));
    navigate(`/inbound/${row.id}`, { state: { from: `/inbound${location.search}` } });
  }

  const syncSefaz = useMutation({
    mutationFn: () => dfeService.sync(),
    onSuccess: async (result) => {
      toast.success(syncMessage(result));
      await queryClient.invalidateQueries({ queryKey: ['inbound', 'list'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const createManual = useMutation({
    mutationFn: () =>
      inboundService.createManual({
        number: '1',
        series: '1',
        issueOn: civilDate(),
        lines: [
          {
            lineNumber: 1,
            supplierCode: 'ITEM',
            description: 'Item da nota',
            xmlCfop: '1102',
            commercialQty: 1,
            commercialUnit: 'UN',
            unitPrice: 0,
            factor: 1,
          },
        ],
        installments: [],
      }),
    onSuccess: (document) => {
      toast.success('Pré-nota criada.');
      navigate(`/inbound/${document.id}`, {
        state: { from: `/inbound${location.search}` },
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const importXml = useMutation({
    mutationFn: ({ fileName, xml }: { fileName: string; xml: string }) =>
      inboundService.importXml(fileName, xml),
    onSuccess: (document) => {
      toast.success('XML importado.');
      navigate(`/inbound/${document.id}`, {
        state: { from: `/inbound${location.search}` },
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const discover = useMutation({
    mutationFn: (id: string) => inboundService.discover(id),
    onSuccess: async (result, id) => {
      await queryClient.invalidateQueries({ queryKey: ['inbound', 'list'] });
      if (result.outcome === 'imported') {
        navigate(`/inbound/${id}`, { state: { from: `/inbound${location.search}` } });
        return;
      }
      toast.success(result.message);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function confirmDiscovery(id: string) {
    if (discover.isPending) return;
    try {
      const note = await queryClient.fetchQuery({
        queryKey: ['inbound', 'detail', id],
        queryFn: () => inboundService.get(id),
      });
      if (note.status !== 'discovered') return;
      const action = note.discoveryAction;
      if (action.kind === 'blocked') {
        toast.error(action.message);
        return;
      }
      if (action.kind === 'none') return;
      if (!window.confirm(discoveryConfirm[action.kind])) return;
      discover.mutate(id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao carregar a nota.');
    }
  }

  function toggleSort(column: InboundListSort) {
    write((next) => {
      const current = next.get('sort') || 'issueOn';
      const currentDir = next.get('dir') === 'asc' ? 'asc' : 'desc';
      const nextDir = current === column && currentDir === 'desc' ? 'asc' : 'desc';
      if (column === 'issueOn' && nextDir === 'desc') {
        next.delete('sort');
        next.delete('dir');
        return;
      }
      next.set('sort', column);
      next.set('dir', nextDir);
    });
  }

  const activeSort = params.get('sort') || 'issueOn';
  const activeDir = params.get('dir') === 'asc' ? 'asc' : 'desc';
  const rows = list.data?.data ?? [];
  const meta = list.data?.meta;

  const sortIcon = (field: InboundListSort) => {
    if (activeSort !== field) return <ArrowUpDown className="h-3.5 w-3.5" />;
    return activeDir === 'asc' ? (
      <ArrowUp className="h-3.5 w-3.5" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5" />
    );
  };

  return (
    <div className="space-y-4">
      <ListPageHeader
        title="Entradas"
        description="Clique na linha para abrir a nota. O botão direito e o menu abrem o DANFE, a manifestação e os eventos."
      >
        <Button
          type="button"
          onClick={() => syncSefaz.mutate()}
          disabled={syncSefaz.isPending}
        >
          Buscar na SEFAZ
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => createManual.mutate()}
          disabled={createManual.isPending}
        >
          Nova manual
        </Button>
        <Label className="inline-flex h-9 cursor-pointer items-center rounded-md border px-4 text-sm">
          Importar XML
          <input
            type="file"
            accept=".xml,text/xml"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => {
                if (typeof reader.result === 'string') {
                  importXml.mutate({ fileName: file.name, xml: reader.result });
                }
              };
              reader.readAsText(file);
            }}
          />
        </Label>
      </ListPageHeader>

      <ListPanel
        title="Notas"
        description="A cor da linha indica a situação. Estornada e ignorada ficam cinza, e o manifesto continua na coluna."
      >
        <div className="mb-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={queueActive ? 'default' : 'outline'}
              onClick={() =>
                write((next) => {
                  if (queueActive) next.delete('queue');
                  else clearQueue(next);
                  if (!queueActive) next.set('queue', 'to_post');
                })
              }
            >
              A lançar
            </Button>
            <Button
              type="button"
              size="sm"
              variant={divergentActive ? 'default' : 'outline'}
              onClick={() =>
                write((next) => {
                  clearQueue(next);
                  if (!divergentActive) next.set('status', 'divergent');
                })
              }
            >
              Divergentes
            </Button>
            <Button
              type="button"
              size="sm"
              variant={manifestActive ? 'default' : 'outline'}
              onClick={() =>
                write((next) => {
                  clearQueue(next);
                  if (!manifestActive) next.set('manifestation', 'none');
                })
              }
            >
              Sem manifesto
            </Button>
            <Button
              type="button"
              size="sm"
              variant={postedMonthActive ? 'default' : 'outline'}
              onClick={() =>
                write((next) => {
                  clearQueue(next);
                  if (!postedMonthActive) {
                    next.set('status', 'posted');
                    next.set('inboundFrom', month.from);
                    next.set('inboundTo', month.to);
                  }
                })
              }
            >
              Lançadas no mês
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                write((next) => {
                  next.set('inboundFrom', today);
                  next.set('inboundTo', today);
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
                write((next) => {
                  next.set('inboundFrom', month.from);
                  next.set('inboundTo', month.to);
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
              placeholder="Número, chave ou emitente"
              label="Pesquisar notas"
            />
            <ListFilter
              value={knownStatus(params.get('status'))}
              label="Situação"
              allLabel="Todas as situações"
              options={(Object.keys(inboundStatusLabel) as InboundStatus[]).map(
                (item) => ({
                  value: item,
                  label: inboundStatusLabel[item],
                }),
              )}
              onValueChange={(value) =>
                write((next) => {
                  next.delete('queue');
                  if (value === 'all') next.delete('status');
                  else next.set('status', value);
                })
              }
            />
            <ListFilter
              value={knownManifestation(params.get('manifestation'))}
              label="Manifesto"
              allLabel="Todos os manifestos"
              options={(
                Object.keys(recipientManifestationLabel) as RecipientManifestation[]
              ).map((item) => ({
                value: item,
                label: recipientManifestationLabel[item],
              }))}
              onValueChange={(value) =>
                write((next) => {
                  next.delete('queue');
                  if (value === 'all') next.delete('manifestation');
                  else next.set('manifestation', value);
                })
              }
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <FloatingInput
              label="Emissão de"
              type="date"
              value={params.get('issueFrom') ?? ''}
              onChange={(event) =>
                write((next) => {
                  if (event.target.value) next.set('issueFrom', event.target.value);
                  else next.delete('issueFrom');
                })
              }
            />
            <FloatingInput
              label="Emissão até"
              type="date"
              value={params.get('issueTo') ?? ''}
              onChange={(event) =>
                write((next) => {
                  if (event.target.value) next.set('issueTo', event.target.value);
                  else next.delete('issueTo');
                })
              }
            />
            <FloatingInput
              label="Entrada de"
              type="date"
              value={params.get('inboundFrom') ?? ''}
              onChange={(event) =>
                write((next) => {
                  if (event.target.value) next.set('inboundFrom', event.target.value);
                  else next.delete('inboundFrom');
                })
              }
            />
            <FloatingInput
              label="Entrada até"
              type="date"
              value={params.get('inboundTo') ?? ''}
              onChange={(event) =>
                write((next) => {
                  if (event.target.value) next.set('inboundTo', event.target.value);
                  else next.delete('inboundTo');
                })
              }
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-max">
            <StatusListHeader columns={columns}>
              <span>Ações</span>
              {sortable.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className="inline-flex items-center gap-1 text-left"
                  onClick={() => toggleSort(key)}
                >
                  {label}
                  {sortIcon(key)}
                </button>
              ))}
              <span>Chave</span>
            </StatusListHeader>

            {list.isLoading ? (
              <ListMessage>Carregando as notas...</ListMessage>
            ) : list.isError ? (
              <ListMessage tone="error">Não foi possível carregar as notas.</ListMessage>
            ) : rows.length === 0 ? (
              <ListMessage>Nenhuma nota encontrada.</ListMessage>
            ) : (
              rows.map((row) => (
                <NoteRow
                  key={row.id}
                  row={row}
                  onOpen={() => openNote(row)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setNoteMenu({ row, x: event.clientX, y: event.clientY });
                  }}
                  onCopyKey={() => {
                    if (!row.accessKey) return;
                    void navigator.clipboard
                      .writeText(row.accessKey)
                      .then(() => toast.success('Chave copiada.'))
                      .catch(() => toast.error('Não foi possível copiar a chave.'));
                  }}
                  onDiscover={() => void confirmDiscovery(row.id)}
                  onDanfe={() => setDanfeRow(row)}
                  onMenu={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    setNoteMenu({ row, x: rect.left, y: rect.bottom });
                  }}
                />
              ))
            )}
          </div>
        </div>
        {meta ? (
          <ListPagination
            page={meta.page}
            limit={filter.limit ?? 10}
            total={meta.total}
            totalPages={meta.totalPages}
            onPageChange={setPage}
            onLimitChange={setLimit}
          />
        ) : null}
      </ListPanel>

      <InboundNoteMenu
        cursor={noteMenu}
        danfeRow={danfeRow}
        onClose={() => setNoteMenu(null)}
        onDanfeClose={() => setDanfeRow(null)}
        onManifested={() => {
          void queryClient.invalidateQueries({ queryKey: ['inbound', 'list'] });
        }}
      />
    </div>
  );
}

function NoteRow({
  row,
  onOpen,
  onContextMenu,
  onCopyKey,
  onDiscover,
  onDanfe,
  onMenu,
}: {
  row: InboundListItem;
  onOpen: () => void;
  onContextMenu: (event: MouseEvent<HTMLDivElement>) => void;
  onCopyKey: () => void;
  onDiscover: () => void;
  onDanfe: () => void;
  onMenu: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const detail = statusDetail(row);
  const supplier = row.linkedSupplierName || row.supplierName || '—';
  const tone = inboundStatusTone[row.status];
  return (
    <div
      tabIndex={0}
      aria-label={`Nota ${row.number}/${row.series}, ${inboundStatusLabel[row.status]}, ${supplier}`}
      className={cn(
        columns,
        'group mt-[5px] cursor-pointer items-center gap-3 rounded-[7px] border-l-4 border-l-[var(--status-accent)] bg-[var(--status-bg)] px-3.5 py-3 text-sm text-[#243145] transition-[background-color,box-shadow] duration-150 hover:bg-[var(--status-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]',
      )}
      style={statusToneStyle(tone)}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('[data-row-ignore]')) return;
        onOpen();
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
      onContextMenu={onContextMenu}
    >
      <span data-row-ignore className="flex gap-1">
        {row.status === 'discovered' ? (
          <Button type="button" size="sm" variant="outline" onClick={onDiscover}>
            Consultar
          </Button>
        ) : (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            title="DANFE"
            aria-label="DANFE"
            disabled={!row.accessKey}
            onClick={onDanfe}
          >
            <FileText />
          </Button>
        )}
        <Button
          type="button"
          size="icon"
          variant="ghost"
          title="Ações da nota"
          aria-label="Ações da nota"
          onClick={onMenu}
        >
          <MoreHorizontal />
        </Button>
      </span>
      <span className="min-w-0 truncate text-[var(--status-text)]">
        {row.number}/{row.series}
      </span>
      <span className="min-w-0 truncate text-[var(--status-text)]">{supplier}</span>
      <span className="text-right tabular-nums text-[var(--status-text)]">
        {formatCurrency(row.totalAmount)}
      </span>
      <span className="text-[var(--status-text)]">
        {row.inboundOn ? formatRawDate(row.inboundOn) : '—'}
      </span>
      <span className="text-[var(--status-text)]">{formatRawDate(row.issueOn)}</span>
      <span className="min-w-0">
        <span className="block font-bold text-[var(--status-text)]">
          {inboundStatusLabel[row.status]}
        </span>
        {detail ? (
          <span className="mt-1 block text-xs text-[var(--status-text)]">{detail}</span>
        ) : null}
      </span>
      <span className="min-w-0 truncate text-[var(--status-text)]">
        {row.natureName || '—'}
      </span>
      <span className="min-w-0 truncate text-[var(--status-text)]">
        {recipientManifestationLabel[row.recipientManifestation]}
      </span>
      <span data-row-ignore>
        <button
          type="button"
          className="font-mono text-xs text-[var(--status-text)] underline-offset-2 hover:underline"
          title={row.accessKey ?? undefined}
          onClick={onCopyKey}
        >
          {shortKey(row.accessKey)}
        </button>
      </span>
    </div>
  );
}
