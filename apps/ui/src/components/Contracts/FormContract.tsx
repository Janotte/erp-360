import {
  contractBillingSchedule,
  formatCurrency,
  formatCurrencyInput,
  maskCurrencyInput,
  parseCurrencyToCents,
} from '@erp-360/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type KeyboardEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';

import { PersonSearchSelect } from '@/components/Persons/PersonSearchSelect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  type ContractBillingCompetence,
  type ContractBillingKind,
  type ContractDetail,
  type ContractEvent,
  type ContractInput,
  contractsService,
  type ContractStatus,
} from '@/services/contracts';
import { paymentMethodsService } from '@/services/paymentMethods';

const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm';

function focusNextField(form: HTMLFormElement, current: HTMLElement) {
  const fields = Array.from(
    form.querySelectorAll<HTMLElement>('[data-enter-sequence]'),
  ).filter((field) => !field.hasAttribute('disabled'));
  const index = fields.findIndex((field) => field === current || field.contains(current));
  if (index < 0) return;
  fields[index + 1]?.focus();
}

function onEnterSequence(event: KeyboardEvent<HTMLFormElement>) {
  if (event.key !== 'Enter' || event.nativeEvent.isComposing || event.defaultPrevented)
    return;
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (target instanceof HTMLTextAreaElement && event.shiftKey) return;
  if (target instanceof HTMLButtonElement && target.type === 'submit') return;
  const field = target.closest<HTMLElement>('[data-enter-sequence]');
  if (
    !field &&
    (target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement)
  ) {
    event.preventDefault();
    return;
  }
  if (!field || field.hasAttribute('disabled') || field instanceof HTMLButtonElement) return;
  event.preventDefault();
  focusNextField(event.currentTarget, field);
}

const statusLabels: Record<ContractStatus, string> = {
  draft: 'Rascunho',
  active: 'Vigente',
  suspended: 'Suspenso',
  closed: 'Encerrado',
  cancelled: 'Cancelado',
};

const billingKindLabels: Record<ContractBillingKind, string> = {
  none: 'Sem cobrança',
  monthly: 'Mensal',
  quarterly: 'Trimestral',
  semiannual: 'Semestral',
  annual: 'Anual',
};

const competenceLabels: Record<ContractBillingCompetence, string> = {
  current: 'Atual',
  previous: 'Anterior',
};

const orderStatusLabels: Record<string, string> = {
  open: 'Aberta',
  analyzing: 'Em análise',
  waiting_approval: 'Aguardando aprovação',
  waiting_parts: 'Aguardando peça',
  in_progress: 'Em execução',
  ready: 'Pronta',
  delivered: 'Entregue',
  cancelled: 'Cancelada',
};

type Draft = {
  personId: string;
  title: string;
  startedOn: string;
  endedOn: string;
  billingKind: ContractBillingKind;
  billingCompetence: ContractBillingCompetence | '';
  amount: string;
  dueDay: string;
  paymentMethodId: string;
  notes: string;
  status: ContractStatus;
  suspensionReason: string;
};

function emptyDraft(): Draft {
  return {
    personId: '',
    title: '',
    startedOn: '',
    endedOn: '',
    billingKind: 'none',
    billingCompetence: '',
    amount: '',
    dueDay: '',
    paymentMethodId: '',
    notes: '',
    status: 'draft',
    suspensionReason: '',
  };
}

function draftFromContract(contract: ContractDetail): Draft {
  return {
    personId: contract.personId,
    title: contract.title,
    startedOn: contract.startedOn,
    endedOn: contract.endedOn ?? '',
    billingKind: contract.billingKind,
    billingCompetence: contract.billingCompetence ?? '',
    amount:
      contract.billingKind === 'none' ? '' : formatCurrencyInput(contract.periodAmount),
    dueDay: contract.dueDay ? String(contract.dueDay) : '',
    paymentMethodId: contract.paymentMethodId ?? '',
    notes: contract.notes,
    status: contract.status,
    suspensionReason: contract.suspensionReason ?? '',
  };
}

