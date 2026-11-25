import {
  civilDate,
  formatCnpj,
  formatCpf,
  formatCurrency,
  formatPhone,
  formatPostalCode,
  installmentDueDates,
  maskCurrencyInput,
  onlyDigits,
  splitInstallmentAmounts,
} from '@erp-360/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';

import { PersonSearchSelect } from '@/components/Persons/PersonSearchSelect';
import { BillingDocumentNote } from '@/components/ServiceOrders/BillingDocumentNote';
import {
  decimalInputHandlers,
  decimalToApi,
  decimalToCents,
  formatApiDecimal,
  scale4,
} from '@/components/ServiceOrders/serviceOrderDecimal';
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
import { CatalogSearchSelect } from '@/components/ui/CatalogSearchSelect';
import {
  FloatingInput,
  FloatingSelect,
  FloatingTextarea,
} from '@/components/ui/FloatingField';
import { Input } from '@/components/ui/input';
import { contractsService } from '@/services/contracts';
import { type CatalogItem, itemsService } from '@/services/items';
import { nfseSettingsService } from '@/services/nfseSettings';
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

const billingStatusLabel = {
  pendente: 'Pendente',
  recebido: 'Recebido',
  cancelado: 'Cancelado',
} as const;

function formatIsoDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

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

type DraftPayment = {
  key: string;
  paymentMethodId: string;
  methodName: string;
  installmentCount: number;
  dueOn: string;
  amount: string;
};

type Draft = {
  personId: string;
  attendance: ServiceOrderAttendance;
  location: ServiceOrderLocation;
  originOrderId: string;
  contractId: string;
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
  customerStreetNumber: string;
  customerStreetComplement: string;
  customerNeighborhood: string;
  customerCityLine: string;
  freight: string;
  discount: string;
  surcharge: string;
  paymentMethodId: string;
  paymentInstallments: string;
  payments: DraftPayment[];
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

function splitAddress(line: string) {
  const parts = line
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length <= 1) {
    return { street: parts[0] ?? '', number: '', complement: '' };
  }
  if (parts.length === 2) {
    return { street: parts[0] ?? '', number: parts[1] ?? '', complement: '' };
  }
  return {
    street: parts.slice(0, -2).join(', '),
    number: parts[parts.length - 2] ?? '',
    complement: parts[parts.length - 1] ?? '',
  };
}

function joinAddress(street: string, number: string, complement: string) {
  return [street, number, complement]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(', ');
}

function joinStreetPostal(street: string, postal: string) {
  const line = street.trim();
  const digits = onlyDigits(postal);
  if (digits.length !== 8) return line.slice(0, 200);
  const cep = formatPostalCode(digits);
  if (!line) return cep;
  if (onlyDigits(line).endsWith(digits) && /\d{5}-?\d{3}$/.test(line))
    return line.slice(0, 200);
  return `${line}, ${cep}`.slice(0, 200);
}

function focusNextOsField(form: HTMLFormElement, current: HTMLElement) {
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
    contractId: '',
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
    customerStreetNumber: '',
    customerStreetComplement: '',
    customerNeighborhood: '',
    customerCityLine: '',
    freight: '',
    discount: '',
    surcharge: '',
    paymentMethodId: '',
    paymentInstallments: '',
    payments: [],
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
  const street = splitAddress(address.street);
  return {
    personId: order.personId,
    attendance: order.attendance,
    location: order.location,
    originOrderId: order.originOrderId ?? '',
    contractId: order.contractId ?? '',
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
    customerStreetLine: street.street,
    customerStreetNumber: street.number,
    customerStreetComplement: street.complement,
    customerNeighborhood: order.customerNeighborhood ?? '',
    customerCityLine: order.customerCityLine ?? '',
    freight: formatInput(order.freightAmount),
    discount: formatInput(order.discountAmount),
    surcharge: formatInput(order.surchargeAmount),
    paymentMethodId: order.paymentMethodId ?? '',
    paymentInstallments: order.paymentInstallments
      ? String(order.paymentInstallments)
      : '',
    payments: (order.payments ?? []).map((line) => ({
      key: crypto.randomUUID(),
      paymentMethodId: line.paymentMethodId,
      methodName: line.methodName,
      installmentCount: line.installmentCount,
      dueOn: line.dueOn,
      amount: maskCurrencyInput(String(line.amount)),
    })),
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
      quantity: formatApiDecimal(line.quantity, 4),
      unitPrice: formatApiDecimal(line.unitPrice, 4),
      technicianPersonId: line.technicianPersonId,
    })),
  };
}

