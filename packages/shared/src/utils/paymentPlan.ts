/** Reparte o valor em centavos. O resto fica nas primeiras parcelas. */
export function splitInstallmentAmounts(totalCents: number, count: number) {
  if (!Number.isInteger(totalCents) || totalCents < 0) {
    throw new Error('Valor inválido.');
  }
  if (!Number.isInteger(count) || count < 1 || count > 48) {
    throw new Error('Condição inválida.');
  }
  const base = Math.floor(totalCents / count);
  const extra = totalCents % count;
  return Array.from({ length: count }, (_, index) => base + (index < extra ? 1 : 0));
}

export function addCivilDays(isoDate: string, days: number) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match || !Number.isInteger(days)) {
    throw new Error('Data inválida.');
  }
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
  date.setUTCDate(date.getUTCDate() + days);
  const nextYear = date.getUTCFullYear();
  const nextMonth = String(date.getUTCMonth() + 1).padStart(2, '0');
  const nextDay = String(date.getUTCDate()).padStart(2, '0');
  return `${nextYear}-${nextMonth}-${nextDay}`;
}

/** Vencimentos de fatura. O primeiro cai no dia informado depois da compra. */
export function statementDueDates(issueOn: string, dueDay: number, count: number) {
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) {
    throw new Error('Dia de vencimento inválido.');
  }
  if (!Number.isInteger(count) || count < 1 || count > 48) {
    throw new Error('Condição inválida.');
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(issueOn);
  if (!match) throw new Error('Data inválida.');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const issue = new Date(Date.UTC(year, month - 1, day));
  if (
    issue.getUTCFullYear() !== year ||
    issue.getUTCMonth() !== month - 1 ||
    issue.getUTCDate() !== day
  ) {
    throw new Error('Data inválida.');
  }
  let cursorMonth = month;
  let cursorYear = year;
  if (day >= dueDay) {
    cursorMonth += 1;
    if (cursorMonth > 12) {
      cursorMonth = 1;
      cursorYear += 1;
    }
  }
  return Array.from({ length: count }, (_, index) => {
    const shifted = cursorMonth - 1 + index;
    const nextYear = cursorYear + Math.floor(shifted / 12);
    const nextMonth = (shifted % 12) + 1;
    return `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`;
  });
}

/** Vencimentos a partir da data em que o plano é montado. */
export function installmentDueDates(
  baseIso: string,
  firstDueDays: number,
  intervalDays: number,
  count: number,
) {
  if (!Number.isInteger(count) || count < 1 || count > 48) {
    throw new Error('Condição inválida.');
  }
  if (!Number.isInteger(firstDueDays) || firstDueDays < 0) {
    throw new Error('Data inválida.');
  }
  if (!Number.isInteger(intervalDays) || intervalDays < 0) {
    throw new Error('Data inválida.');
  }
  return Array.from({ length: count }, (_, index) =>
    addCivilDays(baseIso, firstDueDays + index * intervalDays),
  );
}
