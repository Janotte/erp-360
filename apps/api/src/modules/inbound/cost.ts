import { round4 } from '@erp-360/shared';

export {
  type CostFlags,
  type LineAmounts,
  lineUnitCost,
  nextAverage,
  round4,
} from '@erp-360/shared';

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
