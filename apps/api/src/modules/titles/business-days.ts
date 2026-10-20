function utcDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatUtc(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addUtcDays(isoDate: string, days: number): string {
  const date = utcDate(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return formatUtc(date);
}

/** Domingo de Páscoa no calendário gregoriano. */
function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const holidaysByYear = new Map<number, Set<string>>();

/**
 * Feriados em que não há expediente bancário: nacionais, Carnaval,
 * Sexta-feira Santa e Corpus Christi. Consciência Negra é nacional desde 2024.
 */
function holidays(year: number): Set<string> {
  const cached = holidaysByYear.get(year);
  if (cached) return cached;

  const easter = easterSunday(year);
  const dates = new Set<string>([
    `${year}-01-01`,
    `${year}-04-21`,
    `${year}-05-01`,
    `${year}-09-07`,
    `${year}-10-12`,
    `${year}-11-02`,
    `${year}-11-15`,
    `${year}-12-25`,
    addUtcDays(easter, -48),
    addUtcDays(easter, -47),
    addUtcDays(easter, -2),
    addUtcDays(easter, 60),
  ]);
  if (year >= 2024) dates.add(`${year}-11-20`);

  holidaysByYear.set(year, dates);
  return dates;
}

function isWeekendOrHoliday(isoDate: string): boolean {
  const weekday = utcDate(isoDate).getUTCDay();
  if (weekday === 0 || weekday === 6) return true;
  return holidays(Number(isoDate.slice(0, 4))).has(isoDate);
}

/** Vencimento efetivo: a própria data, ou o próximo dia útil se cair em fim de semana ou feriado. */
export function effectiveDueOn(dueOn: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueOn)) return dueOn;

  let cursor = dueOn;
  for (let step = 0; step < 14 && isWeekendOrHoliday(cursor); step += 1) {
    cursor = addUtcDays(cursor, 1);
  }
  return cursor;
}