function allocatedPayments(draft: Draft) {
  return draft.payments.reduce((sum, row) => sum + decimalToCents(row.amount), 0);
}

function formatInput(cents: number) {
  return cents ? maskCurrencyInput(String(cents)) : '';
}

function orderTotal(draft: Draft) {
  const productAmount = draft.lines
    .filter((line) => line.kind === 'product')
    .reduce((sum, line) => sum + lineAmountCents(line.quantity, line.unitPrice), 0);
  const serviceAmount = draft.lines
    .filter((line) => line.kind === 'service')
    .reduce((sum, line) => sum + lineAmountCents(line.quantity, line.unitPrice), 0);
  const freightAmount = decimalToCents(draft.freight);
  const discountAmount = decimalToCents(draft.discount);
  const surchargeAmount = decimalToCents(draft.surcharge);
  return {
    productAmount,
    serviceAmount,
    freightAmount,
    discountAmount,
    surchargeAmount,
    totalAmount:
      productAmount + serviceAmount + freightAmount - discountAmount + surchargeAmount,
  };
}

function toWrite(draft: Draft, status: ServiceOrderStatus): ServiceOrderWrite {
  const usesPlan = draft.payments.length > 0;
  return {
    personId: draft.personId,
    attendance: draft.attendance,
    location: draft.location,
    originOrderId: needsOrigin(draft.attendance)
      ? emptyToNull(draft.originOrderId)
      : null,
    contractId: draft.attendance === 'contract' ? emptyToNull(draft.contractId) : null,
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
      joinStreetPostal(
        joinAddress(
          draft.customerStreetLine,
          draft.customerStreetNumber,
          draft.customerStreetComplement,
        ),
        draft.customerPostalCode,
      ),
    ),
    customerNeighborhood: emptyToNull(draft.customerNeighborhood),
    customerCityLine: emptyToNull(draft.customerCityLine),
    freightAmount: decimalToCents(draft.freight),
    discountAmount: decimalToCents(draft.discount),
    surchargeAmount: decimalToCents(draft.surcharge),
    paymentMethodId: usesPlan ? null : draft.paymentMethodId || null,
    paymentInstallments: usesPlan
      ? null
      : draft.paymentInstallments
        ? Number(draft.paymentInstallments)
        : null,
    payments: draft.payments.map((line) => ({
      paymentMethodId: line.paymentMethodId,
      installmentCount: line.installmentCount,
      dueOn: line.dueOn,
      amount: decimalToCents(line.amount),
    })),
    fields: draft.fields.map((field) => ({
      slot: field.slot,
      value: emptyToNull(field.value),
    })),
    notes: draft.notes.map((note) => ({ slot: note.slot, body: note.body })),
    lines: draft.lines.map((line) => ({
      kind: line.kind,
      itemId: line.itemId,
      description: line.description,
      quantity: decimalToApi(line.quantity, 4),
      unitPrice: decimalToApi(line.unitPrice, 4),
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
    contractId: order.contractId ?? null,
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
    payments: (order.payments ?? []).map((line) => ({
      paymentMethodId: line.paymentMethodId,
      installmentCount: line.installmentCount,
      dueOn: line.dueOn,
      amount: line.amount,
    })),
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
  return {
    customerName: person.name,
    customerTaxId: formatCpfOrCnpj(person.taxId?.trim() ?? ''),
    customerPhone: formatPhone(contact?.phone?.trim() ?? ''),
    customerMobilePhone: formatPhone(contact?.mobilePhone?.trim() ?? ''),
    customerWhatsapp: formatPhone(contact?.whatsapp?.trim() ?? ''),
    customerEmail: contact?.email?.trim() ?? '',
    customerPostalCode: postal,
    customerStreetLine: address?.street?.trim() ?? '',
    customerStreetNumber: address?.number?.trim() ?? '',
    customerStreetComplement: address?.complement?.trim() ?? '',
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
  const [allocationMethodId, setAllocationMethodId] = useState('');
  const [allocationInstallments, setAllocationInstallments] = useState('');
  const [allocationAmount, setAllocationAmount] = useState('');
  const [reverseOpen, setReverseOpen] = useState(false);
  const [requestingNfse, setRequestingNfse] = useState(false);
  const [sendingNfse, setSendingNfse] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const amountTouched = useRef(false);

  const settings = useQuery({
    queryKey: ['settings', 'service-order'],
    queryFn: serviceOrdersService.getSettings,
  });
  const order = useQuery({
    queryKey: ['service-order', id],
    queryFn: () => serviceOrdersService.get(id ?? ''),
    enabled: Boolean(id),
  });
  const nfseSettings = useQuery({
    queryKey: ['settings', 'nfse'],
    queryFn: nfseSettingsService.get,
    enabled: Boolean(order.data?.nfseRequest),
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
  const customerContracts = useQuery({
    queryKey: ['contracts', 'order-link', draft?.personId ?? ''],
    queryFn: () =>
      contractsService.list({
        personId: draft?.personId,
        status: 'active',
      }),
    enabled: Boolean(draft?.personId) && draft?.attendance === 'contract',
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
          contractId:
            draft.attendance === 'contract' ? emptyToNull(draft.contractId) : null,
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
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Falha ao salvar a ordem.');
    },
  });

  const reverseDelivery = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error('A ordem ainda não foi gravada.');
      return serviceOrdersService.reverse(id);
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(['service-order', saved.id], saved);
      void queryClient.invalidateQueries({ queryKey: ['service-orders'] });
      setReverseOpen(false);
      toast.success('Entrega estornada.');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Não foi possível estornar a entrega.');
    },
  });

  useEffect(() => {
    amountTouched.current = false;
    setAllocationMethodId('');
    setAllocationInstallments('');
  }, [id]);

  useEffect(() => {
    if (!draft || amountTouched.current) return;
    const remaining = orderTotal(draft).totalAmount - allocatedPayments(draft);
    setAllocationAmount(remaining > 0 ? maskCurrencyInput(String(remaining)) : '');
  }, [draft]);

  if (order.isError || settings.isError) {
    return <p className="text-sm text-red-600">Não foi possível carregar a ordem.</p>;
  }
  if (!draft || (id && order.isLoading)) {
    return <p className="text-sm text-zinc-500">Carregando a ordem...</p>;
  }

  const activeContracts = customerContracts.data?.data ?? [];
  const savedContract = order.data;
  const keepSavedContract = Boolean(
    savedContract?.contractId &&
    draft.contractId === savedContract.contractId &&
    draft.personId === savedContract.personId &&
    !activeContracts.some((item) => item.id === savedContract.contractId),
  );
  const contractOptions =
    keepSavedContract && savedContract?.contractId
      ? [
          ...activeContracts,
          {
            id: savedContract.contractId,
            numberLabel: savedContract.contractNumberLabel ?? '',
            title: '',
          },
        ]
      : activeContracts;
  const closed = order.data?.status === 'delivered' || order.data?.status === 'cancelled';
  const locked = closed;
  const currentStatus = order.data?.status ?? 'open';
  const destinations = [currentStatus, ...transitions[currentStatus]];
  const canDeliver = transitions[currentStatus].includes('delivered');
  const activeNoteSlots = new Set(
    (settings.data?.noteLines ?? [])
      .filter((line) => line.isActive)
      .map((line) => line.slot),
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
  const allocationMethod = paymentMethods.find(
    (method) => method.id === allocationMethodId,
  );
  const allocationTerms = [...(allocationMethod?.terms ?? [])].sort(
    (left, right) => left.installmentCount - right.installmentCount,
  );
  const {
    productAmount,
    serviceAmount,
    freightAmount,
    discountAmount,
    surchargeAmount,
    totalAmount,
  } = orderTotal(draft);
  const allocatedAmount = allocatedPayments(draft);
  const remainingAmount = totalAmount - allocatedAmount;

  function clearFieldError(key: string) {
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  async function requestNfse() {
    if (!id) return;
    setRequestingNfse(true);
    try {
      const result = await serviceOrdersService.requestNfse(id);
      toast.success(result.body.message);
      await queryClient.invalidateQueries({ queryKey: ['service-order', id] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível pedir a NFS-e.');
    } finally {
      setRequestingNfse(false);
    }
  }

  async function sendNfse() {
    if (!id) return;
    setSendingNfse(true);
    try {
      const result = await serviceOrdersService.sendNfse(id);
      if (result.status === 200 && result.body.request.status === 'authorized') {
        toast.success(result.body.message);
      } else if (result.body.request.status === 'rejected') {
        toast.error(result.body.message);
      } else {
        toast.success(result.body.message);
      }
      await queryClient.invalidateQueries({ queryKey: ['service-order', id] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível enviar a NFS-e.');
    } finally {
      setSendingNfse(false);
    }
  }

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
    clearFieldError(slot);
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
                quantity: '1,0000',
                unitPrice: formatApiDecimal(item.listPrice ?? '0', 4),
                technicianPersonId: null,
              },
            ],
          }
        : current,
    );
  }

  function patchPayment(key: string, partial: Partial<DraftPayment>) {
    setDraft((current) =>
      current
        ? {
            ...current,
            payments: current.payments.map((row) =>
              row.key === key ? { ...row, ...partial } : row,
            ),
          }
        : current,
    );
  }

  function removePayment(key: string) {
    setDraft((current) =>
      current
        ? { ...current, payments: current.payments.filter((row) => row.key !== key) }
        : current,
    );
  }

  function addPaymentGroup() {
    if (!draft) return;
    const method = paymentMethods.find((item) => item.id === allocationMethodId);
    const term = method?.terms.find(
      (item) => String(item.installmentCount) === allocationInstallments,
    );
    const amount = decimalToCents(allocationAmount);
    if (!method || !term) {
      toast.error('Informe a forma e a condição.');
      return;
    }
    if (amount <= 0) {
      toast.error('Informe o valor desta condição.');
      return;
    }
    if (amount > remainingAmount) {
      toast.error('O valor passa do saldo restante.');
      return;
    }
    const dates = installmentDueDates(
      civilDate(),
      term.firstDueDays,
      term.intervalDays,
      term.installmentCount,
    );
    const amounts = splitInstallmentAmounts(amount, term.installmentCount);
    patch({
      payments: [
        ...draft.payments,
        ...dates.map((dueOn, index) => ({
          key: crypto.randomUUID(),
          paymentMethodId: method.id,
          methodName: method.name,
          installmentCount: term.installmentCount,
          dueOn,
          amount: maskCurrencyInput(String(amounts[index] ?? 0)),
        })),
      ],
      paymentMethodId: '',
      paymentInstallments: '',
    });
    amountTouched.current = false;
    setAllocationMethodId('');
    setAllocationInstallments('');
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
    setDraft((current) =>
      current
        ? {
            ...current,
            personId,
            contractId: current.personId === personId ? current.contractId : '',
          }
        : current,
    );
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
    const next: Record<string, string> = {};
    if (!draft.customerName.trim()) {
      next['service-order-customer-name'] = 'Informe o nome do cliente.';
    }
    if (status !== 'cancelled') {
      for (const field of draft.fields) {
        if (field.isActive && field.isRequired && !field.value.trim()) {
          next[field.slot] = `Informe ${field.label}.`;
        }
      }
    }
    setFieldErrors(next);
    if (!draft.personId) {
      toast.error('Informe um cliente ativo.');
      return false;
    }
    if (next['service-order-customer-name']) {
      toast.error(next['service-order-customer-name']);
      return false;
    }
    if (
      status !== 'cancelled' &&
      Object.keys(next).some((key) => key !== 'service-order-customer-name')
    ) {
      toast.error('Preencha os campos obrigatórios.');
      return false;
    }
    if (draft.lines.some((line) => (scale4(line.quantity) ?? 0n) <= 0n)) {
      toast.error('Informe a quantidade de cada item.');
      return false;
    }
    if (draft.payments.some((row) => !/^\d{4}-\d{2}-\d{2}$/.test(row.dueOn))) {
      toast.error('Informe o vencimento de cada parcela.');
      return false;
    }
    if (allocatedAmount > totalAmount) {
      toast.error('O pagamento passa do total da ordem.');
      return false;
    }
    const keepsLegacyMethod =
      draft.payments.length === 0 && Boolean(draft.paymentMethodId);
    if (keepsLegacyMethod && !draft.paymentInstallments) {
      toast.error('Informe a forma e a quantidade de parcelas.');
      return false;
    }
    if (status === 'delivered' && !keepsLegacyMethod && allocatedAmount !== totalAmount) {
      toast.error('Quite o saldo para entregar.');
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
    save.mutate(status, {
      onSuccess: (saved) => {
        if (!id) navigate(`/service-orders/${saved.id}`, { replace: true });
      },
    });
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
        </div>
        <Button variant="outline" asChild>
          <Link to="/service-orders">Voltar à lista</Link>
        </Button>
      </div>

      <section className="space-y-4 rounded-lg border bg-white p-6">
        <div className="grid grid-cols-12 gap-4">
          <PersonSearchSelect
            className="col-span-12"
            label="Cliente"
            value={draft.personId}
            onChange={(personId) => void choosePerson(personId)}
            type="cliente"
            placeholder="Buscar cliente ativo..."
            disabled={locked}
            enterSequence
            allowCreate={!locked}
          />
        </div>

        {draft.personId ? (
          <div className="grid gap-4 md:grid-cols-2">
            <CopyField
              id="service-order-customer-name"
              label="Nome"
              value={draft.customerName}
              required
              error={fieldErrors['service-order-customer-name']}
              disabled={locked}
              onChange={(customerName) => {
                patch({ customerName });
                clearFieldError('service-order-customer-name');
              }}
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
              onChange={(customerPhone) =>
                patch({ customerPhone: formatPhone(customerPhone) })
              }
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
                className="col-span-12 sm:col-span-2"
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
                className="col-span-12 sm:col-span-8"
                label="Endereço"
                value={draft.customerStreetLine}
                disabled={locked}
                onChange={(customerStreetLine) => patch({ customerStreetLine })}
              />
              <CopyField
                id="service-order-customer-street-number"
                className="col-span-12 sm:col-span-2"
                label="Número"
                value={draft.customerStreetNumber}
                disabled={locked}
                onChange={(customerStreetNumber) => patch({ customerStreetNumber })}
              />
              <CopyField
                id="service-order-customer-street-complement"
                className="col-span-12 sm:col-span-4"
                label="Complemento"
                value={draft.customerStreetComplement}
                disabled={locked}
                onChange={(customerStreetComplement) =>
                  patch({ customerStreetComplement })
                }
              />
              <CopyField
                id="service-order-customer-neighborhood"
                className="col-span-12 sm:col-span-4"
                label="Bairro"
                value={draft.customerNeighborhood}
                disabled={locked}
                onChange={(customerNeighborhood) => patch({ customerNeighborhood })}
              />
              <CopyField
                id="service-order-customer-city"
                className="col-span-12 sm:col-span-4"
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
              <div key={field.slot} className={spanClass(field.width)}>
                {longField(field.slot) ? (
                  <FloatingTextarea
                    id={field.slot}
                    label={field.label}
                    required={field.isRequired}
                    error={fieldErrors[field.slot]}
                    data-enter-sequence=""
                    maxLength={2000}
                    value={field.value}
                    disabled={locked}
                    onChange={(event) => patchField(field.slot, event.target.value)}
                  />
                ) : (
                  <FloatingInput
                    id={field.slot}
                    label={field.label}
                    required={field.isRequired}
                    error={fieldErrors[field.slot]}
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
          <FloatingInput
            label="Frete (R$)"
            value={draft.freight}
            disabled={locked}
            data-enter-sequence=""
            {...decimalInputHandlers(2, (value) => patch({ freight: value }))}
          />
          <FloatingInput
            label="Desconto (R$)"
            value={draft.discount}
            disabled={locked}
            data-enter-sequence=""
            {...decimalInputHandlers(2, (value) => patch({ discount: value }))}
          />
          <FloatingInput
            label="Acréscimo (R$)"
            value={draft.surcharge}
            disabled={locked}
            data-enter-sequence=""
            {...decimalInputHandlers(2, (value) => patch({ surcharge: value }))}
          />
        </div>
        <p className="text-sm text-zinc-700">
          Produtos {formatCurrency(productAmount)} · Serviços{' '}
          {formatCurrency(serviceAmount)} · Total{' '}
          <strong>{formatCurrency(totalAmount)}</strong>
          {' · '}
          Saldo{' '}
          <strong className={remainingAmount < 0 ? 'text-red-600' : undefined}>
            {formatCurrency(remainingAmount)}
          </strong>
        </p>
        {locked ? null : (
          <div className="grid items-end gap-4 md:grid-cols-12">
            <FloatingSelect
              id="service-order-method"
              label="Forma de pagamento"
              pinned
              className="md:col-span-4"
              data-enter-sequence=""
              value={allocationMethodId}
              onChange={(event) => {
                const nextId = event.target.value;
                const method = paymentMethods.find((item) => item.id === nextId);
                const stillValid = method?.terms.some(
                  (term) => String(term.installmentCount) === allocationInstallments,
                );
                setAllocationMethodId(nextId);
                if (!stillValid) setAllocationInstallments('');
              }}
            >
              <option value="">Selecione</option>
              {paymentMethods.map((method) => (
                <option key={method.id} value={method.id}>
                  {method.name}
                </option>
              ))}
            </FloatingSelect>
            <FloatingSelect
              id="service-order-installments"
              label="Condição"
              pinned
              className="md:col-span-3"
              data-enter-sequence=""
              value={allocationInstallments}
              disabled={!allocationMethodId}
              onChange={(event) => setAllocationInstallments(event.target.value)}
            >
              <option value="">Selecione</option>
              {allocationTerms.map((term) => (
                <option key={term.installmentCount} value={term.installmentCount}>
                  {term.installmentCount === 1 && term.firstDueDays === 0
                    ? 'À vista'
                    : `${term.installmentCount}x`}
                </option>
              ))}
            </FloatingSelect>
            <FloatingInput
              id="service-order-allocation"
              label="Valor"
              className="md:col-span-3"
              data-enter-sequence=""
              value={allocationAmount}
              {...decimalInputHandlers(
                2,
                (value) => {
                  amountTouched.current = true;
                  setAllocationAmount(value);
                },
                setAllocationAmount,
              )}
            />
            <div className="md:col-span-2">
              <Button
                type="button"
                className="w-full"
                disabled={remainingAmount <= 0}
                onClick={addPaymentGroup}
              >
                Adicionar
              </Button>
            </div>
          </div>
        )}
        {draft.payments.length ? (
          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="border-b text-left text-zinc-500">
                  <th className="py-2 font-medium">Forma</th>
                  <th className="w-44 py-2 font-medium">Vencimento</th>
                  <th className="w-36 py-2 font-medium">Valor</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {draft.payments.map((row) => (
                  <tr key={row.key} className="border-b">
                    <td className="py-2 pr-2">{row.methodName}</td>
                    <td className="py-2 pr-2">
                      <Input
                        type="date"
                        aria-label={`Vencimento de ${row.methodName}`}
                        value={row.dueOn}
                        disabled={locked}
                        onChange={(event) =>
                          patchPayment(row.key, { dueOn: event.target.value })
                        }
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <Input
                        aria-label={`Valor de ${row.methodName}`}
                        value={row.amount}
                        disabled={locked}
                        {...decimalInputHandlers(2, (value) =>
                          patchPayment(row.key, { amount: value }),
                        )}
                      />
                    </td>
                    <td className="py-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remover parcela de ${row.methodName}`}
                        disabled={locked}
                        onClick={() => removePayment(row.key)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-zinc-500">Nenhuma parcela.</p>
        )}
      </section>

      {order.data && order.data.billings.length > 0 ? (
        <section className="space-y-4 rounded-lg border bg-white p-6">
          <h3 className="text-lg font-semibold text-zinc-900">Financeiro</h3>
          {order.data.billingDocument ? (
            <BillingDocumentNote
              document={order.data.billingDocument}
              lines={order.data.nfseRequest?.lines}
              environment={order.data.nfseRequest?.environment ?? nfseSettings.data?.environment}
              accessKey={order.data.nfseRequest?.accessKey}
              statusMessage={order.data.nfseRequest?.statusMessage}
              requesting={requestingNfse}
              sending={sendingNfse}
              sendLabel={
                order.data.nfseRequest?.status === 'rejected'
                  ? 'Enviar de novo'
                  : (order.data.nfseRequest?.environment ?? nfseSettings.data?.environment) ===
                      'production'
                    ? 'Enviar à produção'
                    : 'Enviar à homologação'
              }
              onRequest={
                order.data.billingDocument.commercialStatus === 'issued' &&
                order.data.billingDocument.fiscalStatus === 'not_requested' &&
                order.data.billingDocument.servicesAmount > 0
                  ? () => void requestNfse()
                  : undefined
              }
              onSend={
                order.data.nfseRequest &&
                (order.data.nfseRequest.status === 'pending' ||
                  order.data.nfseRequest.status === 'rejected')
                  ? () => void sendNfse()
                  : undefined
              }
            />
          ) : null}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-zinc-500">
                  <th className="py-2 font-medium">Documento</th>
                  <th className="py-2 font-medium">Vencimento</th>
                  <th className="py-2 font-medium">Valor</th>
                  <th className="py-2 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody>
                {order.data.billings.map((billing) => (
                  <tr key={billing.receivableId} className="border-b">
                    <td className="py-2 pr-2">{billing.documentNumber ?? '—'}</td>
                    <td className="py-2 pr-2">{formatIsoDate(billing.dueOn)}</td>
                    <td className="py-2 pr-2">{formatCurrency(billing.amount)}</td>
                    <td className="py-2">{billingStatusLabel[billing.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="space-y-4 rounded-lg border bg-white p-6">
        <h3 className="text-lg font-semibold text-zinc-900">Informações adicionais</h3>
        <div className="grid grid-cols-12 gap-4">
          <FloatingInput
            id="service-order-promised"
            label="Previsão"
            className="col-span-12 md:col-span-6"
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
          <FloatingSelect
            id="service-order-status"
            label="Situação"
            className="col-span-12 md:col-span-6"
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
          </FloatingSelect>
          <FloatingSelect
            id="service-order-location"
            label="Local de atendimento"
            className="col-span-6 md:col-span-6"
            data-enter-sequence=""
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
          </FloatingSelect>
          <FloatingSelect
            id="service-order-attendance"
            label="Tipo de atendimento"
            className="col-span-6 md:col-span-6"
            data-enter-sequence=""
            value={draft.attendance}
            disabled={locked}
            onChange={(event) => {
              const attendance = event.target.value as ServiceOrderAttendance;
              patch({
                attendance,
                originOrderId:
                  attendance === 'contract'
                    ? ''
                    : needsOrigin(attendance)
                      ? draft.originOrderId
                      : '',
                contractId: attendance === 'contract' ? draft.contractId : '',
              });
            }}
          >
            {(Object.keys(attendanceLabels) as ServiceOrderAttendance[]).map((value) => (
              <option key={value} value={value}>
                {attendanceLabels[value]}
              </option>
            ))}
          </FloatingSelect>
        </div>
        <div className="grid grid-cols-12 gap-4">
          {needsOrigin(draft.attendance) ? (
            <FloatingSelect
              id="service-order-origin"
              label="Ordem de origem"
              className="col-span-12 md:col-span-4"
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
            </FloatingSelect>
          ) : null}
          {draft.attendance === 'contract' ? (
            <div className="col-span-12 md:col-span-6">
              <FloatingSelect
                id="service-order-contract"
                label="Contrato"
                value={draft.contractId}
                disabled={locked || !draft.personId}
                onChange={(event) => patch({ contractId: event.target.value })}
              >
                <option value="">Sem contrato</option>
                {contractOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title
                      ? `${item.numberLabel} — ${item.title}`
                      : item.numberLabel}
                  </option>
                ))}
              </FloatingSelect>
              <p className="mt-1 text-sm text-zinc-500">
                A cobrança do período não abate os itens desta ordem.
              </p>
            </div>
          ) : null}
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
        <div>
          <FloatingTextarea
            id="service-order-internal"
            label="Nota interna"
            data-enter-sequence=""
            value={draft.internalNotes}
            onChange={(event) => patch({ internalNotes: event.target.value })}
          />
          <p className="mt-1 text-xs text-zinc-500">Não entra no comprovante.</p>
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
        <Button variant="outline" asChild>
          <Link to="/service-orders">Voltar à lista</Link>
        </Button>
        {canDeliver && !locked ? (
          <Button
            type="button"
            disabled={save.isPending || reverseDelivery.isPending}
            onClick={() => submit('delivered')}
          >
            Entregar
          </Button>
        ) : null}
        {order.data?.status === 'delivered' ? (
          <Button
            type="button"
            variant="outline"
            disabled={save.isPending || reverseDelivery.isPending}
            onClick={() => setReverseOpen(true)}
          >
            Estornar
          </Button>
        ) : null}
      </div>

      <AlertDialog open={reverseOpen} onOpenChange={setReverseOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Estornar entrega</AlertDialogTitle>
            <AlertDialogDescription>
              A ordem volta para Pronta e pode ser alterada. Títulos pendentes são
              cancelados. Um recebimento já feito impede o estorno.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reverseDelivery.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={reverseDelivery.isPending}
              onClick={(event) => {
                event.preventDefault();
                reverseDelivery.mutate();
              }}
            >
              {reverseDelivery.isPending ? 'Estornando...' : 'Estornar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
  required,
  error,
}: {
  id: string;
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  className?: string;
  inputMode?: 'numeric' | 'text';
  maxLength?: number;
  required?: boolean;
  error?: string;
}) {
  return (
    <FloatingInput
      id={id}
      label={label}
      value={value}
      disabled={disabled}
      className={className}
      inputMode={inputMode}
      maxLength={maxLength}
      required={required}
      error={error}
      data-enter-sequence=""
      autoComplete="off"
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function LineTable({
  title,
  kind,
  lines,
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
  pickerKey: number;
  locked: boolean;
  onAdd: (item: CatalogItem) => void;
  onPatch: (index: number, partial: Partial<DraftLine>) => void;
  onRemove: (index: number) => void;
  onTechnician: (index: number, personId: string) => void;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const focusNewLine = useRef(false);
  const [term, setTerm] = useState('');

  useEffect(() => {
    setTerm('');
  }, [pickerKey]);

  useEffect(() => {
    if (!focusNewLine.current) return;
    focusNewLine.current = false;
    const section = sectionRef.current;
    requestAnimationFrame(() => {
      section
        ?.querySelector<HTMLElement>('tbody tr:last-child [data-enter-sequence]')
        ?.focus();
    });
  }, [lines]);

  const search = useQuery({
    queryKey: ['catalog-items', 'service-order', kind, term],
    queryFn: () =>
      itemsService.list({
        page: 1,
        limit: 100,
        sortField: 'name',
        sortOrder: 'asc',
        search: term,
        type: kind,
        isActive: true,
      }),
    enabled: term.length > 0,
  });
  const items = search.data?.data ?? [];
  const visible = lines
    .map((line, index) => ({ line, index }))
    .filter((entry) => entry.line.kind === kind);

  return (
    <section ref={sectionRef} className="space-y-3 rounded-lg border bg-white p-6">
      <h3 className="text-lg font-semibold text-zinc-900">{title}</h3>
      {locked ? null : (
        <CatalogSearchSelect
          key={pickerKey}
          value=""
          enterSequence
          onChange={(itemId) => {
            const item = items.find((entry) => entry.id === itemId);
            if (!item) return;
            focusNewLine.current = true;
            onAdd(item);
          }}
          options={items.map((item) => ({
            id: item.id,
            label: `${item.code} — ${item.name}`,
          }))}
          onSearch={setTerm}
          isLoading={search.isFetching}
          placeholder={
            kind === 'product' ? 'Buscar produto ativo...' : 'Buscar serviço ativo...'
          }
          emptyMessage={
            kind === 'product'
              ? 'Digite para buscar um produto.'
              : 'Digite para buscar um serviço.'
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
                        enterSequence
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
                      {...decimalInputHandlers(4, (value) =>
                        onPatch(index, { quantity: value }),
                      )}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      aria-label="Unitário"
                      className="w-full px-2"
                      data-enter-sequence=""
                      placeholder="0,0000"
                      value={line.unitPrice}
                      disabled={locked}
                      {...decimalInputHandlers(4, (value) =>
                        onPatch(index, { unitPrice: value }),
                      )}
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
