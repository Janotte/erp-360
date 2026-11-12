import {
  civilDate,
  formatCurrency,
  formatRawDate,
  installmentDueDates,
  splitInstallmentAmounts,
  statementDueDates,
} from '@erp-360/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, X } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';

import { FormItem } from '@/components/Catalog/Items/FormItem';
import {
  filterFromSearch,
  freightLabels,
  groupKey,
  inboundPageSize,
  labeledToken,
} from '@/components/Inbound/inboundQuery';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { companyCardService } from '@/services/companyCards';
import {
  discoveryConfirm,
  type InboundDocument,
  type InboundDraft,
  type InboundDraftLine,
  type InboundFinance,
  inboundService,
  inboundStatusLabel,
  recipientManifestationLabel,
} from '@/services/inbound';
import { itemsService } from '@/services/items';
import { personsService } from '@/services/persons';

function digitsOf(value: string | null | undefined) {
  return (value ?? '').replace(/\D/g, '');
}

function ncmForCatalog(value: string | null | undefined) {
  const digits = digitsOf(value);
  if (digits.length !== 8) return '';
  return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6)}`;
}

function barcodeForCatalog(value: string | null | undefined) {
  const digits = digitsOf(value);
  return /^[0-9]{8}$|^[0-9]{12,14}$/.test(digits) ? digits : '';
}

function cestForCatalog(value: string | null | undefined) {
  const digits = digitsOf(value);
  return /^[0-9]{7}$/.test(digits) ? digits : '';
}

function asksPayment(document: InboundDocument) {
  return document.totalAmount > 0;
}

function financeFrom(document: InboundDocument): InboundFinance {
  return {
    financialStatus: document.financialStatus,
    paymentKind: document.paymentKind,
    companyCardId: document.companyCardId,
    waiverReason: document.waiverReason,
  };
}

function draftFrom(document: InboundDocument): InboundDraft {
  return {
    supplierId: document.supplierId,
    natureId: document.natureId,
    number: document.number,
    series: document.series,
    issueOn: document.issueOn,
    inboundOn: document.inboundOn,
    lines: document.lines.map((line) => ({
      lineNumber: line.lineNumber,
      supplierCode: line.supplierCode,
      description: line.description,
      xmlCfop: line.xmlCfop,
      commercialQty: Number(line.commercialQty),
      commercialUnit: line.commercialUnit,
      unitPrice: Number(line.unitPrice),
      factor: Number(line.factor),
      entryCfop: line.entryCfop,
      itemId: line.itemId,
      barcode: line.barcode,
      ncmCode: line.ncmCode,
      cestCode: line.cestCode,
    })),
    installments: document.installments.map((installment) => ({
      number: installment.number,
      dueOn: installment.dueOn,
      amount: installment.amount,
    })),
    finance: asksPayment(document) ? financeFrom(document) : undefined,
  };
}

function lineCents(qty: number, price: number) {
  return Math.round(qty * price * 100);
}

const editableStatus = new Set(['pre_note', 'divergent', 'pending']);

const statusClass: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  pre_note: 'bg-sky-100 text-sky-800',
  divergent: 'bg-rose-100 text-rose-800',
  posted: 'bg-emerald-100 text-emerald-800',
  reversed: 'bg-zinc-200 text-zinc-700',
  ignored: 'bg-zinc-200 text-zinc-600',
  discovered: 'bg-violet-100 text-violet-800',
};

function Section({
  title,
  summary,
  tone,
  open,
  onToggle,
  children,
}: {
  title: string;
  summary: string;
  tone: 'ready' | 'attention' | 'block';
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const dot =
    tone === 'block'
      ? 'bg-rose-500'
      : tone === 'attention'
        ? 'bg-amber-500'
        : 'bg-emerald-500';
  return (
    <section className="rounded-lg border bg-white">
      <button
        type="button"
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
        <span className="font-medium text-zinc-900">{title}</span>
        <span className="ml-auto truncate pl-3 text-sm text-zinc-500">{summary}</span>
      </button>
      {open ? <div className="space-y-4 border-t px-4 py-4">{children}</div> : null}
    </section>
  );
}

function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-sm text-zinc-500">{label}</p>
      <p className="text-sm text-zinc-800">{value || '—'}</p>
    </div>
  );
}

export function FormInbound() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const from =
    (location.state as { from?: string } | null)?.from &&
    (location.state as { from?: string }).from?.startsWith('/inbound')
      ? (location.state as { from: string }).from
      : '/inbound';

  const [draft, setDraft] = useState<InboundDraft | null>(null);
  const [baseline, setBaseline] = useState('');
  const [itemSearch, setItemSearch] = useState<Record<number, string>>({});
  const [supplierSearch, setSupplierSearch] = useState('');
  const [newItemLine, setNewItemLine] = useState<number | null>(null);
  const [linkedItems, setLinkedItems] = useState<
    Record<number, { id: string; code: string; name: string }>
  >({});
  const [installmentCount, setInstallmentCount] = useState('1');
  const [bulkCfop, setBulkCfop] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmReverse, setConfirmReverse] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const prepared = useRef<string | null>(null);
  const [sections, setSections] = useState({
    fiscal: false,
    emitter: false,
    items: true,
    taxes: false,
    transport: false,
    payment: false,
    extra: false,
  });

  const natures = useQuery({
    queryKey: ['inbound', 'natures'],
    queryFn: () => inboundService.natures(),
  });
  const cards = useQuery({
    queryKey: ['company-cards'],
    queryFn: companyCardService.list,
  });
  const detail = useQuery({
    queryKey: ['inbound', 'detail', id],
    queryFn: () => inboundService.get(id),
    enabled: Boolean(id),
  });
  const danfe = useQuery({
    queryKey: ['inbound', 'danfe', id],
    queryFn: () => inboundService.danfe(id),
    enabled:
      Boolean(id) &&
      detail.data?.status !== 'discovered' &&
      Boolean(detail.data?.accessKey),
    retry: false,
  });

  const document = detail.data;
  const locked = document ? !editableStatus.has(document.status) : true;
  const dirty = Boolean(draft) && JSON.stringify(draft) !== baseline;

  useEffect(() => {
    if (!detail.data || detail.data.status === 'discovered') {
      setDraft(null);
      setBaseline('');
      return;
    }
    const server = draftFrom(detail.data);
    const next = {
      ...server,
      inboundOn:
        server.inboundOn ?? (editableStatus.has(detail.data.status) ? civilDate() : null),
    };
    setDraft(next);
    setBaseline(JSON.stringify(next));
    if (prepared.current === detail.data.id) return;
    prepared.current = detail.data.id;
    const sum = detail.data.installments.reduce((total, item) => total + item.amount, 0);
    const gap =
      detail.data.totalAmount > 0 &&
      detail.data.financialStatus !== 'waived' &&
      Math.abs(sum - detail.data.totalAmount) > 1;
    setSections((current) => ({
      ...current,
      items: true,
      payment: detail.data?.financialStatus === 'pending' || gap,
    }));
  }, [detail.data]);

  useEffect(() => {
    if (!dirty) return;
    const onLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [dirty]);

  const person = useQuery({
    queryKey: ['person', document?.supplierId],
    queryFn: () => personsService.get(document?.supplierId as string),
    enabled: Boolean(document?.supplierId),
  });
  const addresses = useQuery({
    queryKey: ['person-addresses', document?.supplierId],
    queryFn: () => personsService.listAddresses(document?.supplierId as string),
    enabled: Boolean(document?.supplierId),
  });
  const suppliers = useQuery({
    queryKey: ['inbound', 'suppliers', supplierSearch],
    queryFn: () =>
      personsService.list({
        page: 1,
        limit: 8,
        sortField: 'name',
        sortOrder: 'asc',
        search: supplierSearch.trim(),
      }),
    enabled: supplierSearch.trim().length >= 2 && !locked,
  });
  const itemQueries = useQuery({
    queryKey: ['inbound', 'item-search', itemSearch],
    queryFn: async () => {
      const entries = await Promise.all(
        Object.entries(itemSearch)
          .filter(([, term]) => term.trim().length >= 2)
          .map(async ([lineNumber, term]) => {
            const result = await itemsService.list({
              page: 1,
              limit: 8,
              sortField: 'name',
              sortOrder: 'asc',
              search: term.trim(),
            });
            return [lineNumber, result.data] as const;
          }),
      );
      return Object.fromEntries(entries);
    },
  });

  function remember(saved: InboundDocument) {
    queryClient.setQueryData(['inbound', 'detail', saved.id], saved);
    void queryClient.invalidateQueries({ queryKey: ['inbound', 'list'] });
  }

  const save = useMutation({
    mutationFn: (body: InboundDraft) => inboundService.save(id, body),
    onSuccess: remember,
    onError: (error: Error) => toast.error(error.message),
  });
  const createSupplier = useMutation({
    mutationFn: () => inboundService.createSupplier(id),
    onSuccess: (saved) => {
      remember(saved);
      if (saved.supplierRegistration === 'basic') {
        toast.success(
          'Fornecedor cadastrado com CNPJ e razão social. A consulta do CNPJ não respondeu.',
        );
        return;
      }
      if (saved.supplierRegistration === 'complete' && !saved.addressSaved) {
        toast.success(
          'Fornecedor cadastrado com os dados do CNPJ. O endereço ficou sem cidade.',
        );
        return;
      }
      toast.success(
        saved.supplierRegistration === 'complete'
          ? 'Fornecedor cadastrado com os dados do CNPJ.'
          : 'Fornecedor vinculado.',
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const postDocument = useMutation({
    mutationFn: () => inboundService.post(id),
    onSuccess: (saved) => {
      remember(saved);
      void queryClient.invalidateQueries({ queryKey: ['listaItems'] });
      toast.success('Entrada lançada.', {
        action: {
          label: 'Abrir a próxima',
          onClick: () => {
            void openNext();
          },
        },
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const removeDocument = useMutation({
    mutationFn: () => inboundService.remove(id),
    onSuccess: async () => {
      setConfirmDelete(false);
      await queryClient.invalidateQueries({ queryKey: ['inbound', 'list'] });
      toast.success('Nota excluída.');
      navigate(from);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const reverseDocument = useMutation({
    mutationFn: () => inboundService.reverse(id),
    onSuccess: (saved) => {
      setConfirmReverse(false);
      remember(saved);
      toast.success('Entrada estornada.');
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const discover = useMutation({
    mutationFn: () => inboundService.discover(id),
    onSuccess: async (result) => {
      if (result.outcome === 'imported') {
        const updated = await inboundService.get(id);
        remember(updated);
        return;
      }
      toast.success(result.message);
      await queryClient.invalidateQueries({ queryKey: ['inbound', 'detail', id] });
      await queryClient.invalidateQueries({ queryKey: ['inbound', 'list'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function confirmDiscovery() {
    if (!document || document.status !== 'discovered' || discover.isPending) return;
    const action = document.discoveryAction;
    if (action.kind === 'blocked') {
      toast.error(action.message);
      return;
    }
    if (action.kind === 'none') return;
    if (!window.confirm(discoveryConfirm[action.kind])) return;
    discover.mutate();
  }

  async function openNext() {
    const query = from.includes('?') ? from.slice(from.indexOf('?')) : '';
    const filter = { ...filterFromSearch(query), limit: inboundPageSize };
    let page = 1;
    while (page < 1000) {
      const result = await inboundService.list({ ...filter, page });
      const next = result.data.find(
        (row) =>
          ['pending', 'pre_note', 'divergent'].includes(row.status) && row.id !== id,
      );
      if (next) {
        navigate(`/inbound/${next.id}`, { state: { from } });
        return;
      }
      if (page >= result.meta.totalPages) break;
      page += 1;
    }
    navigate(from);
  }

  function goBack() {
    if (dirty) {
      setLeaveOpen(true);
      return;
    }
    navigate(from);
  }

  function payload(body: InboundDraft): InboundDraft {
    return {
      ...body,
      lines: body.lines.map((line) => ({
        ...line,
        entryCfop: /^[0-9]{4}$/.test(line.entryCfop ?? '') ? line.entryCfop : null,
      })),
    };
  }

  function patchLine(lineNumber: number, patch: Partial<InboundDraftLine>) {
    setDraft((current) =>
      current
        ? {
            ...current,
            lines: current.lines.map((line) =>
              line.lineNumber === lineNumber ? { ...line, ...patch } : line,
            ),
          }
        : current,
    );
  }

  const newItem = draft?.lines.find((line) => line.lineNumber === newItemLine) ?? null;
  const linkedLabel = (lineNumber: number, itemId: string) => {
    const saved = document?.lines.find((item) => item.lineNumber === lineNumber);
    if (saved?.itemId === itemId && saved.itemCode) {
      return `${saved.itemCode} ${saved.itemName ?? ''}`.trim();
    }
    const local = linkedItems[lineNumber];
    if (local?.id === itemId) return `${local.code} ${local.name}`;
    return 'Item selecionado';
  };

  if (detail.isPending) return <p className="text-sm text-zinc-500">Carregando...</p>;
  if (detail.isError) {
    return <p className="text-sm text-rose-700">{detail.error.message}</p>;
  }
  if (!document) return null;

  const emitter = danfe.data?.emitter;
  const principal =
    addresses.data?.find((address) => address.type === 'Principal') ??
    addresses.data?.[0];
  const ieDivergent = Boolean(
    person.data &&
    emitter &&
    digitsOf(person.data.stateRegistration) !== digitsOf(emitter.stateRegistration),
  );
  const ufDivergent = Boolean(
    principal?.stateAbbreviation &&
    emitter?.state &&
    principal.stateAbbreviation.toUpperCase() !== emitter.state.toUpperCase(),
  );
  const supplierState = !document.supplierId
    ? 'Sem cadastro'
    : document.supplierActive === false
      ? 'Inativo'
      : 'Cadastrado';
  const supplierSummary = [
    document.supplierName || 'Sem emitente',
    supplierState,
    ieDivergent ? 'IE divergente' : '',
    ufDivergent ? 'UF divergente' : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const linkedCount = draft?.lines.filter((line) => line.itemId).length ?? 0;
  const lineCount = draft?.lines.length ?? document.lines.length;
  const itemSum = document.lines.reduce((total, line) => total + line.lineAmount, 0);
  const totalsDiverge =
    danfe.data != null && Math.abs(itemSum - danfe.data.productsAmount) > 1;
  const xmlMissing = !document.accessKey || danfe.isError;
  const info = danfe.data?.additionalInfo?.trim() ?? '';
  const romaneio = labeledToken(info, 'Romaneio');
  const pedido = labeledToken(info, 'Pedido');
  const transport = danfe.data?.transport;
  const paySum = draft?.installments.reduce((total, item) => total + item.amount, 0) ?? 0;
  const payGap =
    document.totalAmount > 0 &&
    draft?.finance?.financialStatus === 'classified' &&
    Math.abs(paySum - document.totalAmount) > 1;
  const natureName =
    natures.data?.find((nature) => nature.id === draft?.natureId)?.name ||
    (draft?.natureId ? 'Natureza' : 'Sem natureza');
  const entryBeforeIssue = Boolean(
    draft?.inboundOn && draft.inboundOn < document.issueOn,
  );
  const blocker = document.blockers[0];

  return (
    <div className="space-y-4 pb-24">
      <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b bg-white py-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" onClick={goBack}>
            Voltar
          </Button>
          <h2 className="text-xl font-bold text-zinc-900">
            Nota {document.number}/{document.series}
          </h2>
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${statusClass[document.status]}`}
          >
            {inboundStatusLabel[document.status]}
          </span>
          <span className="text-sm text-zinc-600">
            {document.supplierName || 'Sem emitente'}
          </span>
          <span className="text-sm font-medium text-zinc-900">
            {formatCurrency(document.totalAmount)}
          </span>
        </div>
      </div>

      {document.status === 'discovered' ? (
        <section className="space-y-4 rounded-lg border bg-white p-4">
          <dl className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <dt className="text-sm text-zinc-500">Chave</dt>
              <dd className="break-all font-mono text-sm text-zinc-800">
                {document.accessKey || '—'}
              </dd>
            </div>
            <ReadField label="Emitente" value={document.supplierName || '—'} />
            <ReadField label="Emissão" value={formatRawDate(document.issueOn)} />
            <ReadField label="Valor" value={formatCurrency(document.totalAmount)} />
            <ReadField
              label="Manifesto do destinatário"
              value={recipientManifestationLabel[document.recipientManifestation]}
            />
          </dl>
          {document.discoveryAction.kind === 'blocked' ? (
            <p className="text-sm text-rose-700">{document.discoveryAction.message}</p>
          ) : null}
          {document.authorizationStatus === 'cancelled' ? (
            <p className="text-sm text-rose-700">Cancelada na SEFAZ</p>
          ) : null}
          {document.authorizationStatus === 'denied' ? (
            <p className="text-sm text-rose-700">Denegada na SEFAZ</p>
          ) : null}
          <Button
            type="button"
            onClick={() => void confirmDiscovery()}
            disabled={discover.isPending}
          >
            Consultar
          </Button>
        </section>
      ) : draft ? (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void save
              .mutateAsync(payload(draft))
              .then(() => toast.success('Nota salva.'));
          }}
        >
          <Section
            title="Informações fiscais"
            summary={natureName}
            tone={!draft.natureId ? 'block' : entryBeforeIssue ? 'attention' : 'ready'}
            open={sections.fiscal}
            onToggle={() => setSections({ ...sections, fiscal: !sections.fiscal })}
          >
            <div className="grid gap-4 sm:grid-cols-4">
              <ReadField label="Modelo" value={document.model} />
              {document.accessKey ? (
                <ReadField label="Número" value={document.number} />
              ) : (
                <div className="space-y-1">
                  <Label>Número</Label>
                  <Input
                    value={draft.number}
                    disabled={locked}
                    onChange={(event) =>
                      setDraft({ ...draft, number: event.target.value })
                    }
                  />
                </div>
              )}
              {document.accessKey ? (
                <ReadField label="Série" value={document.series} />
              ) : (
                <div className="space-y-1">
                  <Label>Série</Label>
                  <Input
                    value={draft.series}
                    disabled={locked}
                    onChange={(event) =>
                      setDraft({ ...draft, series: event.target.value })
                    }
                  />
                </div>
              )}
              <div className="space-y-1 sm:col-span-4">
                <p className="text-sm text-zinc-500">Chave de acesso</p>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="break-all font-mono text-sm text-zinc-800">
                    {document.accessKey ? groupKey(document.accessKey) : '—'}
                  </p>
                  {document.accessKey ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        void navigator.clipboard
                          .writeText(document.accessKey as string)
                          .then(() => toast.success('Chave copiada.'))
                          .catch(() => toast.error('Não foi possível copiar a chave.'));
                      }}
                    >
                      Copiar
                    </Button>
                  ) : null}
                </div>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Natureza da operação</Label>
                <select
                  className="flex h-9 w-full rounded-md border px-3 text-sm"
                  value={draft.natureId ?? ''}
                  disabled={locked}
                  onChange={(event) =>
                    setDraft({ ...draft, natureId: event.target.value || null })
                  }
                >
                  <option value="">Selecione</option>
                  {(natures.data ?? []).map((nature) => (
                    <option key={nature.id} value={nature.id}>
                      {nature.name}
                    </option>
                  ))}
                </select>
              </div>
              {document.accessKey ? (
                <ReadField
                  label="Data de emissão"
                  value={formatRawDate(document.issueOn)}
                />
              ) : (
                <div className="space-y-1">
                  <Label>Data de emissão</Label>
                  <Input
                    type="date"
                    value={draft.issueOn}
                    disabled={locked}
                    onChange={(event) =>
                      setDraft({ ...draft, issueOn: event.target.value })
                    }
                  />
                </div>
              )}
              <div className="space-y-1">
                <Label>Data de entrada</Label>
                <Input
                  type="date"
                  value={draft.inboundOn ?? ''}
                  disabled={locked}
                  onChange={(event) =>
                    setDraft({ ...draft, inboundOn: event.target.value || null })
                  }
                />
                {entryBeforeIssue ? (
                  <p className="text-xs text-rose-700">
                    A data de entrada não pode ser anterior à emissão.
                  </p>
                ) : null}
              </div>
            </div>
          </Section>

          <Section
            title="Emitente"
            summary={supplierSummary}
            tone={
              !document.supplierId
                ? 'block'
                : document.supplierActive === false || ieDivergent || ufDivergent
                  ? 'attention'
                  : 'ready'
            }
            open={sections.emitter}
            onToggle={() => setSections({ ...sections, emitter: !sections.emitter })}
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <ReadField
                label="Nome"
                value={emitter?.name || document.supplierName || ''}
              />
              <ReadField
                label="CNPJ"
                value={emitter?.taxId || document.supplierTaxId || ''}
              />
              <ReadField label="I.E." value={emitter?.stateRegistration || ''} />
              <ReadField label="CEP" value={emitter?.postalCode || ''} />
              <ReadField label="Logradouro" value={emitter?.street || ''} />
              <ReadField label="Bairro" value={emitter?.neighborhood || ''} />
              <ReadField label="Município" value={emitter?.city || ''} />
              <ReadField label="UF" value={emitter?.state || ''} />
            </div>
            <div className="space-y-2">
              <p className="text-sm text-zinc-700">
                {supplierState}
                {document.supplierTaxId ? ` · ${document.supplierTaxId}` : ''}
              </p>
              {!document.supplierId && document.supplierTaxId ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={createSupplier.isPending}
                  onClick={() => createSupplier.mutate()}
                >
                  {createSupplier.isPending
                    ? 'Consultando CNPJ...'
                    : 'Cadastrar fornecedor'}
                </Button>
              ) : null}
              {!locked && !document.supplierId ? (
                <>
                  <Input
                    value={supplierSearch}
                    placeholder="Buscar pessoa"
                    onChange={(event) => setSupplierSearch(event.target.value)}
                  />
                  <ul>
                    {(suppliers.data?.data ?? []).map((personRow) => (
                      <li key={personRow.id}>
                        <button
                          type="button"
                          className="text-left text-sm text-zinc-700 hover:underline"
                          onClick={() => {
                            setDraft({ ...draft, supplierId: personRow.id });
                            setSupplierSearch('');
                          }}
                        >
                          {personRow.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          </Section>

          <Section
            title="Itens"
            summary={`Itens · ${linkedCount} de ${lineCount} vinculados`}
            tone={
              draft.lines.some((line) => !line.itemId)
                ? 'block'
                : draft.lines.some((line) => !line.entryCfop)
                  ? 'attention'
                  : 'ready'
            }
            open={sections.items}
            onToggle={() => setSections({ ...sections, items: !sections.items })}
          >
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label>CFOP de entrada</Label>
                <Input
                  value={bulkCfop}
                  maxLength={4}
                  disabled={locked}
                  className="w-28"
                  onChange={(event) =>
                    setBulkCfop(event.target.value.replace(/\D/g, '').slice(0, 4))
                  }
                />
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={locked || bulkCfop.length !== 4}
                onClick={() =>
                  setDraft({
                    ...draft,
                    lines: draft.lines.map((line) => ({ ...line, entryCfop: bulkCfop })),
                  })
                }
              >
                Aplicar aos itens
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[1100px] w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-zinc-500">
                    <th className="py-2 pr-2 font-medium">Nº</th>
                    <th className="py-2 pr-2 font-medium">Código</th>
                    <th className="py-2 pr-2 font-medium">Descrição</th>
                    <th className="py-2 pr-2 font-medium">Un</th>
                    <th className="py-2 pr-2 font-medium">CFOP XML</th>
                    <th className="py-2 pr-2 font-medium">CFOP entrada</th>
                    <th className="py-2 pr-2 font-medium">Qtd</th>
                    <th className="py-2 pr-2 font-medium">Fator</th>
                    <th className="py-2 pr-2 font-medium">Unitário</th>
                    <th className="py-2 pr-2 font-medium">Total</th>
                    <th className="py-2 pr-2 font-medium">Vínculo</th>
                    <th className="py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {draft.lines.map((line) => (
                    <tr key={line.lineNumber} className="border-b align-top">
                      <td className="py-2 pr-2">{line.lineNumber}</td>
                      <td className="py-2 pr-2">{line.supplierCode}</td>
                      <td className="py-2 pr-2">
                        {document.accessKey || locked ? (
                          line.description
                        ) : (
                          <Input
                            value={line.description}
                            onChange={(event) =>
                              patchLine(line.lineNumber, {
                                description: event.target.value,
                              })
                            }
                          />
                        )}
                      </td>
                      <td className="py-2 pr-2">{line.commercialUnit}</td>
                      <td className="py-2 pr-2">{line.xmlCfop}</td>
                      <td className="py-2 pr-2">
                        <Input
                          value={line.entryCfop ?? ''}
                          maxLength={4}
                          disabled={locked}
                          className="w-24"
                          onChange={(event) =>
                            patchLine(line.lineNumber, {
                              entryCfop: event.target.value
                                .replace(/\D/g, '')
                                .slice(0, 4),
                            })
                          }
                        />
                      </td>
                      <td className="py-2 pr-2">
                        {document.accessKey || locked ? (
                          line.commercialQty
                        ) : (
                          <Input
                            className="w-24"
                            value={String(line.commercialQty)}
                            onChange={(event) => {
                              const commercialQty = Number(
                                event.target.value.replace(',', '.'),
                              );
                              patchLine(line.lineNumber, {
                                commercialQty: Number.isFinite(commercialQty)
                                  ? commercialQty
                                  : 0,
                              });
                            }}
                          />
                        )}
                      </td>
                      <td className="py-2 pr-2">
                        <Input
                          className="w-20"
                          value={String(line.factor)}
                          disabled={locked}
                          onChange={(event) => {
                            const factor = Number(event.target.value.replace(',', '.'));
                            patchLine(line.lineNumber, {
                              factor: Number.isFinite(factor) ? factor : 1,
                            });
                          }}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        {document.accessKey || locked ? (
                          line.unitPrice
                        ) : (
                          <Input
                            className="w-28"
                            value={String(line.unitPrice)}
                            onChange={(event) => {
                              const unitPrice = Number(
                                event.target.value.replace(',', '.'),
                              );
                              patchLine(line.lineNumber, {
                                unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
                              });
                            }}
                          />
                        )}
                      </td>
                      <td className="py-2 pr-2">
                        {formatCurrency(lineCents(line.commercialQty, line.unitPrice))}
                      </td>
                      <td className="py-2 pr-2">
                        {line.itemId ? (
                          <p>{linkedLabel(line.lineNumber, line.itemId)}</p>
                        ) : (
                          <p className="text-amber-700">Sem vínculo</p>
                        )}
                        {!locked ? (
                          <>
                            <Input
                              value={itemSearch[line.lineNumber] ?? ''}
                              placeholder="Buscar item"
                              onChange={(event) =>
                                setItemSearch({
                                  ...itemSearch,
                                  [line.lineNumber]: event.target.value,
                                })
                              }
                            />
                            <ul>
                              {(itemQueries.data?.[line.lineNumber] ?? []).map((item) => (
                                <li key={item.id}>
                                  <button
                                    type="button"
                                    className="text-left text-zinc-700 hover:underline"
                                    onClick={() => {
                                      patchLine(line.lineNumber, { itemId: item.id });
                                      setLinkedItems({
                                        ...linkedItems,
                                        [line.lineNumber]: {
                                          id: item.id,
                                          code: item.code,
                                          name: item.name,
                                        },
                                      });
                                      setItemSearch({
                                        ...itemSearch,
                                        [line.lineNumber]: '',
                                      });
                                    }}
                                  >
                                    {item.code} · {item.name}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </>
                        ) : null}
                      </td>
                      <td className="py-2">
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            title="Cadastrar item"
                            aria-label="Cadastrar item"
                            disabled={locked}
                            onClick={() => setNewItemLine(line.lineNumber)}
                          >
                            <Pencil />
                          </Button>
                          {!document.accessKey && draft.lines.length > 1 ? (
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              title="Excluir item"
                              aria-label="Excluir item"
                              disabled={locked}
                              onClick={() =>
                                setDraft({
                                  ...draft,
                                  lines: draft.lines.filter(
                                    (item) => item.lineNumber !== line.lineNumber,
                                  ),
                                })
                              }
                            >
                              <X />
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section
            title="Impostos"
            summary={
              xmlMissing
                ? 'Sem XML completo'
                : totalsDiverge
                  ? 'Totais divergentes'
                  : formatCurrency(document.totalAmount)
            }
            tone={xmlMissing || totalsDiverge ? 'attention' : 'ready'}
            open={sections.taxes}
            onToggle={() => setSections({ ...sections, taxes: !sections.taxes })}
          >
            {danfe.data ? (
              <div className="space-y-3 text-sm">
                <div className="grid gap-3 sm:grid-cols-5">
                  <ReadField
                    label="BC ICMS"
                    value={formatCurrency(danfe.data.icmsBase)}
                  />
                  <ReadField
                    label="Valor do ICMS"
                    value={formatCurrency(danfe.data.icmsAmount)}
                  />
                  <ReadField
                    label="BC ICMS ST"
                    value={formatCurrency(danfe.data.icmsStBase)}
                  />
                  <ReadField
                    label="Valor do ICMS ST"
                    value={formatCurrency(danfe.data.icmsStAmount)}
                  />
                  <ReadField
                    label="Valor total dos produtos"
                    value={formatCurrency(danfe.data.productsAmount)}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-6">
                  <ReadField
                    label="Frete"
                    value={formatCurrency(danfe.data.freightAmount)}
                  />
                  <ReadField
                    label="Seguro"
                    value={formatCurrency(danfe.data.insuranceAmount)}
                  />
                  <ReadField
                    label="Desconto"
                    value={formatCurrency(danfe.data.discountAmount)}
                  />
                  <ReadField
                    label="Despesas"
                    value={formatCurrency(danfe.data.otherAmount)}
                  />
                  <ReadField
                    label="Valor do IPI"
                    value={formatCurrency(danfe.data.ipiAmount)}
                  />
                  <ReadField
                    label="Valor total da NF"
                    value={formatCurrency(danfe.data.totalAmount)}
                  />
                </div>
              </div>
            ) : (
              <p className="text-sm text-zinc-500">Sem XML completo</p>
            )}
          </Section>

          <Section
            title="Transporte"
            summary={
              xmlMissing
                ? 'Sem XML completo'
                : transport
                  ? `${transport.carrierName || 'Sem transportadora'} · ${
                      freightLabels[transport.freightType] ?? transport.freightType ?? '—'
                    } · ${transport.volumeQuantity || '—'} vol. · ${transport.grossWeight || '—'} kg`
                  : '—'
            }
            tone={xmlMissing ? 'attention' : 'ready'}
            open={sections.transport}
            onToggle={() => setSections({ ...sections, transport: !sections.transport })}
          >
            {transport ? (
              <div className="grid gap-4 sm:grid-cols-4">
                <ReadField label="Razão social" value={transport.carrierName} />
                <ReadField label="CPF/CNPJ" value={transport.taxId} />
                <ReadField
                  label="Frete por conta"
                  value={freightLabels[transport.freightType] ?? transport.freightType}
                />
                <ReadField
                  label="Veículo"
                  value={[transport.plate, transport.plateState]
                    .filter(Boolean)
                    .join(' / ')}
                />
                <ReadField label="Endereço" value={transport.address} />
                <ReadField label="Município" value={transport.city} />
                <ReadField label="UF" value={transport.state} />
                <ReadField label="IE" value={transport.stateRegistration} />
                <ReadField label="Quantidade volumes" value={transport.volumeQuantity} />
                <ReadField label="Espécie" value={transport.volumeSpecies} />
                <ReadField label="Marca" value={transport.volumeBrand} />
                <ReadField label="Numeração" value={transport.volumeNumber} />
                <ReadField label="Peso bruto" value={transport.grossWeight} />
                <ReadField label="Peso líquido" value={transport.netWeight} />
              </div>
            ) : (
              <p className="text-sm text-zinc-500">Sem XML completo</p>
            )}
          </Section>

          <Section
            title="Pagamento"
            summary={
              draft.finance?.financialStatus === 'waived'
                ? 'Sem obrigação financeira'
                : draft.finance?.paymentKind === 'card'
                  ? `Cartão · ${formatCurrency(paySum)}`
                  : `Prazo com o fornecedor · ${formatCurrency(paySum)}`
            }
            tone={
              draft.finance?.financialStatus === 'pending' ||
              payGap ||
              (draft.finance?.paymentKind === 'card' && !draft.finance.companyCardId)
                ? 'block'
                : 'ready'
            }
            open={sections.payment}
            onToggle={() => setSections({ ...sections, payment: !sections.payment })}
          >
            {asksPayment(document) ? (
              <div className="space-y-3">
                <select
                  className="flex h-9 w-full max-w-sm rounded-md border px-3 text-sm"
                  value={
                    draft.finance?.financialStatus === 'waived'
                      ? 'waived'
                      : (draft.finance?.paymentKind ?? '')
                  }
                  disabled={locked}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value === 'waived') {
                      setDraft({
                        ...draft,
                        installments: [],
                        finance: {
                          financialStatus: 'waived',
                          paymentKind: null,
                          companyCardId: null,
                          waiverReason: draft.finance?.waiverReason ?? '',
                        },
                      });
                      return;
                    }
                    if (value === 'card') {
                      setDraft({
                        ...draft,
                        installments:
                          draft.finance?.paymentKind === 'card' ? draft.installments : [],
                        finance: {
                          financialStatus: 'classified',
                          paymentKind: 'card',
                          companyCardId: draft.finance?.companyCardId ?? null,
                          waiverReason: null,
                        },
                      });
                      return;
                    }
                    if (value === 'supplier') {
                      const suggested =
                        document.paymentKind === 'card'
                          ? []
                          : document.installments.map((installment) => ({
                              number: installment.number,
                              dueOn: installment.dueOn,
                              amount: installment.amount,
                            }));
                      setDraft({
                        ...draft,
                        installments:
                          suggested.length > 0
                            ? suggested
                            : [
                                {
                                  number: '001',
                                  dueOn: draft.issueOn,
                                  amount: document.totalAmount,
                                },
                              ],
                        finance: {
                          financialStatus: 'classified',
                          paymentKind: 'supplier',
                          companyCardId: null,
                          waiverReason: null,
                        },
                      });
                    }
                  }}
                >
                  <option value="">Selecione como a compra foi paga</option>
                  <option value="supplier">Prazo com o fornecedor</option>
                  <option value="card">Cartão de crédito</option>
                  <option value="waived">Sem obrigação financeira</option>
                </select>
                {draft.finance?.paymentKind === 'card' ? (
                  <select
                    className="flex h-9 w-full max-w-sm rounded-md border px-3 text-sm"
                    value={draft.finance.companyCardId ?? ''}
                    disabled={locked}
                    onChange={(event) => {
                      const companyCardId = event.target.value || null;
                      const card = (cards.data ?? []).find(
                        (item) => item.id === companyCardId,
                      );
                      const count = Number(installmentCount);
                      const dues =
                        card && Number.isInteger(count) && count >= 1 && count <= 48
                          ? statementDueDates(
                              draft.issueOn,
                              card.closingDay,
                              card.dueDay,
                              count,
                            )
                          : null;
                      setDraft({
                        ...draft,
                        installments: dues
                          ? splitInstallmentAmounts(
                              document.totalAmount,
                              dues.length,
                            ).map((amount, index) => ({
                              number: String(index + 1).padStart(3, '0'),
                              dueOn: dues[index] ?? draft.issueOn,
                              amount,
                            }))
                          : [],
                        finance: { ...draft.finance!, companyCardId },
                      });
                    }}
                  >
                    <option value="">Selecione o cartão</option>
                    {(cards.data ?? [])
                      .filter((card) => card.isActive)
                      .map((card) => (
                        <option key={card.id} value={card.id}>
                          {card.name}
                        </option>
                      ))}
                  </select>
                ) : null}
                {(cards.isSuccess ? cards.data : []).filter((card) => card.isActive)
                  .length === 0 && draft.finance?.paymentKind === 'card' ? (
                  <p className="text-sm text-zinc-500">
                    <Link to="/company-cards" className="underline">
                      Cadastre um cartão da empresa
                    </Link>{' '}
                    antes de classificar.
                  </p>
                ) : null}
                {draft.finance?.financialStatus === 'waived' ? (
                  <Input
                    value={draft.finance.waiverReason ?? ''}
                    disabled={locked}
                    placeholder="Motivo da dispensa"
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        finance: { ...draft.finance!, waiverReason: event.target.value },
                      })
                    }
                  />
                ) : null}
                {draft.finance?.financialStatus === 'classified' ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="space-y-1">
                      <Label>Parcelas</Label>
                      <Input
                        className="w-24"
                        value={installmentCount}
                        disabled={locked}
                        inputMode="numeric"
                        onChange={(event) =>
                          setInstallmentCount(
                            event.target.value.replace(/\D/g, '').slice(0, 2),
                          )
                        }
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={locked}
                      onClick={() => {
                        const count = Number(installmentCount);
                        if (!Number.isInteger(count) || count < 1 || count > 48) {
                          toast.error('A quantidade de parcelas vai de 1 a 48.');
                          return;
                        }
                        const card = (cards.data ?? []).find(
                          (item) => item.id === draft.finance?.companyCardId,
                        );
                        if (draft.finance?.paymentKind === 'card' && !card) {
                          toast.error('Informe o cartão.');
                          return;
                        }
                        const amounts = splitInstallmentAmounts(
                          document.totalAmount,
                          count,
                        );
                        const dues =
                          draft.finance?.paymentKind === 'card' && card
                            ? statementDueDates(
                                draft.issueOn,
                                card.closingDay,
                                card.dueDay,
                                count,
                              )
                            : installmentDueDates(draft.issueOn, 0, 30, count);
                        setDraft({
                          ...draft,
                          installments: amounts.map((amount, index) => ({
                            number: String(index + 1).padStart(3, '0'),
                            dueOn: dues[index],
                            amount,
                          })),
                        });
                      }}
                    >
                      Gerar parcelas
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="space-y-2">
              <p className="text-sm text-zinc-600">
                Soma {formatCurrency(paySum)} · total{' '}
                {formatCurrency(document.totalAmount)}
              </p>
              {draft.installments.map((installment, index) => (
                <div
                  key={`${installment.number}-${index}`}
                  className="grid items-center gap-2 sm:grid-cols-3"
                >
                  <p className="text-sm text-zinc-700">Parcela {installment.number}</p>
                  <Input
                    type="date"
                    value={installment.dueOn}
                    disabled={locked}
                    aria-label={`Vencimento da parcela ${installment.number}`}
                    onChange={(event) => {
                      const installments = [...draft.installments];
                      installments[index] = { ...installment, dueOn: event.target.value };
                      setDraft({ ...draft, installments });
                    }}
                  />
                  <p className="text-sm tabular-nums text-zinc-700">
                    {formatCurrency(installment.amount)}
                  </p>
                </div>
              ))}
            </div>
          </Section>

          <Section
            title="Informações adicionais"
            summary={info ? info.slice(0, 80) : xmlMissing ? 'Sem XML completo' : ''}
            tone={xmlMissing ? 'attention' : 'ready'}
            open={sections.extra}
            onToggle={() => setSections({ ...sections, extra: !sections.extra })}
          >
            {romaneio || pedido ? (
              <div className="flex flex-wrap gap-2 text-sm">
                {romaneio ? (
                  <span className="rounded bg-zinc-100 px-2 py-1">
                    Romaneio {romaneio}
                  </span>
                ) : null}
                {pedido ? (
                  <span className="rounded bg-zinc-100 px-2 py-1">Pedido {pedido}</span>
                ) : null}
              </div>
            ) : null}
            {info ? (
              <p className="whitespace-pre-wrap text-sm text-zinc-700">{info}</p>
            ) : (
              <p className="text-sm text-zinc-500">Sem XML completo</p>
            )}
          </Section>

          <div className="sticky bottom-0 z-20 flex flex-wrap items-center gap-2 border-t bg-white py-3">
            <Button
              type="submit"
              variant="outline"
              disabled={!dirty || locked || save.isPending}
            >
              Salvar
            </Button>
            <Button
              type="button"
              className="h-auto whitespace-normal"
              disabled={
                locked || Boolean(blocker) || postDocument.isPending || save.isPending
              }
              onClick={() => {
                void (async () => {
                  try {
                    if (dirty) await save.mutateAsync(payload(draft));
                    await postDocument.mutateAsync();
                  } catch {
                    return;
                  }
                })();
              }}
            >
              {blocker ?? 'Lançar'}
            </Button>
            {document.status === 'posted' ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmReverse(true)}
              >
                Estornar
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmDelete(true)}
              >
                Excluir
              </Button>
            )}
          </div>
        </form>
      ) : null}

      <Dialog
        open={newItemLine != null}
        onOpenChange={(open) => !open && setNewItemLine(null)}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Novo item</DialogTitle>
            <DialogDescription>
              Código de barras, descrição, NCM e CEST vieram da nota. Escolha a unidade de
              medida para concluir o cadastro.
            </DialogDescription>
          </DialogHeader>
          {newItem ? (
            <FormItem
              key={newItem.lineNumber}
              seed={{
                name: newItem.description,
                description: newItem.description,
                barcode: barcodeForCatalog(newItem.barcode),
                ncmCode: ncmForCatalog(newItem.ncmCode),
                cestCode: cestForCatalog(newItem.cestCode),
              }}
              onSuccess={(item) => {
                const lineNumber = newItem.lineNumber;
                patchLine(lineNumber, { itemId: item.id });
                setLinkedItems((current) => ({
                  ...current,
                  [lineNumber]: { id: item.id, code: item.code, name: item.name },
                }));
                setItemSearch((current) => ({ ...current, [lineNumber]: '' }));
                setNewItemLine(null);
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir nota</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja excluir esta nota? As parcelas ligadas a ela também saem do pagar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={removeDocument.isPending}
              onClick={(event) => {
                event.preventDefault();
                removeDocument.mutate();
              }}
            >
              {removeDocument.isPending ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmReverse} onOpenChange={setConfirmReverse}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Estornar nota</AlertDialogTitle>
            <AlertDialogDescription>
              O estoque e os títulos desta entrada serão estornados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={reverseDocument.isPending}
              onClick={(event) => {
                event.preventDefault();
                reverseDocument.mutate();
              }}
            >
              {reverseDocument.isPending ? 'Estornando...' : 'Estornar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Salvar alterações?</AlertDialogTitle>
            <AlertDialogDescription>
              A nota tem alterações que ainda não foram salvas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar editando</AlertDialogCancel>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setLeaveOpen(false);
                navigate(from);
              }}
            >
              Descartar
            </Button>
            <AlertDialogAction
              disabled={save.isPending || !draft}
              onClick={(event) => {
                event.preventDefault();
                if (!draft) return;
                void save.mutateAsync(payload(draft)).then(() => {
                  toast.success('Nota salva.');
                  setLeaveOpen(false);
                  navigate(from);
                });
              }}
            >
              Salvar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
