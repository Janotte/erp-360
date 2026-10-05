/** YYYY-MM-DD helpers for payable replication */

export function formatIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, days: number): string {
  const date = parseIsoDate(iso);
  date.setDate(date.getDate() + days);
  return formatIsoDate(date);
}

/** Adds months keeping a target day-of-month (clamped to last day of month). */
export function addMonthsWithDay(iso: string, months: number, dayOfMonth: number): string {
  const date = parseIsoDate(iso);
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(Math.max(1, dayOfMonth), lastDay));
  return formatIsoDate(target);
}

/**
 * If document ends with YYYYMM (optionally with prefix), advance by `steps` months.
 * Otherwise returns the original value unchanged.
 */
export function advanceDocumentNumber(
  documentNumber: string | undefined,
  steps: number,
): string | undefined {
  if (!documentNumber) return undefined;
  const match = documentNumber.match(/^(.*?)(\d{6})$/);
  if (!match) return documentNumber;

  const prefix = match[1];
  const ym = match[2];
  const year = Number(ym.slice(0, 4));
  const month = Number(ym.slice(4, 6));
  if (!Number.isFinite(year) || month < 1 || month > 12) return documentNumber;

  const cursor = new Date(year, month - 1 + steps, 1);
  const nextYm = `${cursor.getFullYear()}${String(cursor.getMonth() + 1).padStart(2, '0')}`;
  return `${prefix}${nextYm}`;
}

export type DueMode = 'intervalDays' | 'fixedDay';
export type IssueMode = 'keep' | 'advance' | 'today';

export interface ReplicateScheduleOptions {
  dueMode: DueMode;
  intervalDays: number;
  fixedDay: number;
  issueMode: IssueMode;
  quantity: number;
}

export interface ReplicateDateResult {
  issueOn: string;
  dueOn: string;
  documentNumber?: string;
}

export function buildReplicateStep(
  source: { issueOn: string; dueOn: string; documentNumber?: string },
  step: number,
  options: ReplicateScheduleOptions,
): ReplicateDateResult {
  const dueOn =
    options.dueMode === 'intervalDays'
      ? addDays(source.dueOn.slice(0, 10), options.intervalDays * step)
      : addMonthsWithDay(
          source.dueOn.slice(0, 10),
          step,
          options.fixedDay || parseIsoDate(source.dueOn).getDate(),
        );

  let issueOn = source.issueOn.slice(0, 10);
  if (options.issueMode === 'today') {
    issueOn = formatIsoDate(new Date());
  } else if (options.issueMode === 'advance') {
    issueOn =
      options.dueMode === 'intervalDays'
        ? addDays(source.issueOn.slice(0, 10), options.intervalDays * step)
        : addMonthsWithDay(
            source.issueOn.slice(0, 10),
            step,
            parseIsoDate(source.issueOn).getDate(),
          );
  }

  return {
    issueOn,
    dueOn,
    documentNumber: advanceDocumentNumber(source.documentNumber, step),
  };
}