function formatDate(value: string) {
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function toInput(draft: Draft): ContractInput {
  const recurring = draft.billingKind !== 'none';
  const dueDay = Number(draft.dueDay);
  return {
    personId: draft.personId,
    title: draft.title.trim(),
    startedOn: draft.startedOn,
    endedOn: draft.endedOn || null,
    billingKind: draft.billingKind,
    billingCompetence:
      recurring && draft.billingCompetence ? draft.billingCompetence : null,
    periodAmount: recurring ? parseCurrencyToCents(draft.amount) : 0,
    dueDay: recurring && draft.dueDay !== '' && Number.isInteger(dueDay) ? dueDay : null,
    paymentMethodId: recurring ? draft.paymentMethodId || null : null,
    notes: draft.notes.trim(),
  };
}

function scheduleOf(draft: Draft) {
  if (draft.billingKind === 'none') return [];
  const dueDay = Number(draft.dueDay);
  if (!draft.startedOn || !draft.endedOn || !draft.billingCompetence) return [];
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) return [];
  try {
    return contractBillingSchedule({
      startedOn: draft.startedOn,
      endedOn: draft.endedOn,
      billingKind: draft.billingKind,
      billingCompetence: draft.billingCompetence,
      dueDay,
    });
  } catch {
    return [];
  }
}

function eventTitle(event: ContractEvent) {
  if (event.kind === 'status') {
    if (!event.fromStatus) return 'Rascunho';
    return `${statusLabels[event.fromStatus]} → ${statusLabels[event.toStatus]}`;
  }
  const kind = billingKindLabels[event.billingKind];
  const competence = event.billingCompetence
    ? competenceLabels[event.billingCompetence]
    : 'Sem cobrança';
  const day = event.dueDay ? ` · dia ${event.dueDay}` : '';
  return `Cobrança · ${kind} · ${competence} · ${formatCurrency(event.periodAmount)}${day}`;
}

