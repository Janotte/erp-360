import {
  formatCnpj,
  formatCpf,
  formatCurrency,
  formatPhone,
  formatPostalCode,
  maskCurrencyInput,
  onlyDigits,
  parseCurrencyToCents,
} from '@erp-360/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';

import { PersonSearchSelect } from '@/components/Persons/PersonSearchSelect';
import { Button } from '@/components/ui/button';
import { CatalogSearchSelect } from '@/components/ui/CatalogSearchSelect';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { type CatalogItem, itemsService } from '@/services/items';
import { paymentMethodsService } from '@/services/paymentMethods';
import { personsService } from '@/services/persons';
import {
  type ServiceOrderAttendance,
  type ServiceOrderDetail,
  type ServiceOrderLocation,
  type ServiceOrderSettings,
  serviceOrdersService,
  type ServiceOrderStatus,
  type ServiceOrderWrite,
} from '@/services/serviceOrders';

import sheetTemplate from '../../../../../doc/templates/os.html?raw';
import { serviceOrderDocument } from './serviceOrderDocument';

const sheetCss = sheetTemplate.match(/<style>([\s\S]*?)<\/style>/i)?.[1] ?? '';

const statusLabels: Record<ServiceOrderStatus, string> = {
  open: 'Aberta',
  analyzing: 'Em análise',
  waiting_approval: 'Aguardando aprovação',
  waiting_parts: 'Aguardando peça',
  in_progress: 'Em execução',
  ready: 'Pronta',
  delivered: 'Entregue',
  cancelled: 'Cancelada',
};

const attendanceLabels: Record<ServiceOrderAttendance, string> = {
  walk_in: 'Avulso',
  warranty: 'Garantia',
  rework: 'Retrabalho',
  contract: 'Contrato',
};

const locationLabels: Record<ServiceOrderLocation, string> = {
  remote: 'Remoto',
  internal: 'Interno',
  external: 'Externo',
};

const transitions: Record<ServiceOrderStatus, readonly ServiceOrderStatus[]> = {
  open: ['analyzing', 'waiting_approval', 'waiting_parts', 'in_progress', 'cancelled'],
  analyzing: ['waiting_approval', 'waiting_parts', 'in_progress', 'ready', 'cancelled'],
  waiting_approval: ['analyzing', 'in_progress', 'cancelled'],
  waiting_parts: ['in_progress', 'cancelled'],
  in_progress: ['waiting_parts', 'ready', 'cancelled'],
  ready: ['delivered', 'in_progress', 'cancelled'],
  delivered: [],
  cancelled: [],
};

const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm';

type DraftField = {
  slot: string;
  value: string;
  label: string;
  width: number;
  isActive: boolean;
  isRequired: boolean;
};

type DraftLine = {
  kind: 'product' | 'service';
  itemId: string;
  code: string;
  description: string;
  quantity: string;
  unitPrice: string;
  technicianPersonId: string | null;
};

type Draft = {
  personId: string;
  attendance: ServiceOrderAttendance;
  location: ServiceOrderLocation;
  originOrderId: string;
  promisedAt: string | null;
  status: ServiceOrderStatus;
  internalNotes: string;
  customerName: string;
  customerTaxId: string;
  customerPhone: string;
  customerMobilePhone: string;
  customerWhatsapp: string;
  customerEmail: string;
  customerPostalCode: string;
  customerStreetLine: string;
  customerNeighborhood: string;
  customerCityLine: string;
  freight: string;
  discount: string;
  surcharge: string;
  paymentMethodId: string;
  paymentInstallments: string;
  fields: DraftField[];
  notes: { slot: string; body: string }[];
  lines: DraftLine[];
};

function spanClass(width: number) {
  if (width === 4) return 'col-span-12 md:col-span-4';
  if (width === 6) return 'col-span-12 md:col-span-6';
  return 'col-span-12';
}

function longField(slot: string) {
  return /^field(08|09|10|11)$/.test(slot);
}

function toLocalInput(iso: string | null) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function scale4(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.includes(',')
    ? trimmed.replace(/\./g, '').replace(',', '.')
    : trimmed;
  const match = /^(\d+)(?:\.(\d{1,4}))?$/.exec(normalized);
  if (!match) return null;
  return BigInt(match[1]) * 10_000n + BigInt((match[2] ?? '').padEnd(4, '0'));
}

