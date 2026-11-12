import { civilDate, formatCurrency, formatRawDate } from '@erp-360/shared';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  MoreHorizontal,
  Search,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';

import { InboundNoteMenu } from '@/components/Inbound/InboundNoteMenu';
import {
  filterFromSearch,
  inboundPageSize,
  monthRange,
  shortKey,
  statusDetail,
  todayInSaoPaulo,
} from '@/components/Inbound/inboundQuery';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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

const statusClass: Record<InboundStatus, string> = {
  pending: 'bg-amber-100 text-amber-800',
  pre_note: 'bg-sky-100 text-sky-800',
  divergent: 'bg-rose-100 text-rose-800',
  posted: 'bg-emerald-100 text-emerald-800',
  reversed: 'bg-zinc-200 text-zinc-700',
  ignored: 'bg-zinc-200 text-zinc-600',
  discovered: 'bg-violet-100 text-violet-800',
};

const manifestClass: Record<RecipientManifestation, string> = {
  none: 'bg-zinc-100 text-zinc-600',
  aware: 'bg-sky-100 text-sky-800',
  confirmed: 'bg-emerald-100 text-emerald-800',
  unaware: 'bg-rose-100 text-rose-800',
  not_performed: 'bg-amber-100 text-amber-800',
};

const sortable = [
  ['status', 'Situação'],
  ['number', 'Número'],
  ['supplier', 'Fornecedor'],
  ['totalAmount', 'Total'],
  ['inboundOn', 'Entrada'],
  ['issueOn', 'Emissão'],
  ['nature', 'Natureza'],
  ['manifestation', 'Manifesto do destinatário'],
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

function Badge({ className, children }: { className: string; children: string }) {
  return (
    <span
      className={`inline-flex rounded px-1.5 py-0.5 text-xs font-medium ${className}`}
    >
      {children}
    </span>
  );
}

export function ListInbounds() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [searchText, setSearchText] = useState(params.get('q') ?? '');
  const [noteMenu, setNoteMenu] = useState<{
    row: InboundListItem;
    x: number;
    y: number;
  } | null>(null);
  const [danfeRow, setDanfeRow] = useState<InboundListItem | null>(null);
  const filter = { ...filterFromSearch(location.search), limit: inboundPageSize };
  const today = todayInSaoPaulo();
  const month = monthRange(today);

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

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = searchText.trim();
      const current = params.get('q') ?? '';
      if (next === current) return;
      const updated = new URLSearchParams(params);
      if (next) updated.set('q', next);
      else updated.delete('q');
      updated.delete('page');
      setParams(updated, { replace: true });
    }, 500);
    return () => clearTimeout(timer);
  }, [searchText, params, setParams]);

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
      const current = next.get('sort');
      const dir = next.get('dir') === 'asc' ? 'desc' : 'asc';
      next.set('sort', column);
      next.set('dir', current === column ? dir : 'desc');
    });
  }

  const activeSort = params.get('sort');
  const activeDir = params.get('dir') === 'asc' ? 'asc' : 'desc';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900">Entradas</h2>
          <p className="text-sm text-zinc-500">
            Clique na linha para abrir a nota. O botão direito e o menu da coluna fixa
            abrem o DANFE, a manifestação e os eventos.
          </p>
        </div>
        <div className="flex gap-2">
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
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4">
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
        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-400" />
            <Input
              placeholder="Número, chave ou emitente"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              className="pl-9"
            />
          </div>
          <Select
            value={params.get('status') ?? 'todos'}
            onValueChange={(value) =>
              write((next) => {
                next.delete('queue');
                if (value === 'todos') next.delete('status');
                else next.set('status', value);
              })
            }
          >
            <SelectTrigger className="w-full sm:w-52">
              <SelectValue placeholder="Situação" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas as situações</SelectItem>
              {(Object.keys(inboundStatusLabel) as InboundStatus[]).map((item) => (
                <SelectItem key={item} value={item}>
                  {inboundStatusLabel[item]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={params.get('manifestation') ?? 'todos'}
            onValueChange={(value) =>
              write((next) => {
                next.delete('queue');
                if (value === 'todos') next.delete('manifestation');
                else next.set('manifestation', value);
              })
            }
          >
            <SelectTrigger className="w-full sm:w-52">
              <SelectValue placeholder="Manifesto" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os manifestos</SelectItem>
              {(Object.keys(recipientManifestationLabel) as RecipientManifestation[]).map(
                (item) => (
                  <SelectItem key={item} value={item}>
                    {recipientManifestationLabel[item]}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <span className="shrink-0 text-sm text-zinc-500">Emissão de</span>
            <Input
              type="date"
              value={params.get('issueFrom') ?? ''}
              onChange={(event) =>
                write((next) => {
                  if (event.target.value) next.set('issueFrom', event.target.value);
                  else next.delete('issueFrom');
                })
              }
              className="w-full sm:w-40"
            />
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <span className="shrink-0 text-sm text-zinc-500">até</span>
            <Input
              type="date"
              value={params.get('issueTo') ?? ''}
              onChange={(event) =>
                write((next) => {
                  if (event.target.value) next.set('issueTo', event.target.value);
                  else next.delete('issueTo');
                })
              }
              className="w-full sm:w-40"
            />
          </div>
        </div>
        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <span className="shrink-0 text-sm text-zinc-500">Entrada de</span>
            <Input
              type="date"
              value={params.get('inboundFrom') ?? ''}
              onChange={(event) =>
                write((next) => {
                  if (event.target.value) next.set('inboundFrom', event.target.value);
                  else next.delete('inboundFrom');
                })
              }
              className="w-full sm:w-40"
            />
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <span className="shrink-0 text-sm text-zinc-500">até</span>
            <Input
              type="date"
              value={params.get('inboundTo') ?? ''}
              onChange={(event) =>
                write((next) => {
                  if (event.target.value) next.set('inboundTo', event.target.value);
                  else next.delete('inboundTo');
                })
              }
              className="w-full sm:w-40"
            />
          </div>
        </div>
      </div>

      <Table className="min-w-[1180px]">
        <TableHeader>
          <TableRow>
            {sortable.map(([key, label]) => (
              <TableHead key={key}>
                <button
                  type="button"
                  className="inline-flex items-center gap-1"
                  onClick={() => toggleSort(key)}
                >
                  {label}
                  {activeSort === key ? (activeDir === 'asc' ? ' ↑' : ' ↓') : ''}
                </button>
              </TableHead>
            ))}
            <TableHead>Chave</TableHead>
            <TableHead className="sticky right-0 z-20 w-24 border-l bg-white" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {(list.data?.data ?? []).map((row) => {
            const detail = statusDetail(row);
            const supplier = row.linkedSupplierName || row.supplierName || '—';
            return (
              <TableRow
                key={row.id}
                className="cursor-pointer"
                onClick={() => openNote(row)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setNoteMenu({ row, x: event.clientX, y: event.clientY });
                }}
              >
                <TableCell>
                  <Badge className={statusClass[row.status]}>
                    {inboundStatusLabel[row.status]}
                  </Badge>
                  {detail ? (
                    <p className="mt-1 max-w-48 text-xs text-rose-700">{detail}</p>
                  ) : null}
                </TableCell>
                <TableCell>
                  {row.number}/{row.series}
                </TableCell>
                <TableCell>{supplier}</TableCell>
                <TableCell>{formatCurrency(row.totalAmount)}</TableCell>
                <TableCell>
                  {row.inboundOn ? formatRawDate(row.inboundOn) : '—'}
                </TableCell>
                <TableCell>{formatRawDate(row.issueOn)}</TableCell>
                <TableCell>{row.natureName || '—'}</TableCell>
                <TableCell>
                  <Badge className={manifestClass[row.recipientManifestation]}>
                    {recipientManifestationLabel[row.recipientManifestation]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <button
                    type="button"
                    className="font-mono text-xs text-zinc-700 underline-offset-2 hover:underline"
                    title={row.accessKey ?? undefined}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (!row.accessKey) return;
                      void navigator.clipboard
                        .writeText(row.accessKey)
                        .then(() => toast.success('Chave copiada.'))
                        .catch(() => toast.error('Não foi possível copiar a chave.'));
                    }}
                  >
                    {shortKey(row.accessKey)}
                  </button>
                </TableCell>
                <TableCell
                  className="sticky right-0 z-10 border-l bg-white"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="flex justify-end gap-1">
                    {row.status === 'discovered' ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void confirmDiscovery(row.id)}
                      >
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
                        onClick={() => setDanfeRow(row)}
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
                      onClick={(event) => {
                        const rect = event.currentTarget.getBoundingClientRect();
                        setNoteMenu({ row, x: rect.left, y: rect.bottom });
                      }}
                    >
                      <MoreHorizontal />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {list.data && list.data.meta.totalPages > 1 ? (
        <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-3">
          <div className="text-sm text-zinc-500">
            Mostrando página{' '}
            <strong className="text-zinc-900">{list.data.meta.page}</strong> de{' '}
            <strong className="text-zinc-900">{list.data.meta.totalPages}</strong> (
            {list.data.meta.total} registros no total)
          </div>
          <div className="flex space-x-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1"
              disabled={list.data.meta.page === 1}
              onClick={() => setPage(list.data.meta.page - 1)}
            >
              <ChevronLeft className="h-4 w-4" /> Anterior
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1"
              disabled={list.data.meta.page === list.data.meta.totalPages}
              onClick={() => setPage(list.data.meta.page + 1)}
            >
              Próximo <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}

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