export function FormContract() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(id ? null : emptyDraft());
  const [suspending, setSuspending] = useState(false);
  const [reason, setReason] = useState('');

  const contract = useQuery({
    queryKey: ['contract', id],
    queryFn: () => contractsService.get(id ?? ''),
    enabled: Boolean(id),
  });
  const methods = useQuery({
    queryKey: ['payment-methods', 'service-order'],
    queryFn: () =>
      paymentMethodsService.list({
        page: 1,
        limit: 100,
        sortField: 'name',
        sortOrder: 'asc',
        isActive: true,
        channel: 'serviceOrder',
      }),
  });

  useEffect(() => {
    if (contract.data) setDraft(draftFromContract(contract.data));
  }, [contract.data]);

  const save = useMutation({
    mutationFn: async (next: {
      status: ContractStatus;
      suspensionReason: string | null;
      backToList?: boolean;
    }) => {
      if (!draft) throw new Error('O contrato ainda não carregou.');
      if (!draft.personId) throw new Error('Informe o cliente.');
      if (!draft.title.trim()) throw new Error('Informe o título.');
      if (!draft.startedOn) throw new Error('Informe o início da vigência.');
      if (next.status === 'suspended' && !next.suspensionReason?.trim()) {
        throw new Error('Informe o motivo da suspensão.');
      }
      const input = toInput(draft);
      let contractId = id;
      let openedId: string | null = null;
      if (!contractId) {
        const created = await contractsService.create(input);
        openedId = created.id;
        contractId = created.id;
        queryClient.setQueryData(['contract', created.id], created);
        if (next.status === 'draft') return created;
      }
      try {
        return await contractsService.update(contractId, {
          ...input,
          status: next.status,
          suspensionReason: next.suspensionReason,
        });
      } catch (error) {
        if (openedId) {
          void queryClient.invalidateQueries({ queryKey: ['contracts'] });
          navigate(`/contracts/${openedId}`);
        }
        throw error;
      }
    },
    onSuccess: (saved, next) => {
      queryClient.setQueryData(['contract', saved.id], saved);
      void queryClient.invalidateQueries({ queryKey: ['contracts'] });
      setSuspending(false);
      setReason('');
      toast.success('Contrato salvo.');
      if (next.backToList) {
        navigate('/contracts');
        return;
      }
      if (!id) navigate(`/contracts/${saved.id}`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Falha ao salvar o contrato.');
    },
  });

  if (id && contract.isLoading) {
    return <p className="text-sm text-zinc-500">Carregando o contrato...</p>;
  }
  if (id && contract.isError) {
    return <p className="text-sm text-red-600">Não foi possível carregar o contrato.</p>;
  }
  if (!draft) return null;

  const locked = draft.status === 'closed' || draft.status === 'cancelled';
  const recurring = draft.billingKind !== 'none';
  const schedule = scheduleOf(draft);
  const frozen = draft.status !== 'draft';

  function patch(partial: Partial<Draft>) {
    setDraft((current) => (current ? { ...current, ...partial } : current));
  }

  return (
    <form
      className="space-y-6"
      onKeyDown={onEnterSequence}
      onSubmit={(event) => event.preventDefault()}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900">
            {id ? `Contrato ${contract.data?.numberLabel ?? ''}` : 'Novo contrato'}
          </h2>
          <p className="text-sm text-zinc-500">
            {statusLabels[draft.status]}
            {contract.data?.termExpired ? ' · Vigência vencida' : ''}
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/contracts">Voltar à lista</Link>
        </Button>
      </div>

      <section className="space-y-4 rounded-lg border bg-white p-6">
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 space-y-1.5 md:col-span-8">
            <Label>Cliente</Label>
            <PersonSearchSelect
              value={draft.personId}
              onChange={(personId) => patch({ personId })}
              type="cliente"
              placeholder="Buscar cliente ativo..."
              disabled={locked || frozen}
              enterSequence
            />
          </div>
          <div className="col-span-12 space-y-1.5 md:col-span-4">
            <Label htmlFor="contract-title">Título</Label>
            <Input
              id="contract-title"
              data-enter-sequence=""
              value={draft.title}
              disabled={locked}
              maxLength={120}
              onChange={(event) => patch({ title: event.target.value })}
            />
          </div>
          <div className="col-span-6 space-y-1.5 md:col-span-3">
            <Label htmlFor="contract-start">Início</Label>
            <Input
              id="contract-start"
              data-enter-sequence=""
              type="date"
              value={draft.startedOn}
              disabled={locked || frozen}
              onChange={(event) => patch({ startedOn: event.target.value })}
            />
          </div>
          <div className="col-span-6 space-y-1.5 md:col-span-3">
            <Label htmlFor="contract-end">Fim</Label>
            <Input
              id="contract-end"
              data-enter-sequence=""
              type="date"
              value={draft.endedOn}
              disabled={locked}
              onChange={(event) => patch({ endedOn: event.target.value })}
            />
          </div>
          <div className="col-span-12 space-y-1.5 md:col-span-3">
            <Label htmlFor="contract-kind">Cobrança</Label>
            <select
              id="contract-kind"
              data-enter-sequence=""
              className={selectClass}
              value={draft.billingKind}
              disabled={locked || frozen}
              onChange={(event) => {
                const billingKind = event.target.value as ContractBillingKind;
                patch({
                  billingKind,
                  billingCompetence:
                    billingKind === 'none' ? '' : draft.billingCompetence,
                  amount: billingKind === 'none' ? '' : draft.amount,
                  dueDay: billingKind === 'none' ? '' : draft.dueDay,
                  paymentMethodId: billingKind === 'none' ? '' : draft.paymentMethodId,
                });
              }}
            >
              {(Object.keys(billingKindLabels) as ContractBillingKind[]).map((value) => (
                <option key={value} value={value}>
                  {billingKindLabels[value]}
                </option>
              ))}
            </select>
          </div>
          {recurring ? (
            <>
              <div className="col-span-6 space-y-1.5 md:col-span-3">
                <Label htmlFor="contract-competence">Competência</Label>
                <select
                  id="contract-competence"
                  data-enter-sequence=""
                  className={selectClass}
                  value={draft.billingCompetence}
                  disabled={locked || frozen}
                  onChange={(event) =>
                    patch({
                      billingCompetence: event.target.value as
                        ContractBillingCompetence | '',
                    })
                  }
                >
                  <option value="">Selecione</option>
                  <option value="current">Atual</option>
                  <option value="previous">Anterior</option>
                </select>
              </div>
              <div className="col-span-6 space-y-1.5 md:col-span-3">
                <Label htmlFor="contract-amount">Valor do período</Label>
                <Input
                  id="contract-amount"
                  data-enter-sequence=""
                  value={draft.amount}
                  disabled={locked}
                  inputMode="numeric"
                  onChange={(event) =>
                    patch({ amount: maskCurrencyInput(event.target.value) })
                  }
                />
              </div>
              <div className="col-span-6 space-y-1.5 md:col-span-2">
                <Label htmlFor="contract-due-day">Dia</Label>
                <Input
                  id="contract-due-day"
                  data-enter-sequence=""
                  value={draft.dueDay}
                  disabled={locked}
                  inputMode="numeric"
                  onChange={(event) =>
                    patch({ dueDay: event.target.value.replace(/\D/g, '').slice(0, 2) })
                  }
                />
              </div>
              <div className="col-span-12 space-y-1.5 md:col-span-4">
                <Label htmlFor="contract-method">Forma</Label>
                <select
                  id="contract-method"
                  data-enter-sequence=""
                  className={selectClass}
                  value={draft.paymentMethodId}
                  disabled={locked || frozen}
                  onChange={(event) => patch({ paymentMethodId: event.target.value })}
                >
                  <option value="">Sem forma</option>
                  {(methods.data?.data ?? []).map((method) => (
                    <option key={method.id} value={method.id}>
                      {method.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : null}
          <div className="col-span-12 space-y-1.5">
            <Label htmlFor="contract-notes">Observação</Label>
            <textarea
              id="contract-notes"
              data-enter-sequence=""
              className="min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
              value={draft.notes}
              disabled={locked}
              onChange={(event) => patch({ notes: event.target.value })}
            />
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-medium text-zinc-900">Vencimentos</h3>
          {draft.billingKind === 'none' ? (
            <p className="text-sm text-zinc-500">Sem cobrança.</p>
          ) : schedule.length === 0 ? (
            <p className="text-sm text-zinc-500">
              Informe o fim, a competência e o dia para ver a série.
            </p>
          ) : (
            <ul className="grid gap-1 text-sm text-zinc-700 sm:grid-cols-2 lg:grid-cols-3">
              {schedule.map((row) => (
                <li key={row.competence}>{formatDate(row.dueOn)}</li>
              ))}
            </ul>
          )}
        </div>

        {draft.status === 'suspended' && draft.suspensionReason ? (
          <p className="text-sm text-zinc-700">
            Motivo da suspensão: {draft.suspensionReason}
          </p>
        ) : null}

        {suspending ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="w-full space-y-1.5 sm:max-w-md">
              <Label htmlFor="contract-reason">Motivo da suspensão</Label>
              <Input
                id="contract-reason"
                data-enter-sequence=""
                value={reason}
                maxLength={200}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
            <Button
              type="button"
              disabled={save.isPending}
              onClick={() =>
                save.mutate({ status: 'suspended', suspensionReason: reason.trim() })
              }
            >
              Confirmar suspensão
            </Button>
          </div>
        ) : null}

        {!locked ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              data-enter-sequence=""
              disabled={save.isPending}
              onClick={() =>
                save.mutate({
                  status: draft.status,
                  suspensionReason:
                    draft.status === 'suspended' ? draft.suspensionReason : null,
                  backToList: true,
                })
              }
            >
              Salvar
            </Button>
            {draft.status === 'draft' ? (
              <>
                <Button
                  type="button"
                  disabled={save.isPending}
                  onClick={() =>
                    save.mutate({ status: 'active', suspensionReason: null })
                  }
                >
                  Ativar
                </Button>
                {id ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={save.isPending}
                    onClick={() =>
                      save.mutate({ status: 'cancelled', suspensionReason: null })
                    }
                  >
                    Cancelar
                  </Button>
                ) : null}
              </>
            ) : null}
            {draft.status === 'active' ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={save.isPending}
                  onClick={() => setSuspending(true)}
                >
                  Suspender
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={save.isPending}
                  onClick={() =>
                    save.mutate({ status: 'closed', suspensionReason: null })
                  }
                >
                  Encerrar
                </Button>
              </>
            ) : null}
            {draft.status === 'suspended' ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={save.isPending}
                  onClick={() =>
                    save.mutate({ status: 'active', suspensionReason: null })
                  }
                >
                  Retomar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={save.isPending}
                  onClick={() =>
                    save.mutate({ status: 'closed', suspensionReason: null })
                  }
                >
                  Encerrar
                </Button>
              </>
            ) : null}
          </div>
        ) : null}
      </section>

      {id && contract.data ? (
        <>
          <section className="space-y-3 rounded-lg border bg-white p-6">
            <h3 className="text-sm font-medium text-zinc-900">Histórico</h3>
            {contract.data.events.length === 0 ? (
              <p className="text-sm text-zinc-500">Ainda não há histórico.</p>
            ) : (
              <ul className="space-y-3">
                {contract.data.events.map((event) => (
                  <li key={event.id} className="text-sm text-zinc-700">
                    <p className="font-medium text-zinc-900">{eventTitle(event)}</p>
                    <p className="text-zinc-500">
                      {formatWhen(event.createdAt)} · {event.actorName}
                    </p>
                    {event.reason ? <p>Motivo: {event.reason}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-3 rounded-lg border bg-white p-6">
            <h3 className="text-sm font-medium text-zinc-900">Ordens</h3>
            {contract.data.orders.length === 0 ? (
              <p className="text-sm text-zinc-500">Nenhuma ordem aponta este contrato.</p>
            ) : (
              <ul className="space-y-2">
                {contract.data.orders.map((order) => (
                  <li key={order.id}>
                    <Link
                      to={`/service-orders/${order.id}`}
                      className="text-sm text-zinc-900"
                    >
                      {order.numberLabel} ·{' '}
                      {orderStatusLabels[order.status] ?? order.status} ·{' '}
                      {formatCurrency(order.totalAmount)}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </form>
  );
}
