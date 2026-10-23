import { civilDate, formatCurrency, formatRawDate } from '@erp-360/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { FormItem } from '@/components/Catalog/Items/FormItem';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  type InboundDocument,
  type InboundDraft,
  inboundService,
  inboundStatusLabel,
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

function draftFrom(document: InboundDocument): InboundDraft {
  return {
    supplierId: document.supplierId,
    natureId: document.natureId,
    number: document.number,
    series: document.series,
    issueOn: document.issueOn,
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
  };
}

export function InboundPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<InboundDraft | null>(null);
  const [itemSearch, setItemSearch] = useState<Record<number, string>>({});
  const [supplierSearch, setSupplierSearch] = useState('');
  const [newItemLine, setNewItemLine] = useState<number | null>(null);
  const [linkedItems, setLinkedItems] = useState<
    Record<number, { id: string; code: string; name: string }>
  >({});

  const natures = useQuery({
    queryKey: ['inbound', 'natures'],
    queryFn: inboundService.natures,
  });
  const list = useQuery({
    queryKey: ['inbound', 'list'],
    queryFn: inboundService.list,
  });
  const detail = useQuery({
    queryKey: ['inbound', 'detail', selectedId],
    queryFn: () => inboundService.get(selectedId as string),
    enabled: Boolean(selectedId),
  });

  useEffect(() => {
    if (!detail.data) return;
    setDraft(draftFrom(detail.data));
  }, [detail.data]);

  const refresh = async (document: InboundDocument) => {
    setSelectedId(document.id);
    setDraft(draftFrom(document));
    await queryClient.invalidateQueries({ queryKey: ['inbound', 'list'] });
    queryClient.setQueryData(['inbound', 'detail', document.id], document);
  };

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
      void refresh(document);
      toast.success('Pré-nota criada.');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const importXml = useMutation({
    mutationFn: ({ fileName, xml }: { fileName: string; xml: string }) =>
      inboundService.importXml(fileName, xml),
    onSuccess: (document) => {
      void refresh(document);
      toast.success('XML importado.');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const save = useMutation({
    mutationFn: () => inboundService.save(selectedId as string, draft as InboundDraft),
    onSuccess: (document) => {
      void refresh(document);
      toast.success('Nota salva.');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const createSupplier = useMutation({
    mutationFn: () => inboundService.createSupplier(selectedId as string),
    onSuccess: (document) => {
      void refresh(document);
      toast.success('Fornecedor vinculado.');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const postDocument = useMutation({
    mutationFn: () => inboundService.post(selectedId as string),
    onSuccess: (document) => {
      void refresh(document);
      void queryClient.invalidateQueries({ queryKey: ['listaItems'] });
      toast.success('Entrada lançada.');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeDocument = useMutation({
    mutationFn: () => inboundService.remove(selectedId as string),
    onSuccess: async () => {
      setSelectedId(null);
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: ['inbound', 'list'] });
      toast.success('Nota excluída.');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const reverseDocument = useMutation({
    mutationFn: () => inboundService.reverse(selectedId as string),
    onSuccess: (document) => {
      void refresh(document);
      toast.success('Entrada estornada.');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const document = detail.data;
  const locked = document
    ? !['pre_note', 'divergent', 'pending'].includes(document.status)
    : true;
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900">Entradas</h2>
          <p className="text-sm text-zinc-500">
            NF-e modelo 55 e lançamento manual. A data da última entrada do item é gravada
            no lançamento.
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => createManual.mutate()}>
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

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Número</TableHead>
            <TableHead>Fornecedor</TableHead>
            <TableHead>Emissão</TableHead>
            <TableHead>Entrada</TableHead>
            <TableHead>Valor</TableHead>
            <TableHead>Situação</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(list.data ?? []).map((row) => (
            <TableRow
              key={row.id}
              className="cursor-pointer"
              onClick={() => setSelectedId(row.id)}
            >
              <TableCell>
                {row.number}/{row.series}
              </TableCell>
              <TableCell>{row.linkedSupplierName || row.supplierName || '—'}</TableCell>
              <TableCell>{formatRawDate(row.issueOn)}</TableCell>
              <TableCell>{row.inboundOn ? formatRawDate(row.inboundOn) : '—'}</TableCell>
              <TableCell>{formatCurrency(row.totalAmount)}</TableCell>
              <TableCell>{inboundStatusLabel[row.status]}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {document && draft ? (
        <form
          className="space-y-4 rounded-lg border bg-white p-4"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-lg font-bold text-zinc-900">
              Nota {document.number}/{document.series}
            </h3>
            <span className="text-sm text-zinc-500">
              {inboundStatusLabel[document.status]}
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <Label>Natureza</Label>
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
            <div className="space-y-1">
              <Label>Fornecedor</Label>
              <p className="text-sm text-zinc-700">
                {document.supplierName || 'Não vinculado'}
                {document.supplierTaxId ? ` · ${document.supplierTaxId}` : ''}
              </p>
              {!document.supplierId && document.supplierTaxId ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => createSupplier.mutate()}
                >
                  Cadastrar fornecedor
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
                    {(suppliers.data?.data ?? []).map((person) => (
                      <li key={person.id}>
                        <button
                          type="button"
                          className="text-left text-sm text-zinc-700 hover:underline"
                          onClick={() => {
                            setDraft({ ...draft, supplierId: person.id });
                            setSupplierSearch('');
                          }}
                        >
                          {person.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label>Total</Label>
              <p className="text-sm text-zinc-700">
                {formatCurrency(document.totalAmount)}
              </p>
            </div>
          </div>

          {draft.installments.length > 0 ? (
            <div className="space-y-2">
              <Label>Parcelas</Label>
              {draft.installments.map((installment, index) => (
                <div
                  key={installment.number}
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
          ) : null}

          <div className="space-y-3">
            {draft.lines.map((line, index) => (
              <div key={line.lineNumber} className="rounded-md border p-3 text-sm">
                <p className="font-medium text-zinc-900">
                  {line.lineNumber}. {line.description}
                </p>
                {!document.accessKey && !locked ? (
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    <Input
                      value={line.description}
                      onChange={(event) => {
                        const lines = [...draft.lines];
                        lines[index] = { ...line, description: event.target.value };
                        setDraft({ ...draft, lines });
                      }}
                    />
                    <Input
                      value={String(line.commercialQty)}
                      onChange={(event) => {
                        const commercialQty = Number(
                          event.target.value.replace(',', '.'),
                        );
                        const lines = [...draft.lines];
                        lines[index] = {
                          ...line,
                          commercialQty: Number.isFinite(commercialQty)
                            ? commercialQty
                            : 0,
                        };
                        setDraft({ ...draft, lines });
                      }}
                    />
                    <Input
                      value={String(line.unitPrice)}
                      onChange={(event) => {
                        const unitPrice = Number(event.target.value.replace(',', '.'));
                        const lines = [...draft.lines];
                        lines[index] = {
                          ...line,
                          unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
                        };
                        setDraft({ ...draft, lines });
                      }}
                    />
                  </div>
                ) : (
                  <p className="text-zinc-500">
                    Código {line.supplierCode} · CFOP {line.xmlCfop} · qtd{' '}
                    {line.commercialQty} {line.commercialUnit}
                  </p>
                )}
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  <Input
                    value={line.entryCfop ?? ''}
                    maxLength={4}
                    disabled={locked}
                    placeholder="CFOP de entrada"
                    onChange={(event) => {
                      const lines = [...draft.lines];
                      lines[index] = {
                        ...line,
                        entryCfop: event.target.value.replace(/\D/g, '').slice(0, 4),
                      };
                      setDraft({ ...draft, lines });
                    }}
                  />
                  <Input
                    value={String(line.factor)}
                    disabled={locked}
                    placeholder="Fator"
                    onChange={(event) => {
                      const factor = Number(event.target.value.replace(',', '.'));
                      const lines = [...draft.lines];
                      lines[index] = {
                        ...line,
                        factor: Number.isFinite(factor) ? factor : 1,
                      };
                      setDraft({ ...draft, lines });
                    }}
                  />
                  <div className="flex gap-2">
                    <Input
                      className="min-w-0 flex-1"
                      value={itemSearch[line.lineNumber] ?? ''}
                      disabled={locked}
                      placeholder="Buscar item do catálogo"
                      onChange={(event) =>
                        setItemSearch({
                          ...itemSearch,
                          [line.lineNumber]: event.target.value,
                        })
                      }
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="shrink-0"
                      disabled={locked}
                      title="Cadastrar item com os dados da nota"
                      aria-label="Cadastrar item com os dados da nota"
                      onClick={() => setNewItemLine(line.lineNumber)}
                    >
                      <Plus />
                    </Button>
                  </div>
                </div>
                {line.itemId ? (
                  <p className="mt-1 text-zinc-600">
                    Vinculado: {linkedLabel(line.lineNumber, line.itemId)}
                  </p>
                ) : (
                  <p className="mt-1 text-amber-700">Sem vínculo</p>
                )}
                <ul className="mt-1">
                  {(itemQueries.data?.[line.lineNumber] ?? []).map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className="text-left text-zinc-700 hover:underline"
                        onClick={() => {
                          const lines = [...draft.lines];
                          lines[index] = { ...line, itemId: item.id };
                          setDraft({ ...draft, lines });
                          setLinkedItems((current) => ({
                            ...current,
                            [line.lineNumber]: {
                              id: item.id,
                              code: item.code,
                              name: item.name,
                            },
                          }));
                          setItemSearch({ ...itemSearch, [line.lineNumber]: '' });
                        }}
                      >
                        {item.code} · {item.name}
                        {item.tracksStock
                          ? ` · disponível ${Number(item.quantity ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 4 })}`
                          : ''}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {document.blockers.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-rose-700">
              {document.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="outline" disabled={locked || save.isPending}>
              Salvar
            </Button>
            <Button
              type="button"
              disabled={locked || document.blockers.length > 0 || postDocument.isPending}
              onClick={() => postDocument.mutate()}
            >
              Lançar
            </Button>
            {document.status === 'posted' ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => reverseDocument.mutate()}
              >
                Estornar
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                disabled={removeDocument.isPending}
                onClick={() => {
                  if (
                    !window.confirm(
                      'Excluir esta nota? As parcelas ligadas a ela também saem do pagar.',
                    )
                  ) {
                    return;
                  }
                  removeDocument.mutate();
                }}
              >
                Excluir
              </Button>
            )}
          </div>
        </form>
      ) : null}

      <Dialog
        open={newItemLine != null}
        onOpenChange={(open) => {
          if (!open) setNewItemLine(null);
        }}
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
                setDraft((current) =>
                  current
                    ? {
                        ...current,
                        lines: current.lines.map((line) =>
                          line.lineNumber === lineNumber
                            ? { ...line, itemId: item.id }
                            : line,
                        ),
                      }
                    : current,
                );
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
    </div>
  );
}
