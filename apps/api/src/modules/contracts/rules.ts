export type ContractStatus = 'draft' | 'active' | 'suspended' | 'closed' | 'cancelled';

export type ContractBillingKind =
  'none' | 'monthly' | 'quarterly' | 'semiannual' | 'annual';

export type ContractBillingCompetence = 'current' | 'previous';

export type ContractBilling = {
  startedOn: string;
  endedOn: string | null;
  billingKind: ContractBillingKind;
  billingCompetence: ContractBillingCompetence | null;
  periodAmount: number;
  dueDay: number | null;
};

export type ContractFields = ContractBilling & {
  personId: string;
  title: string;
  notes: string;
  paymentMethodId: string | null;
  planAccountId: string | null;
  status: ContractStatus;
};

const transitions: Record<ContractStatus, readonly ContractStatus[]> = {
  draft: ['active', 'cancelled'],
  active: ['suspended', 'closed'],
  suspended: ['active', 'closed'],
  closed: [],
  cancelled: [],
};

const frozenKeys = [
  'personId',
  'startedOn',
  'billingKind',
  'billingCompetence',
  'paymentMethodId',
] as const satisfies readonly (keyof ContractFields)[];

const comparableKeys = [
  ...frozenKeys,
  'title',
  'notes',
  'endedOn',
  'periodAmount',
  'dueDay',
  'planAccountId',
  'status',
] as const satisfies readonly (keyof ContractFields)[];

function reject(message: string): never {
  const error = new Error(message) as Error & { status: number };
  error.status = 400;
  throw error;
}

/** A mesma situação não é transição. */
export function assertTransition(from: ContractStatus, to: ContractStatus) {
  if (from === to) return;
  if (!transitions[from].includes(to)) {
    reject('Esta situação não pode seguir para a escolhida.');
  }
}

function yearMonth(iso: string) {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(iso);
  if (!match) reject('Data inválida.');
  return Number(match[1]) * 12 + Number(match[2]);
}

export function assertBilling(input: ContractBilling) {
  if (input.endedOn && input.endedOn < input.startedOn) {
    reject('O fim da vigência não pode ser anterior ao início.');
  }
  if (input.billingKind === 'none') {
    if (
      input.periodAmount !== 0 ||
      input.dueDay !== null ||
      input.billingCompetence !== null
    ) {
      reject('Contrato sem cobrança não leva valor, dia nem competência.');
    }
    return;
  }
  if (
    input.dueDay !== null &&
    (!Number.isInteger(input.dueDay) || input.dueDay < 1 || input.dueDay > 28)
  ) {
    reject('O dia de vencimento vai de 1 a 28.');
  }
  if (
    input.dueDay === null ||
    input.billingCompetence === null ||
    !Number.isInteger(input.periodAmount) ||
    input.periodAmount <= 0
  ) {
    reject('A cobrança recorrente precisa de valor, dia e competência.');
  }
}

/** Fim vazio segue em aberto. Um fim preenchido não pode deixar período já cobrado de fora. */
export function assertTermKeepsBilledPeriods(
  endedOn: string | null,
  competences: string[],
) {
  if (competences.length === 0 || !endedOn) return;
  const end = yearMonth(endedOn);
  for (const competence of competences) {
    if (yearMonth(competence) > end) {
      reject('A vigência não pode deixar de fora um período que já tem título.');
    }
  }
}

/** Vigente ou suspenso com fim anterior a hoje. A situação não muda. */
export function termExpired(
  status: ContractStatus,
  endedOn: string | null,
  today: string,
) {
  if (status !== 'active' && status !== 'suspended') return false;
  if (!endedOn) return false;
  return endedOn < today;
}

function sameContract(stored: ContractFields, next: ContractFields) {
  return comparableKeys.every((key) => stored[key] === next[key]);
}

/** Encerrado e cancelado ficam quietos. Depois do rascunho, o núcleo comercial não muda. */
export function assertMutable(stored: ContractFields, next: ContractFields) {
  if (stored.status === 'closed' || stored.status === 'cancelled') {
    if (!sameContract(stored, next)) {
      reject('Contrato encerrado ou cancelado não pode ser alterado.');
    }
    return;
  }
  if (stored.status === 'draft') return;
  for (const key of frozenKeys) {
    if (stored[key] !== next[key]) {
      reject(
        'Cliente, início, periodicidade, competência e forma não mudam depois da ativação.',
      );
    }
  }
}

export function formatContractNumber(value: number): string {
  const digits = String(Math.trunc(value));
  const padded = digits.length < 6 ? digits.padStart(6, '0') : digits;
  return padded.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
