export type ServiceOrderStatus =
  | 'open'
  | 'analyzing'
  | 'waiting_approval'
  | 'waiting_parts'
  | 'in_progress'
  | 'ready'
  | 'delivered'
  | 'cancelled';

export type ServiceOrderAttendance = 'walk_in' | 'warranty' | 'rework' | 'contract';

export type ServiceOrderLocation = 'remote' | 'internal' | 'external';

export type ServiceOrderLineKind = 'product' | 'service';

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

function reject(message: string): never {
  const error = new Error(message) as Error & { status: number };
  error.status = 400;
  throw error;
}

/** A mesma situação não é transição. */
export function assertTransition(from: ServiceOrderStatus, to: ServiceOrderStatus) {
  if (from === to) return;
  if (!transitions[from].includes(to)) {
    reject('Esta situação não pode seguir para a escolhida.');
  }
}

function scale4(value: string): bigint {
  const match = /^(\d+)\.(\d{1,4})$/.exec(value);
  if (!match) reject('Informe quantidade e preço com até quatro casas.');
  const fraction = match[2].padEnd(4, '0');
  return BigInt(match[1]) * 10_000n + BigInt(fraction);
}

/** Quantidade × preço, na escala 8, convertido a centavos com meio para cima. */
export function lineAmountCents(quantity: string, unitPrice: string): number {
  const product = scale4(quantity) * scale4(unitPrice);
  return Number((product + 500_000n) / 1_000_000n);
}

export function assertTotals(input: {
  productsAmount: number;
  servicesAmount: number;
  freightAmount: number;
  discountAmount: number;
  surchargeAmount: number;
}) {
  const base =
    input.productsAmount + input.servicesAmount + input.freightAmount + input.surchargeAmount;
  if (input.discountAmount > base) {
    reject('O desconto não pode passar da soma dos itens, do frete e do acréscimo.');
  }
}

export function formatServiceOrderNumber(value: number): string {
  const digits = String(Math.trunc(value));
  const padded = digits.length < 9 ? digits.padStart(9, '0') : digits;
  return padded.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function installmentsLabel(count: number, firstDueDays: number): string {
  if (count === 1 && firstDueDays === 0) return 'À vista';
  return `${count}x`;
}

export function labelChangeSlots(
  before: Record<string, string>,
  after: Record<string, string>,
  openValues: Record<string, boolean>,
): string[] {
  return Object.keys(after).filter((slot) => {
    const previous = (before[slot] ?? '').trim();
    const next = after[slot].trim();
    return previous !== next && openValues[slot] === true;
  });
}

export function assertOrigin(input: {
  attendance: ServiceOrderAttendance;
  originOrderId: string | null;
  orderId: string;
}) {
  if (!input.originOrderId) return;
  if (input.attendance !== 'warranty' && input.attendance !== 'rework') {
    reject('Só garantia e retrabalho apontam uma ordem de origem.');
  }
  if (input.originOrderId === input.orderId) {
    reject('A ordem não pode ser a origem dela mesma.');
  }
}

export function assertRequiredFields(
  fields: { slot: string; isActive: boolean; isRequired: boolean }[],
  values: Record<string, string | null | undefined>,
) {
  for (const field of fields) {
    if (!field.isActive || !field.isRequired) continue;
    if (!(values[field.slot]?.trim() ?? '')) {
      reject('Preencha os campos obrigatórios.');
    }
  }
}

export function assertLine(input: {
  kind: ServiceOrderLineKind;
  itemKind: ServiceOrderLineKind;
  technicianPersonId: string | null;
}) {
  if (input.kind !== input.itemKind) {
    reject(
      input.kind === 'service'
        ? 'Serviço só aceita item de serviço.'
        : 'Produto só aceita item de produto.',
    );
  }
  if (input.kind === 'product' && input.technicianPersonId) {
    reject('Linha de produto não tem técnico.');
  }
}