function maskUnitPrice(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 15);
  if (!digits) return '';
  const padded = digits.padStart(5, '0');
  const fraction = padded.slice(-4);
  const integers = padded.slice(0, -4).replace(/^0+(?=\d)/, '') || '0';
  const grouped = integers.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${grouped},${fraction}`;
}

function formatUnitPrice(value: string | null | undefined) {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return '';
  const normalized = trimmed.includes(',')
    ? trimmed.replace(/\./g, '').replace(',', '.')
    : trimmed;
  const [integers, fraction = ''] = normalized.split('.');
  const intDigits = integers.replace(/\D/g, '').replace(/^0+(?=\d)/, '') || '0';
  const fractionDigits = fraction.replace(/\D/g, '').padEnd(4, '0').slice(0, 4);
  return maskUnitPrice(`${intDigits}${fractionDigits}`);
}

function unitPriceForApi(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '0.0000';
  return trimmed.replace(/\./g, '').replace(',', '.');
}

function lineAmountCents(quantity: string, unitPrice: string) {
  const left = scale4(quantity);
  const right = scale4(unitPrice);
  if (left == null || right == null) return 0;
  return Number((left * right + 500_000n) / 1_000_000n);
}

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function formatCpfOrCnpj(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/[A-Za-z]/.test(trimmed)) return trimmed.slice(0, 19);
  const digits = onlyDigits(trimmed).slice(0, 14);
  if (digits.length <= 11) return formatCpf(digits);
  return formatCnpj(digits);
}

function splitStreetPostal(value: string) {
  const trimmed = value.trim();
  const onlyPostal = /^(\d{5}-?\d{3})$/.exec(trimmed);
  if (onlyPostal) return { street: '', postal: formatPostalCode(onlyPostal[1]) };
  const match = /^(.*?),\s*(\d{5}-?\d{3})$/.exec(trimmed);
  if (!match) return { street: trimmed, postal: '' };
  return {
    street: match[1].trim(),
    postal: formatPostalCode(match[2]),
  };
}

function joinStreetPostal(street: string, postal: string) {
  const line = street.trim();
  const digits = onlyDigits(postal);
  if (digits.length !== 8) return line.slice(0, 200);
  const cep = formatPostalCode(digits);
  if (!line) return cep;
  if (onlyDigits(line).endsWith(digits) && /\d{5}-?\d{3}$/.test(line)) return line.slice(0, 200);
  return `${line}, ${cep}`.slice(0, 200);
}

function focusNextOsField(form: HTMLFormElement, current: HTMLElement) {
  const fields = Array.from(form.querySelectorAll<HTMLElement>('[data-enter-sequence]')).filter(
    (field) => !field.hasAttribute('disabled'),
  );
  const index = fields.findIndex((field) => field === current || field.contains(current));
  if (index < 0) return;
  fields[index + 1]?.focus();
}

function onEnterSequence(event: KeyboardEvent<HTMLFormElement>) {
  if (event.key !== 'Enter' || event.nativeEvent.isComposing || event.defaultPrevented) return;
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
  if (!field || field.hasAttribute('disabled')) return;
  event.preventDefault();
  focusNextOsField(event.currentTarget, field);
}

function needsOrigin(attendance: ServiceOrderAttendance) {
  return attendance === 'warranty' || attendance === 'rework';
}

function emptyDraft(settings: ServiceOrderSettings): Draft {
  return {
    personId: '',
    attendance: 'walk_in',
    location: 'remote',
    originOrderId: '',
    promisedAt: null,
    status: 'open',
    internalNotes: '',
    customerName: '',
    customerTaxId: '',
    customerPhone: '',
    customerMobilePhone: '',
    customerWhatsapp: '',
    customerEmail: '',
    customerPostalCode: '',
    customerStreetLine: '',
    customerNeighborhood: '',
    customerCityLine: '',
    freight: '',
    discount: '',
    surcharge: '',
    paymentMethodId: '',
    paymentInstallments: '',
    fields: settings.fields.map((field) => ({
      slot: field.slot,
      value: '',
      label: field.label,
      width: field.width,
      isActive: field.isActive,
      isRequired: field.isRequired,
    })),
    notes: settings.noteLines.map((line) => ({
      slot: line.slot,
      body: line.isActive ? line.body : '',
    })),
    lines: [],
  };
}

function draftFromOrder(order: ServiceOrderDetail): Draft {
  const address = splitStreetPostal(order.customerStreetLine ?? '');
  return {
    personId: order.personId,
    attendance: order.attendance,
    location: order.location,
    originOrderId: order.originOrderId ?? '',
    promisedAt: order.promisedAt,
    status: order.status,
    internalNotes: order.internalNotes,
    customerName: order.customerName,
    customerTaxId: formatCpfOrCnpj(order.customerTaxId ?? ''),
    customerPhone: formatPhone(order.customerPhone ?? ''),
    customerMobilePhone: formatPhone(order.customerMobilePhone ?? ''),
    customerWhatsapp: formatPhone(order.customerWhatsapp ?? ''),
    customerEmail: order.customerEmail ?? '',
    customerPostalCode: address.postal,
    customerStreetLine: address.street,
    customerNeighborhood: order.customerNeighborhood ?? '',
    customerCityLine: order.customerCityLine ?? '',
    freight: formatInput(order.freightAmount),
    discount: formatInput(order.discountAmount),
    surcharge: formatInput(order.surchargeAmount),
    paymentMethodId: order.paymentMethodId ?? '',
    paymentInstallments: order.paymentInstallments
      ? String(order.paymentInstallments)
      : '',
    fields: order.fields.map((field) => ({
      slot: field.slot,
      value: field.value ?? '',
      label: field.label,
      width: field.width,
      isActive: field.isActive,
      isRequired: field.isRequired,
    })),
    notes: order.notes.map((note) => ({ slot: note.slot, body: note.body })),
    lines: order.lines.map((line) => ({
      kind: line.kind,
      itemId: line.itemId,
      code: line.code,
      description: line.description,
      quantity: line.quantity,
      unitPrice: formatUnitPrice(line.unitPrice),
      technicianPersonId: line.technicianPersonId,
    })),
  };
}

function formatInput(cents: number) {
  return cents ? maskCurrencyInput(String(cents)) : '';
}

function toWrite(draft: Draft, status: ServiceOrderStatus): ServiceOrderWrite {
  return {
    personId: draft.personId,
    attendance: draft.attendance,
    location: draft.location,
    originOrderId: needsOrigin(draft.attendance)
      ? emptyToNull(draft.originOrderId)
      : null,
    promisedAt: draft.promisedAt,
    status,
    internalNotes: draft.internalNotes,
    customerName: draft.customerName.trim(),
    customerTaxId: emptyToNull(draft.customerTaxId),
    customerPhone: emptyToNull(draft.customerPhone),
    customerMobilePhone: emptyToNull(draft.customerMobilePhone),
    customerWhatsapp: emptyToNull(draft.customerWhatsapp),
    customerEmail: emptyToNull(draft.customerEmail),
    customerStreetLine: emptyToNull(
      joinStreetPostal(draft.customerStreetLine, draft.customerPostalCode),
    ),
    customerNeighborhood: emptyToNull(draft.customerNeighborhood),
    customerCityLine: emptyToNull(draft.customerCityLine),
    freightAmount: parseCurrencyToCents(draft.freight),
    discountAmount: parseCurrencyToCents(draft.discount),
    surchargeAmount: parseCurrencyToCents(draft.surcharge),
    paymentMethodId: draft.paymentMethodId || null,
    paymentInstallments: draft.paymentInstallments
      ? Number(draft.paymentInstallments)
      : null,
    fields: draft.fields.map((field) => ({
      slot: field.slot,
      value: emptyToNull(field.value),
    })),
    notes: draft.notes.map((note) => ({ slot: note.slot, body: note.body })),
    lines: draft.lines.map((line) => ({
      kind: line.kind,
      itemId: line.itemId,
      description: line.description,
      quantity: line.quantity.trim(),
      unitPrice: unitPriceForApi(line.unitPrice),
      technicianPersonId: line.kind === 'service' ? line.technicianPersonId : null,
    })),
  };
}

function writeFromDetail(
  order: ServiceOrderDetail,
  internalNotes: string,
): ServiceOrderWrite {
  return {
    personId: order.personId,
    attendance: order.attendance,
    location: order.location,
    originOrderId: order.originOrderId,
    promisedAt: order.promisedAt,
    status: order.status,
    internalNotes,
    customerName: order.customerName,
    customerTaxId: order.customerTaxId,
    customerPhone: order.customerPhone,
    customerMobilePhone: order.customerMobilePhone,
    customerWhatsapp: order.customerWhatsapp,
    customerEmail: order.customerEmail,
    customerStreetLine: order.customerStreetLine,
    customerNeighborhood: order.customerNeighborhood,
    customerCityLine: order.customerCityLine,
    freightAmount: order.freightAmount,
    discountAmount: order.discountAmount,
    surchargeAmount: order.surchargeAmount,
    paymentMethodId: order.paymentMethodId,
    paymentInstallments: order.paymentInstallments,
    fields: order.fields.map((field) => ({ slot: field.slot, value: field.value })),
    notes: order.notes.map((note) => ({ slot: note.slot, body: note.body })),
    lines: order.lines.map((line) => ({
      kind: line.kind,
      itemId: line.itemId,
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      technicianPersonId: line.technicianPersonId,
    })),
  };
}

async function copyFromPerson(personId: string) {
  const [person, contacts, addresses] = await Promise.all([
    personsService.get(personId),
    personsService.listContacts(personId),
    personsService.listAddresses(personId),
  ]);
  if (!person.isActive || !person.isClient) {
    throw new Error('Informe um cliente ativo.');
  }
  const contact = contacts.find((item) => item.type === 'Principal');
  const address = addresses.find((item) => item.type === 'Principal');
  const postal = address?.postalCode ? formatPostalCode(address.postalCode) : '';
  const street = address
    ? [address.street, address.number, address.complement]
        .map((part) => part?.trim() ?? '')
        .filter(Boolean)
        .join(', ')
    : '';
  return {
    customerName: person.name,
    customerTaxId: formatCpfOrCnpj(person.taxId?.trim() ?? ''),
    customerPhone: formatPhone(contact?.phone?.trim() ?? ''),
    customerMobilePhone: formatPhone(contact?.mobilePhone?.trim() ?? ''),
    customerWhatsapp: formatPhone(contact?.whatsapp?.trim() ?? ''),
    customerEmail: contact?.email?.trim() ?? '',
    customerPostalCode: postal,
    customerStreetLine: street.slice(0, 200),
    customerNeighborhood: address?.neighborhood?.trim() ?? '',
    customerCityLine:
      address?.cityName && address.stateAbbreviation
        ? `${address.cityName} / ${address.stateAbbreviation}`.slice(0, 80)
        : '',
  };
}

export function FormServiceOrder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const createdId = useRef<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [productPicker, setProductPicker] = useState(0);
  const [servicePicker, setServicePicker] = useState(0);

  const settings = useQuery({
    queryKey: ['settings', 'service-order'],
    queryFn: serviceOrdersService.getSettings,
  });
  const order = useQuery({
    queryKey: ['service-order', id],
    queryFn: () => serviceOrdersService.get(id ?? ''),
    enabled: Boolean(id),
  });
  const catalog = useQuery({
    queryKey: ['catalog-items', 'service-order'],
    queryFn: () =>
      itemsService.list({ page: 1, limit: 100, sortField: 'name', sortOrder: 'asc' }),
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
  const origins = useQuery({
    queryKey: ['service-orders', 'origins'],
    queryFn: () => serviceOrdersService.list(),
    enabled: draft ? needsOrigin(draft.attendance) : false,
  });

  useEffect(() => {
    if (order.data) setDraft(draftFromOrder(order.data));
  }, [order.data]);

  useEffect(() => {
    if (id || draft || !settings.data) return;
    setDraft(emptyDraft(settings.data));
  }, [id, draft, settings.data]);

  const save = useMutation({
    mutationFn: async (status: ServiceOrderStatus) => {
      if (!draft) throw new Error('A ordem ainda não carregou.');
      const current = order.data;
      const closed = current?.status === 'delivered' || current?.status === 'cancelled';
      if (closed && current) {
        return serviceOrdersService.save(
          current.id,
          writeFromDetail(current, draft.internalNotes),
        );
      }
      let orderId = id ?? createdId.current;
      if (!orderId) {
        const created = await serviceOrdersService.create({
          personId: draft.personId,
          attendance: draft.attendance,
          location: draft.location,
          originOrderId: needsOrigin(draft.attendance)
            ? emptyToNull(draft.originOrderId)
            : null,
          promisedAt: draft.promisedAt,
          internalNotes: draft.internalNotes,
        });
        createdId.current = created.id;
        orderId = created.id;
      }
      return serviceOrdersService.save(orderId, toWrite(draft, status));
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(['service-order', saved.id], saved);
      void queryClient.invalidateQueries({ queryKey: ['service-orders'] });
      toast.success(saved.status === 'delivered' ? 'Ordem entregue.' : 'Ordem salva.');
      if (!id) navigate(`/service-orders/${saved.id}`, { replace: true });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Falha ao salvar a ordem.');
    },
  });

  if (order.isError || settings.isError) {
    return <p className="text-sm text-red-600">Não foi possível carregar a ordem.</p>;
  }
  if (!draft || (id && order.isLoading)) {
    return <p className="text-sm text-zinc-500">Carregando a ordem...</p>;
  }

  const closed = order.data?.status === 'delivered' || order.data?.status === 'cancelled';
  const locked = closed;
  const currentStatus = order.data?.status ?? 'open';
  const destinations = [currentStatus, ...transitions[currentStatus]];
  const canDeliver = transitions[currentStatus].includes('delivered');
  const activeNoteSlots = new Set(
    (settings.data?.noteLines ?? []).filter((line) => line.isActive).map((line) => line.slot),
  );
  const visibleNotes = draft.notes.filter(
    (note) => activeNoteSlots.has(note.slot) && note.body.trim(),
  );
  const sectionTitle = settings.data?.sectionTitle ?? 'Informações do objeto';
  const productsTitle = settings.data?.productsTitle ?? 'Produtos';
  const servicesTitle = settings.data?.servicesTitle ?? 'Serviços';
  const paymentMethods = (methods.data?.data ?? []).filter(
    (method) => method.receiptKind !== 'store_credit',
  );
  const selectedMethod = paymentMethods.find(
    (method) => method.id === draft.paymentMethodId,
  );
  const terms = [...(selectedMethod?.terms ?? [])].sort(
    (left, right) => left.installmentCount - right.installmentCount,
  );
  const products = (catalog.data?.data ?? []).filter(
    (item) => item.type === 'product' && item.isActive,
  );
  const services = (catalog.data?.data ?? []).filter(
    (item) => item.type === 'service' && item.isActive,
  );
  const productAmount = draft.lines
    .filter((line) => line.kind === 'product')
    .reduce((sum, line) => sum + lineAmountCents(line.quantity, line.unitPrice), 0);
  const serviceAmount = draft.lines
    .filter((line) => line.kind === 'service')
    .reduce((sum, line) => sum + lineAmountCents(line.quantity, line.unitPrice), 0);
  const freightAmount = parseCurrencyToCents(draft.freight);
  const discountAmount = parseCurrencyToCents(draft.discount);
  const surchargeAmount = parseCurrencyToCents(draft.surcharge);
  const totalAmount =
    productAmount + serviceAmount + freightAmount - discountAmount + surchargeAmount;

  function patch(partial: Partial<Draft>) {
    setDraft((current) => (current ? { ...current, ...partial } : current));
  }

  function patchField(slot: string, value: string) {
    setDraft((current) =>
      current
        ? {
            ...current,
            fields: current.fields.map((field) =>
              field.slot === slot ? { ...field, value } : field,
            ),
          }
        : current,
    );
  }

  function patchLine(index: number, partial: Partial<DraftLine>) {
    setDraft((current) =>
      current
        ? {
            ...current,
            lines: current.lines.map((line, lineIndex) =>
              lineIndex === index ? { ...line, ...partial } : line,
            ),
          }
        : current,
    );
  }

  function addLine(kind: 'product' | 'service', item: CatalogItem) {
    setDraft((current) =>
      current
        ? {
            ...current,
            lines: [
              ...current.lines,
              {
                kind,
                itemId: item.id,
                code: item.code,
                description: item.name,
                quantity: '1.0000',
                unitPrice: formatUnitPrice(item.listPrice ?? '0'),
                technicianPersonId: null,
              },
            ],
          }
        : current,
    );
  }

  function removeLine(index: number) {
    setDraft((current) =>
      current
        ? {
            ...current,
            lines: current.lines.filter((_, lineIndex) => lineIndex !== index),
          }
        : current,
    );
  }

  async function choosePerson(personId: string) {
    patch({ personId });
    if (!personId) return;
    try {
      const copy = await copyFromPerson(personId);
      setDraft((current) =>
        current && current.personId === personId ? { ...current, ...copy } : current,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Informe um cliente ativo.');
      patch({ personId: '' });
    }
  }

  async function chooseTechnician(index: number, personId: string) {
    if (!personId) {
      patchLine(index, { technicianPersonId: null });
      return;
    }
    try {
      const person = await personsService.get(personId);
      if (!person.isActive || !person.isEmployee) {
        throw new Error('O técnico precisa ser um funcionário ativo.');
      }
      patchLine(index, { technicianPersonId: person.id });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'O técnico precisa ser um funcionário ativo.',
      );
    }
  }

  function canSubmit(status: ServiceOrderStatus) {
    if (!draft) return false;
    if (!draft.personId) {
      toast.error('Informe um cliente ativo.');
      return false;
    }
    if (!draft.customerName.trim()) {
      toast.error('Informe o nome do cliente.');
      return false;
    }
    if (status !== 'cancelled') {
      const missing = draft.fields.some(
        (field) => field.isActive && field.isRequired && !field.value.trim(),
      );
      if (missing) {
        toast.error('Preencha os campos obrigatórios.');
        return false;
      }
    }
    const hasMethod = Boolean(draft.paymentMethodId);
    const hasInstallments = Boolean(draft.paymentInstallments);
    if (hasMethod !== hasInstallments) {
      toast.error('Informe a forma e a quantidade de parcelas.');
      return false;
    }
    if (status === 'delivered' && !hasMethod) {
      toast.error('Informe a forma de pagamento para entregar.');
      return false;
    }
    if (
      discountAmount >
      productAmount + serviceAmount + freightAmount + surchargeAmount
    ) {
      toast.error(
        'O desconto não pode passar da soma dos itens, do frete e do acréscimo.',
      );
      return false;
    }
    return true;
  }

  function submit(status: ServiceOrderStatus) {
    if (!canSubmit(status)) return;
    save.mutate(status);
  }

  async function printSheet() {
    if (!draft) return;
    const knownId = id ?? createdId.current;
    if (!knownId && !canSubmit(draft.status)) return;
    const popup = window.open('', '_blank');
    if (!popup) {
      toast.error('O navegador bloqueou a janela da folha.');
      return;
    }
    popup.document.write(
      '<!doctype html><title>Ordem de Serviço</title><p>Montando a folha...</p>',
    );
    popup.document.close();
    let persisted = Boolean(knownId);
    try {
      let orderId = knownId;
      if (!orderId) {
        const saved = await save.mutateAsync(draft.status);
        orderId = saved.id;
        persisted = true;
      }
      const model = await serviceOrdersService.print(orderId);
      popup.document.open();
      popup.document.write(serviceOrderDocument(model, sheetCss));
      popup.document.close();
      popup.focus();
    } catch (error) {
      popup.close();
      if (persisted) {
        toast.error(
          error instanceof Error ? error.message : 'Falha ao montar a folha da ordem.',
        );
      }
    }
  }

  return (
    <form
      className="space-y-6"
      onKeyDown={onEnterSequence}
      onSubmit={(event) => {
        event.preventDefault();
        submit(draft.status);
      }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900">
            {order.data ? `Ordem ${order.data.numberLabel}` : 'Nova ordem'}
          </h2>
          <p className="text-sm text-zinc-500">
            {closed
              ? 'Ordem encerrada. Só a nota interna ainda pode mudar.'
              : 'Cliente, campos do objeto, itens e previsão de pagamento.'}
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/service-orders">Voltar à lista</Link>
        </Button>
      </div>

      <section className="space-y-4 rounded-lg border bg-white p-6">
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 space-y-1.5 md:col-span-8">
            <Label>Cliente</Label>
            <PersonSearchSelect
              value={draft.personId}
              onChange={(personId) => void choosePerson(personId)}
              type="cliente"
              placeholder="Buscar cliente ativo..."
              disabled={locked}
              enterSequence
            />
          </div>
          <div className="col-span-6 space-y-1.5 md:col-span-2">
            <Label htmlFor="service-order-attendance">Tipo de atendimento</Label>
            <select
              id="service-order-attendance"
              className={selectClass}
              data-enter-sequence=""
              value={draft.attendance}
              disabled={locked}
              onChange={(event) => {
                const attendance = event.target.value as ServiceOrderAttendance;
                patch({
                  attendance,
                  originOrderId: needsOrigin(attendance) ? draft.originOrderId : '',
                });
              }}
            >
              {(Object.keys(attendanceLabels) as ServiceOrderAttendance[]).map(
                (value) => (
                  <option key={value} value={value}>
                    {attendanceLabels[value]}
                  </option>
                ),
              )}
            </select>
          </div>
          <div className="col-span-6 space-y-1.5 md:col-span-2">
            <Label htmlFor="service-order-location">Local de atendimento</Label>
            <select
              id="service-order-location"
              className={selectClass}
              value={draft.location}
              disabled={locked}
              onChange={(event) =>
                patch({ location: event.target.value as ServiceOrderLocation })
              }
            >
              {(Object.keys(locationLabels) as ServiceOrderLocation[]).map((value) => (
                <option key={value} value={value}>
                  {locationLabels[value]}
                </option>
              ))}
            </select>
          </div>
          {needsOrigin(draft.attendance) ? (
            <div className="col-span-12 space-y-1.5 md:col-span-4">
              <Label htmlFor="service-order-origin">Ordem de origem</Label>
              <select
                id="service-order-origin"
                className={selectClass}
                data-enter-sequence=""
                value={draft.originOrderId}
                disabled={locked}
                onChange={(event) => patch({ originOrderId: event.target.value })}
              >
                <option value="">Sem origem</option>
                {(origins.data?.data ?? [])
                  .filter((item) => item.id !== (id ?? createdId.current))
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.numberLabel} — {item.customerName}
                    </option>
                  ))}
              </select>
            </div>
          ) : null}
          <div className="col-span-12 space-y-1.5 md:col-span-6">
            <Label htmlFor="service-order-promised">Previsão</Label>
            <Input
              id="service-order-promised"
              type="datetime-local"
              data-enter-sequence=""
              value={toLocalInput(draft.promisedAt)}
              disabled={locked}
              onChange={(event) =>
                patch({
                  promisedAt: event.target.value
                    ? new Date(event.target.value).toISOString()
                    : null,
                })
              }
            />
          </div>
          <div className="col-span-12 space-y-1.5 md:col-span-6">
            <Label htmlFor="service-order-status">Situação</Label>
            <select
              id="service-order-status"
              className={selectClass}
              data-enter-sequence=""
              value={draft.status}
              disabled={locked}
              onChange={(event) =>
                patch({ status: event.target.value as ServiceOrderStatus })
              }
            >
              {destinations.map((value) => (
                <option key={value} value={value}>
                  {statusLabels[value]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {draft.personId ? (
          <div className="grid gap-4 md:grid-cols-2">
            <CopyField
              id="service-order-customer-name"
              label="Nome"
              value={draft.customerName}
              disabled={locked}
              onChange={(customerName) => patch({ customerName })}
            />
            <CopyField
              id="service-order-customer-tax-id"
              label="CPF/CNPJ"
              value={draft.customerTaxId}
              disabled={locked}
              maxLength={18}
              onChange={(customerTaxId) =>
                patch({ customerTaxId: formatCpfOrCnpj(customerTaxId) })
              }
            />
            <CopyField
              id="service-order-customer-phone"
              label="Telefone"
              value={draft.customerPhone}
              disabled={locked}
              inputMode="numeric"
              maxLength={15}
              onChange={(customerPhone) => patch({ customerPhone: formatPhone(customerPhone) })}
            />
            <CopyField
              id="service-order-customer-mobile"
              label="Celular"
              value={draft.customerMobilePhone}
              disabled={locked}
              inputMode="numeric"
              maxLength={15}
              onChange={(customerMobilePhone) =>
                patch({ customerMobilePhone: formatPhone(customerMobilePhone) })
              }
            />
            <CopyField
              id="service-order-customer-whatsapp"
              label="WhatsApp"
              value={draft.customerWhatsapp}
              disabled={locked}
              inputMode="numeric"
              maxLength={15}
              onChange={(customerWhatsapp) =>
                patch({ customerWhatsapp: formatPhone(customerWhatsapp) })
              }
            />
            <CopyField
              id="service-order-customer-email"
              label="E-mail"
              value={draft.customerEmail}
              disabled={locked}
              onChange={(customerEmail) => patch({ customerEmail })}
            />
            <div className="grid grid-cols-12 gap-4 md:col-span-2">
              <CopyField
                id="service-order-customer-postal-code"
                className="col-span-12 sm:col-span-3"
                label="CEP"
                value={draft.customerPostalCode}
                disabled={locked}
                inputMode="numeric"
                maxLength={9}
                onChange={(customerPostalCode) =>
                  patch({ customerPostalCode: formatPostalCode(customerPostalCode) })
                }
              />
              <CopyField
                id="service-order-customer-street"
                className="col-span-12 sm:col-span-9"
                label="Endereço"
                value={draft.customerStreetLine}
                disabled={locked}
                onChange={(customerStreetLine) => patch({ customerStreetLine })}
              />
              <CopyField
                id="service-order-customer-neighborhood"
                className="col-span-12 sm:col-span-6"
                label="Bairro"
                value={draft.customerNeighborhood}
                disabled={locked}
                onChange={(customerNeighborhood) => patch({ customerNeighborhood })}
              />
              <CopyField
                id="service-order-customer-city"
                className="col-span-12 sm:col-span-6"
                label="Cidade"
                value={draft.customerCityLine}
                disabled={locked}
                onChange={(customerCityLine) => patch({ customerCityLine })}
              />
            </div>
          </div>
        ) : null}
      </section>

      <section className="space-y-4 rounded-lg border bg-white p-6">
        <h3 className="text-lg font-semibold text-zinc-900">{sectionTitle}</h3>
        <div className="grid grid-cols-12 gap-4">
          {draft.fields
            .filter((field) => field.isActive)
            .map((field) => (
              <div key={field.slot} className={`space-y-1.5 ${spanClass(field.width)}`}>
                <Label htmlFor={field.slot}>
                  {field.label}
                  {field.isRequired ? ' *' : ''}
                </Label>
                {longField(field.slot) ? (
                  <textarea
                    id={field.slot}
                    data-enter-sequence=""
                    className="min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm disabled:bg-zinc-50"
                    maxLength={2000}
                    value={field.value}
                    disabled={locked}
                    onChange={(event) => patchField(field.slot, event.target.value)}
                  />
                ) : (
                  <Input
                    id={field.slot}
                    data-enter-sequence=""
                    value={field.value}
                    maxLength={120}
                    disabled={locked}
                    onChange={(event) => patchField(field.slot, event.target.value)}
                  />
                )}
              </div>
            ))}
        </div>
      </section>

      <LineTable
        title={productsTitle}
        kind="product"
        lines={draft.lines}
        items={products}
        pickerKey={productPicker}
        locked={locked}
        onAdd={(item) => {
          addLine('product', item);
          setProductPicker((value) => value + 1);
        }}
        onPatch={patchLine}
        onRemove={removeLine}
        onTechnician={() => undefined}
      />
      <LineTable
        title={servicesTitle}
        kind="service"
        lines={draft.lines}
        items={services}
        pickerKey={servicePicker}
        locked={locked}
        onAdd={(item) => {
          addLine('service', item);
          setServicePicker((value) => value + 1);
        }}
        onPatch={patchLine}
        onRemove={removeLine}
        onTechnician={(index, personId) => void chooseTechnician(index, personId)}
      />

      <section className="space-y-4 rounded-lg border bg-white p-6">
        <h3 className="text-lg font-semibold text-zinc-900">Totais e pagamento</h3>
        <div className="grid gap-4 md:grid-cols-3">
          <MoneyField
            label="Frete (R$)"
            value={draft.freight}
            disabled={locked}
            onChange={(freight) => patch({ freight })}
          />
          <MoneyField
            label="Desconto (R$)"
            value={draft.discount}
            disabled={locked}
            onChange={(discount) => patch({ discount })}
          />
          <MoneyField
            label="Acréscimo (R$)"
            value={draft.surcharge}
            disabled={locked}
            onChange={(surcharge) => patch({ surcharge })}
          />
        </div>
        <p className="text-sm text-zinc-700">
          Produtos {formatCurrency(productAmount)} · Serviços{' '}
          {formatCurrency(serviceAmount)} · Total{' '}
          <strong>{formatCurrency(totalAmount)}</strong>
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="service-order-method">Forma de pagamento</Label>
            <select
              id="service-order-method"
              className={selectClass}
              data-enter-sequence=""
              value={draft.paymentMethodId}
              disabled={locked}
              onChange={(event) => {
                const paymentMethodId = event.target.value;
                const method = paymentMethods.find((item) => item.id === paymentMethodId);
                const stillValid = method?.terms.some(
                  (term) => String(term.installmentCount) === draft.paymentInstallments,
                );
                patch({
                  paymentMethodId,
                  paymentInstallments: stillValid ? draft.paymentInstallments : '',
                });
              }}
            >
              <option value="">Sem forma</option>
              {paymentMethods.map((method) => (
                <option key={method.id} value={method.id}>
                  {method.name}
                </option>
              ))}
              {draft.paymentMethodId && !selectedMethod ? (
                <option value={draft.paymentMethodId}>Forma gravada</option>
              ) : null}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="service-order-installments">Condição</Label>
            <select
              id="service-order-installments"
              className={selectClass}
              data-enter-sequence=""
              value={draft.paymentInstallments}
              disabled={locked || !draft.paymentMethodId}
              onChange={(event) => patch({ paymentInstallments: event.target.value })}
            >
              <option value="">Sem condição</option>
              {terms.map((term) => (
                <option key={term.installmentCount} value={term.installmentCount}>
                  {term.installmentCount === 1 && term.firstDueDays === 0
                    ? 'À vista'
                    : `${term.installmentCount}x`}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-lg border bg-white p-6">
        <h3 className="text-lg font-semibold text-zinc-900">Observações</h3>
        {visibleNotes.length ? (
          <div className="space-y-3">
            {visibleNotes.map((note) => (
              <p key={note.slot} className="whitespace-pre-wrap text-sm text-zinc-800">
                {note.body}
              </p>
            ))}
          </div>
        ) : null}
        <div className="space-y-1.5">
          <Label htmlFor="service-order-internal">Nota interna</Label>
          <textarea
            id="service-order-internal"
            data-enter-sequence=""
            className="min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
            value={draft.internalNotes}
            onChange={(event) => patch({ internalNotes: event.target.value })}
          />
          <p className="text-xs text-zinc-500">Não entra no comprovante.</p>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" data-enter-sequence="" disabled={save.isPending}>
          {save.isPending ? 'Salvando...' : 'Salvar'}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={save.isPending}
          onClick={() => void printSheet()}
        >
          Imprimir
        </Button>
        {canDeliver && !locked ? (
          <Button
            type="button"
            disabled={save.isPending}
            onClick={() => submit('delivered')}
          >
            Entregar
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function CopyField({
  id,
  label,
  value,
  disabled,
  onChange,
  className,
  inputMode,
  maxLength,
}: {
  id: string;
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  className?: string;
  inputMode?: 'numeric' | 'text';
  maxLength?: number;
}) {
  return (
    <div className={className ? `space-y-1.5 ${className}` : 'space-y-1.5'}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        data-enter-sequence=""
        value={value}
        disabled={disabled}
        inputMode={inputMode}
        maxLength={maxLength}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function MoneyField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        data-enter-sequence=""
        inputMode="numeric"
        autoComplete="off"
        placeholder="0,00"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(maskCurrencyInput(event.target.value))}
      />
    </div>
  );
}

function LineTable({
  title,
  kind,
  lines,
  items,
  pickerKey,
  locked,
  onAdd,
  onPatch,
  onRemove,
  onTechnician,
}: {
  title: string;
  kind: 'product' | 'service';
  lines: DraftLine[];
  items: CatalogItem[];
  pickerKey: number;
  locked: boolean;
  onAdd: (item: CatalogItem) => void;
  onPatch: (index: number, partial: Partial<DraftLine>) => void;
  onRemove: (index: number) => void;
  onTechnician: (index: number, personId: string) => void;
}) {
  const visible = lines
    .map((line, index) => ({ line, index }))
    .filter((entry) => entry.line.kind === kind);

  return (
    <section className="space-y-3 rounded-lg border bg-white p-6">
      <h3 className="text-lg font-semibold text-zinc-900">{title}</h3>
      {locked ? null : (
        <CatalogSearchSelect
          key={pickerKey}
          value=""
          onChange={(itemId) => {
            const item = items.find((entry) => entry.id === itemId);
            if (item) onAdd(item);
          }}
          options={items.map((item) => ({
            id: item.id,
            label: `${item.code} — ${item.name}`,
          }))}
          placeholder={
            kind === 'product' ? 'Buscar produto ativo...' : 'Buscar serviço ativo...'
          }
          emptyMessage={
            kind === 'product' ? 'Nenhum produto ativo.' : 'Nenhum serviço ativo.'
          }
        />
      )}
      <div className="overflow-x-auto">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col className="w-24" />
            <col />
            {kind === 'service' ? <col className="w-56" /> : null}
            <col className="w-24" />
            <col className="w-28" />
            <col className="w-24" />
            <col className="w-10" />
          </colgroup>
          <thead className="text-left text-xs text-zinc-500">
            <tr>
              <th className="px-2 py-2 font-medium">Código</th>
              <th className="px-2 py-2 font-medium">Descrição</th>
              {kind === 'service' ? (
                <th className="px-2 py-2 font-medium">Técnico</th>
              ) : null}
              <th className="px-2 py-2 font-medium">Quantidade</th>
              <th className="px-2 py-2 font-medium">Unitário</th>
              <th className="px-2 py-2 font-medium">Total</th>
              <th className="px-1 py-2" />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td
                  colSpan={kind === 'service' ? 7 : 6}
                  className="px-2 py-3 text-zinc-500"
                >
                  Nenhum item nesta tabela.
                </td>
              </tr>
            ) : (
              visible.map(({ line, index }) => (
                <tr key={`${line.itemId}-${index}`} className="border-t border-zinc-100">
                  <td className="px-2 py-2 font-medium whitespace-nowrap text-zinc-800">
                    {line.code}
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      aria-label="Descrição"
                      className="w-full"
                      data-enter-sequence=""
                      value={line.description}
                      maxLength={120}
                      disabled={locked}
                      onChange={(event) =>
                        onPatch(index, { description: event.target.value })
                      }
                    />
                  </td>
                  {kind === 'service' ? (
                    <td className="px-2 py-2">
                      <PersonSearchSelect
                        value={line.technicianPersonId ?? ''}
                        onChange={(personId) => onTechnician(index, personId)}
                        type="colaborador"
                        placeholder="Técnico"
                        allowClear
                        disabled={locked}
                      />
                    </td>
                  ) : null}
                  <td className="px-2 py-2">
                    <Input
                      aria-label="Quantidade"
                      className="w-full px-2"
                      data-enter-sequence=""
                      value={line.quantity}
                      disabled={locked}
                      onChange={(event) =>
                        onPatch(index, { quantity: event.target.value })
                      }
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      aria-label="Unitário"
                      className="w-full px-2"
                      data-enter-sequence=""
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="0,0000"
                      value={line.unitPrice}
                      disabled={locked}
                      onChange={(event) =>
                        onPatch(index, { unitPrice: maskUnitPrice(event.target.value) })
                      }
                    />
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    {formatCurrency(lineAmountCents(line.quantity, line.unitPrice))}
                  </td>
                  <td className="px-1 py-2">
                    {locked ? null : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Remover"
                        onClick={() => onRemove(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
