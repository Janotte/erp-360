export interface CostFlags {
  freightInCost: boolean;
  insuranceInCost: boolean;
  otherInCost: boolean;
  discountInCost: boolean;
  ipiInCost: boolean;
  stInCost: boolean;
  icmsInCost: boolean;
}

export interface LineAmounts {
  lineAmountCents: number;
  freightCents: number;
  insuranceCents: number;
  otherCents: number;
  discountCents: number;
  ipiCents: number;
  stCents: number;
  icmsCents: number;
  stockQty: number;
}

export function round4(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

export function lineUnitCost(amounts: LineAmounts, flags: CostFlags) {
  if (amounts.stockQty <= 0) {
    throw new Error('Quantidade de estoque inválida.');
  }
  let extra = 0;
  if (flags.freightInCost) extra += amounts.freightCents;
  if (flags.insuranceInCost) extra += amounts.insuranceCents;
  if (flags.otherInCost) extra += amounts.otherCents;
  if (flags.discountInCost) extra -= amounts.discountCents;
  if (flags.ipiInCost) extra += amounts.ipiCents;
  if (flags.stInCost) extra += amounts.stCents;
  if (flags.icmsInCost) extra += amounts.icmsCents;
  return round4((amounts.lineAmountCents + extra) / 100 / amounts.stockQty);
}

export function nextAverage(
  currentQty: number,
  currentAverage: number,
  incomingQty: number,
  unitCost: number,
) {
  if (currentQty <= 0) return round4(unitCost);
  return round4(
    (currentQty * currentAverage + incomingQty * unitCost) / (currentQty + incomingQty),
  );
}

export function reversedBalance(
  currentQty: number,
  currentAverage: number,
  outgoingQty: number,
  unitCost: number,
) {
  const quantity = round4(currentQty - outgoingQty);
  if (quantity < 0) return null;
  if (quantity === 0) return { quantity: 0, averageCost: 0 };
  const averageCost = round4(
    (currentQty * currentAverage - outgoingQty * unitCost) / quantity,
  );
  return { quantity, averageCost: Math.max(0, averageCost) };
}

/** Número da NF-e com 9 dígitos seguido da série com 3, como 000014263004. */
export function payableDocumentNumber(number: string, series: string) {
  const nfeNumber = number.replace(/\D/g, '').padStart(9, '0').slice(-9);
  const nfeSeries = series.replace(/\D/g, '').padStart(3, '0').slice(-3);
  return `${nfeNumber}${nfeSeries}`;
}

export function moneyToCents(value: string | number | null | undefined) {
  if (value == null || value === '') return 0;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100);
}

export function nfeAccessKeyCheckDigit(base: string) {
  let weight = 2;
  let sum = 0;
  for (let index = base.length - 1; index >= 0; index -= 1) {
    sum += Number(base[index]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const mod = sum % 11;
  return mod === 0 || mod === 1 ? '0' : String(11 - mod);
}

export function isValidNfeAccessKey(key: string) {
  if (!/^[0-9]{44}$/.test(key)) return false;
  return nfeAccessKeyCheckDigit(key.slice(0, 43)) === key[43];
}
