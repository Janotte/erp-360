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

export type SettlementLegDirection = 'with' | 'against';

export interface SettlementTreasuryLeg {
  planAccountId: string | null;
  description: string;
  inflowAmount: number;
  outflowAmount: number;
}

function treasuryAmounts(
  kind: 'payable' | 'receivable',
  direction: SettlementLegDirection,
  amount: number,
) {
  const inflow = kind === 'receivable' ? direction === 'with' : direction === 'against';
  return inflow
    ? { inflowAmount: amount, outflowAmount: 0 }
    : { inflowAmount: 0, outflowAmount: amount };
}

function clipDescription(value: string) {
  return value.slice(0, 255);
}

export function settlementTreasuryLegs(params: {
  kind: 'payable' | 'receivable';
  settledAmount: number;
  remainder: number;
  extra: number;
  remainderMode: 'none' | 'new_title' | 'plan_account';
  titlePlanAccountId: string | null;
  differencePlanAccountId: string | null;
  description: string;
}): SettlementTreasuryLeg[] {
  const writeOff =
    params.remainder > 0 &&
    params.remainderMode === 'plan_account' &&
    params.differencePlanAccountId
      ? {
          titleAmount: params.settledAmount + params.remainder,
          differenceAmount: params.remainder,
          direction: 'against' as const,
        }
      : params.extra > 0 && params.remainder <= 0 && params.differencePlanAccountId
        ? {
            titleAmount: params.settledAmount - params.extra,
            differenceAmount: params.extra,
            direction: 'with' as const,
          }
        : null;

  if (!writeOff) {
    return [
      {
        planAccountId: params.titlePlanAccountId,
        description: clipDescription(params.description),
        ...treasuryAmounts(params.kind, 'with', params.settledAmount),
      },
    ];
  }

  const legs: SettlementTreasuryLeg[] = [];
  if (writeOff.titleAmount > 0) {
    legs.push({
      planAccountId: params.titlePlanAccountId,
      description: clipDescription(params.description),
      ...treasuryAmounts(params.kind, 'with', writeOff.titleAmount),
    });
  }
  if (writeOff.differenceAmount > 0) {
    legs.push({
      planAccountId: params.differencePlanAccountId,
      description: clipDescription(`${params.description} (diferença)`),
      ...treasuryAmounts(params.kind, writeOff.direction, writeOff.differenceAmount),
    });
  }
  return legs;
}
