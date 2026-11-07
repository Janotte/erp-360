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

function installmentAt(
  cursor: { year: number; month: number },
  span: number,
  billingCompetence: ContractBillingCompetence,
  dueDay: number,
): ContractInstallment {
  const due =
    billingCompetence === 'current' ? cursor : shiftMonth(cursor.year, cursor.month, span);
  return {
    competence: civilDate(cursor.year, cursor.month, 1),
    dueOn: civilDate(due.year, due.month, dueDay),
  };
}

/**
 * Série de vencimentos, alinhada ao mês de início.
 * Com fim, inclui cada período até o mês do fim. Sem fim, devolve só o próximo
 * período que ainda não foi cobrado; se nenhum foi, o primeiro.
 */
export function contractBillingSchedule(input: {
  startedOn: string;
  endedOn: string | null;
  billingKind: ContractBillingKind;
  billingCompetence: ContractBillingCompetence;
  dueDay: number;
  billedCompetences?: readonly string[];
}): ContractInstallment[] {
  if (!Number.isInteger(input.dueDay) || input.dueDay < 1 || input.dueDay > 28) {
    throw new Error('O dia de vencimento vai de 1 a 28.');
  }
  const start = parseCivilDate(input.startedOn);
  const span = monthsByKind[input.billingKind];
  let cursor = { year: start.year, month: start.month };

  if (input.endedOn === null) {
    const billed = new Set(input.billedCompetences ?? []);
    for (;;) {
      const row = installmentAt(cursor, span, input.billingCompetence, input.dueDay);
      if (!billed.has(row.competence)) return [row];
      cursor = shiftMonth(cursor.year, cursor.month, span);
    }
  }

  const end = parseCivilDate(input.endedOn);
  const endIndex = monthIndex(end.year, end.month);
  const rows: ContractInstallment[] = [];
  while (monthIndex(cursor.year, cursor.month) <= endIndex) {
    rows.push(installmentAt(cursor, span, input.billingCompetence, input.dueDay));
    cursor = shiftMonth(cursor.year, cursor.month, span);
  }
  return rows;
}
