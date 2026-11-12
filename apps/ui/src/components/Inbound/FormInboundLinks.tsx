import {
  type CostFlags,
  lineUnitCost,
  projectedAverage,
  round4,
  syncPricing,
} from '@erp-360/shared';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';

import { FormItem } from '@/components/Catalog/Items/FormItem';
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
import {
  type InboundDocument,
  type InboundDraft,
  type InboundDraftLine,
  type InboundLine,
  type InboundPricing,
  inboundService,
  inboundStatusLabel,
} from '@/services/inbound';
import { type CatalogItem, itemsService } from '@/services/items';

type Edited = 'margin' | 'price' | 'none';

interface PriceFields {
  margin: string;
  price: string;
  edited: Edited;
  error: string;
}

interface ItemInfo {
  itemId: string;
  code: string;
  name: string;
  quantity: number;
  averageCost: number;
  grossMargin: string | null;
}

interface PricingContext {
  flags: CostFlags;
  docLines: Map<number, InboundLine>;
}

type Overrides = Record<string, string | null>;

const priceMessage = 'Preço de lista menor que o custo médio.';
const marginMessage = 'Informe a margem bruta entre 0 e 100, sem incluir 100.';
const unchangedMessage = 'O lançamento não altera o preço de lista desta natureza.';
const editableStatus = new Set(['pending', 'pre_note', 'divergent']);

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

function maskPrice(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 15);
  if (!digits) return '';
  const padded = digits.padStart(5, '0');
  const fraction = padded.slice(-4);
  const integers = padded.slice(0, -4).replace(/^0+(?=\d)/, '') || '0';
  return `${integers.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${fraction}`;
}

function maskPercent(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 6);
  if (!digits) return '';
  const padded = digits.padStart(3, '0');
  const integers = padded.slice(0, -2).replace(/^0+(?=\d)/, '') || '0';
  return `${integers},${padded.slice(-2)}`;
}

function priceText(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '';
  const [integers, fraction = ''] = value.toFixed(4).split('.');
  return maskPrice(`${integers}${fraction}`);
}

function percentText(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '';
  return maskPercent(String(Math.round(value * 100)));
}

