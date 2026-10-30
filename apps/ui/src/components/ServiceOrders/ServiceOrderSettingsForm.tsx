import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  type LabelChange,
  type ServiceOrderFieldSetting,
  type ServiceOrderNoteSetting,
  type ServiceOrderSettings,
  serviceOrdersService,
  type ServiceOrderWidth,
} from '@/services/serviceOrders';

const queryKey = ['settings', 'service-order'] as const;

const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm';

function fieldCode(slot: string): string {
  return `Campo ${slot.slice(-2)}`;
}

function lineCode(slot: string): string {
  return `Linha ${slot.slice(-2)}`;
}

export function ServiceOrderSettingsForm() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: serviceOrdersService.getSettings,
  });
  const [draft, setDraft] = useState<ServiceOrderSettings | null>(null);
  const [labelChange, setLabelChange] = useState<LabelChange | null>(null);

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  const save = useMutation({
    mutationFn: (confirmLabelChange: boolean) => {
      if (!draft) throw new Error('A aba da ordem ainda não carregou.');
      return serviceOrdersService.saveSettings({
        ...draft,
        ...(confirmLabelChange ? { confirmLabelChange: true } : {}),
      });
    },
    onSuccess: (result) => {
      if (!result.ok) {
        setLabelChange(result.change);
        return;
      }
      setLabelChange(null);
      queryClient.setQueryData(queryKey, result.settings);
      toast.success('Aba da ordem salva.');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Falha ao salvar a aba da ordem.');
    },
  });

  if (isError) {
    return <p className="text-sm text-red-600">Não foi possível carregar a aba da ordem.</p>;
  }
  if (isLoading || !draft) {
    return <p className="text-sm text-zinc-500">Carregando a aba da ordem...</p>;
  }

  const activeFields = draft.fields.filter((field) => field.isActive);
  const summaryChoices =
    activeFields.some((field) => field.slot === draft.summarySlot)
      ? activeFields
      : draft.fields.filter((field) => field.isActive || field.slot === draft.summarySlot);

  function patch(partial: Partial<ServiceOrderSettings>) {
    setDraft((current) => (current ? { ...current, ...partial } : current));
  }

  function patchField(slot: string, partial: Partial<ServiceOrderFieldSetting>) {
    setDraft((current) =>
      current
        ? {
            ...current,
            fields: current.fields.map((field) => (field.slot === slot ? { ...field, ...partial } : field)),
          }
        : current,
    );
  }

  function patchNote(slot: string, partial: Partial<ServiceOrderNoteSetting>) {
    setDraft((current) =>
      current
        ? {
            ...current,
            noteLines: current.noteLines.map((line) => (line.slot === slot ? { ...line, ...partial } : line)),
          }
        : current,
    );
  }

  return (
    <form
      className="max-w-5xl space-y-6 rounded-lg border bg-white p-6"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate(false);
      }}
    >
      <div>
        <h3 className="text-lg font-semibold text-zinc-900">Ordem de serviço</h3>
        <p className="text-sm text-zinc-500">
          Rótulos, obrigatoriedade e largura dos onze endereços. A lista mostra o campo escolhido. Trocar um
          rótulo que já tem valor em ordem aberta pede confirmação.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Título da seção" value={draft.sectionTitle} onChange={(sectionTitle) => patch({ sectionTitle })} />
        <Field label="Título dos produtos" value={draft.productsTitle} onChange={(productsTitle) => patch({ productsTitle })} />
        <Field label="Título dos serviços" value={draft.servicesTitle} onChange={(servicesTitle) => patch({ servicesTitle })} />
        <Field
          label="Assinatura do técnico"
          value={draft.technicianSignatureLabel}
          onChange={(technicianSignatureLabel) => patch({ technicianSignatureLabel })}
        />
        <Field
          label="Assinatura do cliente"
          value={draft.customerSignatureLabel}
          onChange={(customerSignatureLabel) => patch({ customerSignatureLabel })}
        />
        <div className="space-y-1.5">
          <Label htmlFor="service-order-summary">Campo da lista</Label>
          <select
            id="service-order-summary"
            className={selectClass}
            value={draft.summarySlot}
            onChange={(event) => patch({ summarySlot: event.target.value })}
          >
            {summaryChoices.map((field) => (
              <option key={field.slot} value={field.slot}>
                {fieldCode(field.slot)} — {field.label || 'sem rótulo'}
                {field.isActive ? '' : ' (inativo)'}
              </option>
            ))}
          </select>
        </div>
      </div>

      <section className="space-y-2">
        <h4 className="text-sm font-semibold text-zinc-900">Campos</h4>
        <div className="hidden gap-2 px-1 text-xs font-medium text-zinc-500 md:grid md:grid-cols-[6.5rem_5rem_minmax(0,1fr)_7.5rem_6rem]">
          <span>Código</span>
          <span>Ativo</span>
          <span>Rótulo</span>
          <span>Obrigatório</span>
          <span>Largura</span>
        </div>
        {draft.fields.map((field) => (
          <div
            key={field.slot}
            className="grid gap-2 rounded-md border p-3 md:grid-cols-[6.5rem_5rem_minmax(0,1fr)_7.5rem_6rem] md:items-center md:border-0 md:p-1"
          >
            <span className="text-sm font-medium text-zinc-800">{fieldCode(field.slot)}</span>
            <Check
              id={`${field.slot}-active`}
              label="Ativo"
              checked={field.isActive}
              onChange={(isActive) => patchField(field.slot, { isActive })}
            />
            <Input
              aria-label={`Rótulo do ${fieldCode(field.slot)}`}
              value={field.label}
              maxLength={60}
              onChange={(event) => patchField(field.slot, { label: event.target.value })}
            />
            <Check
              id={`${field.slot}-required`}
              label="Obrigatório"
              checked={field.isRequired}
              onChange={(isRequired) => patchField(field.slot, { isRequired })}
            />
            <select
              aria-label={`Largura do ${fieldCode(field.slot)}`}
              className={selectClass}
              value={field.width}
              onChange={(event) => patchField(field.slot, { width: Number(event.target.value) as ServiceOrderWidth })}
            >
              <option value={4}>4</option>
              <option value={6}>6</option>
              <option value={12}>12</option>
            </select>
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <h4 className="text-sm font-semibold text-zinc-900">Observações da folha</h4>
        {draft.noteLines.map((line) => (
          <div key={line.slot} className="grid gap-2 rounded-md border p-3 md:grid-cols-[6.5rem_5rem_minmax(0,1fr)] md:items-start">
            <span className="pt-2 text-sm font-medium text-zinc-800">{lineCode(line.slot)}</span>
            <Check
              id={`${line.slot}-active`}
              label="Ativo"
              checked={line.isActive}
              onChange={(isActive) => patchNote(line.slot, { isActive })}
            />
            <textarea
              aria-label={`Texto da ${lineCode(line.slot)}`}
              className="min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
              maxLength={500}
              value={line.body}
              onChange={(event) => patchNote(line.slot, { body: event.target.value })}
            />
          </div>
        ))}
      </section>

      <Button type="submit" disabled={save.isPending}>
        {save.isPending ? 'Salvando...' : 'Salvar'}
      </Button>

      <AlertDialog open={labelChange !== null} onOpenChange={(open) => { if (!open) setLabelChange(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Trocar o rótulo?</AlertDialogTitle>
            <AlertDialogDescription>
              Estes campos já têm valor em ordem aberta. O texto continua no mesmo endereço e passa a aparecer
              com o rótulo novo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-700">
            {labelChange?.slots.map((slot) => {
              const field = draft.fields.find((item) => item.slot === slot);
              return (
                <li key={slot}>
                  {fieldCode(slot)}
                  {field?.label ? ` — ${field.label}` : ''}
                </li>
              );
            })}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button type="button" disabled={save.isPending} onClick={() => save.mutate(true)}>
              Confirmar
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const id = `service-order-${label}`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} maxLength={60} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function Check({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center space-x-2">
      <Checkbox id={id} checked={checked} onCheckedChange={(value) => onChange(value === true)} />
      <label htmlFor={id} className="text-sm">
        {label}
      </label>
    </div>
  );
}
