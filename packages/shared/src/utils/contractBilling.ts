export type ContractBillingKind = 'monthly' | 'quarterly' | 'semiannual' | 'annual';

export type ContractBillingCompetence = 'current' | 'previous';

export type ContractInstallment = {
  /** Dia 1 do mês em que o período começa. */
  competence: string;
  dueOn: string;
};

const monthsByKind: Record<ContractBillingKind, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
};

function shiftMonth(year: number, month: number, delta: number) {
  const shifted = month - 1 + delta;
  return {
    year: year + Math.floor(shifted / 12),
    month: (shifted % 12) + 1,
  };
}

function parseCivilDate(iso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new Error('Data inválida.');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error('Data inválida.');
  }
  return { year, month, day };
}

function civilDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function monthIndex(year: number, month: number) {
  return year * 12 + month;
}

/** Série inteira de vencimentos, alinhada ao mês de início e limitada ao mês do fim. */
export function contractBillingSchedule(input: {
  startedOn: string;
  endedOn: string;
  billingKind: ContractBillingKind;
  billingCompetence: ContractBillingCompetence;
  dueDay: number;
}): ContractInstallment[] {
  if (!Number.isInteger(input.dueDay) || input.dueDay < 1 || input.dueDay > 28) {
    throw new Error('O dia de vencimento vai de 1 a 28.');
  }
  const start = parseCivilDate(input.startedOn);
  const end = parseCivilDate(input.endedOn);
  const span = monthsByKind[input.billingKind];
  const endIndex = monthIndex(end.year, end.month);
  const rows: ContractInstallment[] = [];
  let cursor = { year: start.year, month: start.month };

  while (monthIndex(cursor.year, cursor.month) <= endIndex) {
    const due =
      input.billingCompetence === 'current'
        ? cursor
        : shiftMonth(cursor.year, cursor.month, span);
    rows.push({
      competence: civilDate(cursor.year, cursor.month, 1),
      dueOn: civilDate(due.year, due.month, input.dueDay),
    });
    cursor = shiftMonth(cursor.year, cursor.month, span);
  }

  return rows;
}
