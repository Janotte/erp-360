export function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00`);
  const end = Date.parse(`${to}T00:00:00`);
  return Math.round((end - start) / 86_400_000);
}

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function applyBps(amount: number, bps: number): number {
  return Math.round((amount * bps) / 10_000);
}

export function computeDueAmount(params: {
  kind: 'payable' | 'receivable';
  originalAmount: number;
  dueOn: string;
  settledOn: string;
  lateFeeBps: number;
  dailyInterestBps: number;
  graceDays: number;
  waiveCharges: boolean;
}) {
  if (params.kind === 'payable' || params.waiveCharges) {
    const calendarDaysLate = Math.max(0, daysBetween(params.dueOn, params.settledOn));
    return {
      daysLate: calendarDaysLate,
      chargeableDays: 0,
      fineAmount: 0,
      interestAmount: 0,
      dueAmount: params.originalAmount,
    };
  }

  const calendarDaysLate = Math.max(0, daysBetween(params.dueOn, params.settledOn));
  const chargeableDays = Math.max(0, calendarDaysLate - params.graceDays);
  const late = chargeableDays > 0;
  const fineAmount = late ? applyBps(params.originalAmount, params.lateFeeBps) : 0;
  const interestAmount = late
    ? applyBps(params.originalAmount, params.dailyInterestBps * chargeableDays)
    : 0;

  return {
    daysLate: calendarDaysLate,
    chargeableDays,
    fineAmount,
    interestAmount,
    dueAmount: params.originalAmount + fineAmount + interestAmount,
  };
}

export function computeSettlementGaps(params: {
  kind: 'payable' | 'receivable';
  originalAmount: number;
  dueAmount: number;
  settledAmount: number;
  daysLate: number;
  waiveCharges: boolean;
}) {
  const remainder = params.dueAmount - params.settledAmount;
  const extraVsDue = params.settledAmount - params.dueAmount;
  const extraVsOriginal = params.settledAmount - params.originalAmount;
  const extra =
    params.kind === 'receivable' &&
    !params.waiveCharges &&
    params.daysLate > 0 &&
    extraVsOriginal > 0
      ? extraVsOriginal
      : extraVsDue;

  return { remainder, extra };
}