function parseMasked(value: string) {
  const text = value.replace(/\./g, '').replace(',', '.').trim();
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function parseStored(value: string | null | undefined) {
  const text = (value ?? '').trim();
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function money4(value: number | string | null | undefined) {
  const number = Number(value);
  if (value == null || value === '' || !Number.isFinite(number)) return '—';
  return number.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

function quantityText(value: number) {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
}

function asksPayment(document: InboundDocument) {
  return document.totalAmount > 0;
}

function linesFrom(document: InboundDocument): InboundDraftLine[] {
  return document.lines.map((line) => ({
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
  }));
}

function noteDraft(
  document: InboundDocument,
  lines: InboundDraftLine[],
  overrides: Overrides,
): InboundDraft {
  return {
    supplierId: document.supplierId,
    natureId: document.natureId,
    number: document.number,
    series: document.series,
    issueOn: document.issueOn,
    inboundOn: document.inboundOn,
    lines: lines.map((line) => ({
      ...line,
      entryCfop: /^[0-9]{4}$/.test(line.entryCfop ?? '') ? line.entryCfop : null,
    })),
    installments: document.installments.map((installment) => ({
      number: installment.number,
      dueOn: installment.dueOn,
      amount: installment.amount,
    })),
    finance: asksPayment(document)
      ? {
          financialStatus: document.financialStatus,
          paymentKind: document.paymentKind,
          companyCardId: document.companyCardId,
          waiverReason: document.waiverReason,
        }
      : undefined,
    pricingOverrides: Object.entries(overrides).map(([itemId, grossMargin]) => ({
      itemId,
      grossMargin,
    })),
  };
}

function snapshot(lines: InboundDraftLine[], overrides: Overrides) {
  return JSON.stringify({
    lines: lines.map((line) => [line.lineNumber, line.itemId ?? null, line.factor]),
    overrides: Object.entries(overrides).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  });
}

function projectedFor(
  context: PricingContext,
  itemId: string,
  lines: InboundDraftLine[],
  info: ItemInfo,
) {
  const incoming: { quantity: number; unitCost: number }[] = [];
  for (const line of lines) {
    if (line.itemId !== itemId) continue;
    const source = context.docLines.get(line.lineNumber);
    const stockQty = round4(line.commercialQty * line.factor);
    if (!source || !(stockQty > 0)) return null;
    incoming.push({
      quantity: stockQty,
      unitCost: lineUnitCost(
        {
          lineAmountCents: source.lineAmount,
          freightCents: source.freightAmount ?? 0,
          insuranceCents: source.insuranceAmount ?? 0,
          otherCents: source.otherAmount ?? 0,
          discountCents: source.discountAmount ?? 0,
          ipiCents: source.ipiAmount ?? 0,
          stCents: source.stAmount ?? 0,
          icmsCents: source.icmsAmount ?? 0,
          stockQty,
        },
        context.flags,
      ),
    });
  }
  return projectedAverage(info.quantity, info.averageCost, incoming);
}

function recompute(
  context: PricingContext,
  itemIds: (string | null | undefined)[],
  lines: InboundDraftLine[],
  overrides: Overrides,
  fields: Record<string, PriceFields>,
  infos: Record<string, ItemInfo>,
) {
  const nextFields = { ...fields };
  const nextOverrides = { ...overrides };
  for (const itemId of new Set(itemIds)) {
    if (!itemId) continue;
    const info = infos[itemId];
    if (!info) continue;
    const average = projectedFor(context, itemId, lines, info) ?? 0;
    const previous = fields[itemId];
    const edited: Edited = previous?.edited ?? 'none';
    const marginValue =
      edited === 'none'
        ? parseStored(itemId in overrides ? overrides[itemId] : info.grossMargin)
        : parseMasked(previous?.margin ?? '');
    const priceValue = edited === 'price' ? parseMasked(previous?.price ?? '') : null;
    const synced = syncPricing({
      average,
      marginPercent: marginValue,
      price: priceValue,
      edited,
      emptyPriceWithoutCost: true,
    });
    let error = '';
    if (
      edited === 'price' &&
      priceValue !== null &&
      average > 0 &&
      synced.marginPercent === null
    ) {
      error = priceMessage;
    }
    if (edited === 'margin' && marginValue !== null && marginValue >= 100) {
      error = marginMessage;
    }
    nextFields[itemId] = {
      edited,
      error,
      margin:
        edited === 'margin' || (edited === 'price' && error)
          ? (previous?.margin ?? '')
          : percentText(synced.marginPercent),
      price: edited === 'price' ? (previous?.price ?? '') : priceText(synced.price),
    };
    if (edited === 'margin') {
      if (marginValue === null) nextOverrides[itemId] = null;
      else if (!error) nextOverrides[itemId] = marginValue.toFixed(4);
    }
    if (edited === 'price') {
      if (priceValue === null) nextOverrides[itemId] = null;
      else if (!error && average > 0 && synced.marginPercent !== null) {
        nextOverrides[itemId] = synced.marginPercent.toFixed(4);
      }
    }
  }
  return { fields: nextFields, overrides: nextOverrides };
}

function infoFromCatalog(item: CatalogItem): ItemInfo {
  const quantity = Number(item.quantity ?? 0);
  const averageCost = Number(item.averageCost ?? 0);
  return {
    itemId: item.id,
    code: item.code,
    name: item.name,
    quantity: Number.isFinite(quantity) ? quantity : 0,
    averageCost: Number.isFinite(averageCost) ? averageCost : 0,
    grossMargin: item.grossMargin,
  };
}

function infosFromPricing(pricing: InboundPricing) {
  const infos: Record<string, ItemInfo> = {};
  for (const row of pricing.stock) {
    infos[row.itemId] = {
      itemId: row.itemId,
      code: row.code,
      name: row.name,
      quantity: Number(row.quantity) || 0,
      averageCost: Number(row.averageCost) || 0,
      grossMargin: row.grossMargin,
    };
  }
  return infos;
}

export function FormInboundLinks() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const [lines, setLines] = useState<InboundDraftLine[]>([]);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [fields, setFields] = useState<Record<string, PriceFields>>({});
  const [factorText, setFactorText] = useState<Record<number, string>>({});
  const [linkedInfo, setLinkedInfo] = useState<Record<string, ItemInfo>>({});
  const [baseline, setBaseline] = useState('');
  const [search, setSearch] = useState<Record<number, string>>({});
  const [newItemLine, setNewItemLine] = useState<number | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);

  const detailKey = ['inbound', 'detail', id];
  const pricingKey = ['inbound', 'pricing', id];
  const detail = useQuery({
    queryKey: detailKey,
    queryFn: () => inboundService.get(id),
    enabled: Boolean(id),
    refetchOnWindowFocus: false,
  });
  const pricing = useQuery({
    queryKey: pricingKey,
    queryFn: () => inboundService.pricing(id),
    enabled: Boolean(id),
    refetchOnWindowFocus: false,
  });
  const document = detail.data;
  const pricingData = pricing.data;
  const editable = Boolean(
    pricingData?.editable && document && editableStatus.has(document.status),
  );
  const discovered = pricingData?.discovered || document?.status === 'discovered';

  const itemSearch = useQuery({
    queryKey: ['inbound', 'links-item-search', search],
    queryFn: async () => {
      const entries = await Promise.all(
        Object.entries(search)
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
    enabled: editable,
  });

  const readOnlyItemIds = [
    ...new Set(
      (document?.lines ?? []).flatMap((line) => (line.itemId ? [line.itemId] : [])),
    ),
  ];
  const catalogItems = useQueries({
    queries: readOnlyItemIds.map((itemId) => ({
      queryKey: ['item', itemId],
      queryFn: () => itemsService.get(itemId),
      enabled: Boolean(pricingData) && !editable && !discovered,
      refetchOnWindowFocus: false,
    })),
  });

  useEffect(() => {
    if (discovered) navigate(`/inbound/${id}`, { state: location.state, replace: true });
  }, [discovered, id, location.state, navigate]);

  useEffect(() => {
    if (!document || !pricingData || discovered) return;
    const context: PricingContext = {
      flags: pricingData.costFlags,
      docLines: new Map(document.lines.map((line) => [line.lineNumber, line])),
    };
    const nextLines = linesFrom(document);
    const nextOverrides: Overrides = {};
    for (const override of pricingData.overrides) {
      nextOverrides[override.itemId] = override.grossMargin;
    }
    const result = editable
      ? recompute(
          context,
          nextLines.map((line) => line.itemId),
          nextLines,
          nextOverrides,
          {},
          infosFromPricing(pricingData),
        )
      : { fields: {}, overrides: nextOverrides };
    setLines(nextLines);
    setOverrides(nextOverrides);
    setFields(result.fields);
    setFactorText(
      Object.fromEntries(nextLines.map((line) => [line.lineNumber, String(line.factor)])),
    );
    setLinkedInfo({});
    setBaseline(snapshot(nextLines, nextOverrides));
  }, [document, pricingData, discovered, editable]);

  const dirty = baseline !== '' && snapshot(lines, overrides) !== baseline;

  useEffect(() => {
    if (!dirty) return;
    const onLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [dirty]);

  const save = useMutation({
    mutationFn: async () => {
      if (!document) throw new Error('Nota não carregada.');
      const saved = await inboundService.save(id, noteDraft(document, lines, overrides));
      const fresh = await inboundService.pricing(id);
      return { saved, fresh };
    },
    onSuccess: ({ saved, fresh }) => {
      queryClient.setQueryData(pricingKey, fresh);
      queryClient.setQueryData(detailKey, saved);
      void queryClient.invalidateQueries({ queryKey: ['inbound', 'list'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function backToNote() {
    navigate(`/inbound/${id}`, { state: location.state });
  }

  function goBack() {
    if (dirty) {
      setLeaveOpen(true);
      return;
    }
    backToNote();
  }

  if (detail.isPending || pricing.isPending) {
    return <p className="text-sm text-zinc-500">Carregando...</p>;
  }
  if (detail.isError) {
    return <p className="text-sm text-rose-700">{detail.error.message}</p>;
  }
  if (pricing.isError) {
    return <p className="text-sm text-rose-700">{pricing.error.message}</p>;
  }
  if (!document || !pricingData || discovered || baseline === '') return null;

  const context: PricingContext = {
    flags: pricingData.costFlags,
    docLines: new Map(document.lines.map((line) => [line.lineNumber, line])),
  };
  const infos = { ...linkedInfo, ...infosFromPricing(pricingData) };
  const catalogById = new Map(
    catalogItems.flatMap((query) => (query.data ? [[query.data.id, query.data]] : [])),
  );

  function link(lineNumber: number, item: CatalogItem) {
    const info = infos[item.id] ?? infoFromCatalog(item);
    const nextInfos = { ...infos, [item.id]: info };
    const previousId = lines.find((line) => line.lineNumber === lineNumber)?.itemId;
    const nextLines = lines.map((line) =>
      line.lineNumber === lineNumber ? { ...line, itemId: item.id } : line,
    );
    const result = recompute(
      context,
      [item.id, previousId],
      nextLines,
      overrides,
      fields,
      nextInfos,
    );
    setLinkedInfo((current) => ({ ...current, [item.id]: info }));
    setLines(nextLines);
    setFields(result.fields);
    setOverrides(result.overrides);
    setSearch((current) => ({ ...current, [lineNumber]: '' }));
  }

  function unlink(lineNumber: number) {
    const previousId = lines.find((line) => line.lineNumber === lineNumber)?.itemId;
    const nextLines = lines.map((line) =>
      line.lineNumber === lineNumber ? { ...line, itemId: null } : line,
    );
    const result = recompute(context, [previousId], nextLines, overrides, fields, infos);
    setLines(nextLines);
    setFields(result.fields);
    setOverrides(result.overrides);
  }

  function changeFactor(lineNumber: number, typed: string) {
    if (!/^\d*[.,]?\d{0,6}$/.test(typed)) return;
    setFactorText((current) => ({ ...current, [lineNumber]: typed }));
    const value = Number(typed.replace(',', '.'));
    if (!(Number.isFinite(value) && value > 0)) return;
    const line = lines.find((item) => item.lineNumber === lineNumber);
    if (!line || line.factor === value) return;
    const nextLines = lines.map((item) =>
      item.lineNumber === lineNumber ? { ...item, factor: value } : item,
    );
    const result = recompute(context, [line.itemId], nextLines, overrides, fields, infos);
    setLines(nextLines);
    setFields(result.fields);
    setOverrides(result.overrides);
  }

  function settleFactor(lineNumber: number) {
    const line = lines.find((item) => item.lineNumber === lineNumber);
    if (!line) return;
    setFactorText((current) => ({ ...current, [lineNumber]: String(line.factor) }));
  }

  function typeMargin(itemId: string, typed: string) {
    const previous = fields[itemId];
    const nextFields = {
      ...fields,
      [itemId]: {
        margin: maskPercent(typed),
        price: previous?.price ?? '',
        edited: 'margin' as const,
        error: '',
      },
    };
    const result = recompute(context, [itemId], lines, overrides, nextFields, infos);
    setFields(result.fields);
    setOverrides(result.overrides);
  }

  function typePrice(itemId: string, typed: string) {
    const previous = fields[itemId];
    const nextFields = {
      ...fields,
      [itemId]: {
        margin: previous?.margin ?? '',
        price: maskPrice(typed),
        edited: 'price' as const,
        error: '',
      },
    };
    const result = recompute(context, [itemId], lines, overrides, nextFields, infos);
    setFields(result.fields);
    setOverrides(result.overrides);
  }

  const groupIds: string[] = [];
  for (const line of lines) {
    if (line.itemId && !groupIds.includes(line.itemId)) groupIds.push(line.itemId);
  }
  groupIds.sort((left, right) =>
    (infos[left]?.code ?? '').localeCompare(infos[right]?.code ?? ''),
  );
  const unlinked = lines.filter((line) => !line.itemId);
  const newItem = lines.find((line) => line.lineNumber === newItemLine) ?? null;
  const showUnchanged = !pricingData.suggestsListPrice || !pricingData.updatesAverageCost;

  function lineRows(group: InboundDraftLine[], showSearch: boolean) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b text-left text-zinc-500">
              <th className="py-2 pr-2 font-medium">Nº</th>
              <th className="py-2 pr-2 font-medium">Código</th>
              <th className="py-2 pr-2 font-medium">Descrição</th>
              <th className="py-2 pr-2 font-medium">Qtd</th>
              <th className="py-2 pr-2 font-medium">Fator</th>
              <th className="py-2 pr-2 font-medium">Qtd na nota</th>
              <th className="py-2 font-medium">Vínculo</th>
            </tr>
          </thead>
          <tbody>
            {group.map((line) => (
              <tr key={line.lineNumber} className="border-b align-top">
                <td className="py-2 pr-2">{line.lineNumber}</td>
                <td className="py-2 pr-2">{line.supplierCode}</td>
                <td className="py-2 pr-2">{line.description}</td>
                <td className="py-2 pr-2">
                  {line.commercialQty} {line.commercialUnit}
                </td>
                <td className="py-2 pr-2">
                  {editable ? (
                    <Input
                      className="w-24"
                      inputMode="decimal"
                      aria-label={`Fator da linha ${line.lineNumber}`}
                      value={factorText[line.lineNumber] ?? String(line.factor)}
                      onChange={(event) =>
                        changeFactor(line.lineNumber, event.target.value)
                      }
                      onBlur={() => settleFactor(line.lineNumber)}
                    />
                  ) : (
                    line.factor
                  )}
                </td>
                <td className="py-2 pr-2">
                  {quantityText(round4(line.commercialQty * line.factor))}
                </td>
                <td className="py-2">
                  {showSearch && editable ? (
                    <div className="flex items-start gap-1">
                      <div className="min-w-48 space-y-1">
                        <Input
                          value={search[line.lineNumber] ?? ''}
                          placeholder="Buscar item"
                          onChange={(event) =>
                            setSearch({
                              ...search,
                              [line.lineNumber]: event.target.value,
                            })
                          }
                        />
                        <ul>
                          {(itemSearch.data?.[line.lineNumber] ?? []).map((item) => (
                            <li key={item.id}>
                              <button
                                type="button"
                                className="text-left text-zinc-700 hover:underline"
                                onClick={() => link(line.lineNumber, item)}
                              >
                                {item.code} · {item.name}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        title="Cadastrar item"
                        aria-label="Cadastrar item"
                        onClick={() => setNewItemLine(line.lineNumber)}
                      >
                        <Pencil />
                      </Button>
                    </div>
                  ) : editable ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      title="Desvincular"
                      aria-label="Desvincular"
                      onClick={() => unlink(line.lineNumber)}
                    >
                      <X />
                    </Button>
                  ) : (
                    <span className="text-zinc-700">
                      {line.itemId
                        ? `${infos[line.itemId]?.code ?? ''} ${infos[line.itemId]?.name ?? ''}`.trim()
                        : 'Sem vínculo'}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24">
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b bg-white py-3">
        <Button type="button" variant="outline" onClick={goBack}>
          Voltar
        </Button>
        <h2 className="text-xl font-bold text-zinc-900">
          Vínculos da nota {document.number}/{document.series}
        </h2>
        <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
          {inboundStatusLabel[document.status]}
        </span>
        <span className="text-sm text-zinc-600">
          {document.supplierName || 'Sem emitente'}
        </span>
      </div>

      {showUnchanged ? <p className="text-sm text-amber-700">{unchangedMessage}</p> : null}

      {unlinked.length > 0 ? (
        <section className="space-y-3 rounded-lg border bg-white p-4">
          <h3 className="font-medium text-amber-700">Sem vínculo</h3>
          {lineRows(unlinked, true)}
        </section>
      ) : null}

      {groupIds.map((itemId) => {
        const info = infos[itemId];
        const group = lines.filter((line) => line.itemId === itemId);
        const incoming = round4(
          group.reduce((total, line) => total + line.commercialQty * line.factor, 0),
        );
        const average =
          editable && info ? projectedFor(context, itemId, lines, info) : null;
        const price = fields[itemId];
        const catalogItem = catalogById.get(itemId);
        return (
          <section key={itemId} className="space-y-3 rounded-lg border bg-white p-4">
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <h3 className="font-medium text-zinc-900">
                {info?.code} · {info?.name}
              </h3>
              <p className="text-sm text-zinc-600">
                Quantidade atual: {quantityText(info?.quantity ?? 0)}
              </p>
              <p className="text-sm text-zinc-600">
                Custo médio atual: {money4(info?.averageCost ?? 0)}
              </p>
              <p className="text-sm text-zinc-600">
                Quantidade nesta nota: {quantityText(incoming)}
              </p>
              {editable ? (
                <p className="text-sm text-zinc-900">
                  Custo médio projetado: {money4(average)}
                </p>
              ) : null}
            </div>
            {editable ? (
              <div className="flex flex-wrap items-start gap-4">
                <div className="space-y-1">
                  <Label htmlFor={`margin-${itemId}`}>Margem bruta (%)</Label>
                  <Input
                    id={`margin-${itemId}`}
                    className="w-32"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={price?.margin ?? ''}
                    onChange={(event) => typeMargin(itemId, event.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`price-${itemId}`}>Preço de lista</Label>
                  <Input
                    id={`price-${itemId}`}
                    className="w-40"
                    inputMode="decimal"
                    placeholder="0,0000"
                    value={price?.price ?? ''}
                    onChange={(event) => typePrice(itemId, event.target.value)}
                  />
                </div>
                {price?.error ? (
                  <p className="pt-7 text-sm text-rose-700">{price.error}</p>
                ) : null}
              </div>
            ) : (
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-zinc-700">
                <p>Margem bruta: {percentText(parseStored(info?.grossMargin)) || '—'}</p>
                <p>Preço de lista: {money4(catalogItem?.listPrice)}</p>
              </div>
            )}
            {lineRows(group, false)}
          </section>
        );
      })}

      {editable ? (
        <div className="sticky bottom-0 z-20 flex flex-wrap items-center gap-2 border-t bg-white py-3">
          <Button
            type="button"
            variant="outline"
            disabled={!dirty || save.isPending}
            onClick={() => {
              void save.mutateAsync().then(() => toast.success('Vínculos salvos.'));
            }}
          >
            Salvar
          </Button>
        </div>
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
                link(newItem.lineNumber, item);
                setNewItemLine(null);
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Salvar alterações?</AlertDialogTitle>
            <AlertDialogDescription>
              Os vínculos têm alterações que ainda não foram salvas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar editando</AlertDialogCancel>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setLeaveOpen(false);
                backToNote();
              }}
            >
              Descartar
            </Button>
            <AlertDialogAction
              disabled={save.isPending}
              onClick={(event) => {
                event.preventDefault();
                void save.mutateAsync().then(() => {
                  toast.success('Vínculos salvos.');
                  setLeaveOpen(false);
                  backToNote();
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
