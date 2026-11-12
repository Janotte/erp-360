import {
  type CostFlags,
  lineUnitCost,
  projectedAverage,
  round4,
  syncPricing,
} from './pricing.ts';

export type PricingEdited = 'margin' | 'price' | 'none';

export interface PricingFields {
  margin: string;
  price: string;
  edited: PricingEdited;
  error: string;
}

export interface PricingItemInfo {
  itemId: string;
  code: string;
  name: string;
  quantity: number;
  averageCost: number;
  grossMargin: string | null;
}

export interface PricingLine {
  lineNumber: number;
  itemId?: string | null;
  commercialQty: number;
  factor: number;
}

export interface PricingLineCents {
  lineAmount: number;
  freightAmount: number;
  insuranceAmount: number;
  otherAmount: number;
  discountAmount: number;
  ipiAmount: number;
  stAmount: number;
  icmsAmount: number;
}

export interface PricingContext {
  flags: CostFlags;
  docLines: Map<number, PricingLineCents>;
}

export type PricingOverrides = Record<string, string | null>;

export const pricingPriceMessage = 'Preço de lista menor que o custo médio.';
export const pricingMarginMessage =
  'Informe a margem bruta entre 0 e 100, sem incluir 100.';

export function maskPrice(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 15);
  if (!digits) return '';
  const padded = digits.padStart(5, '0');
  const fraction = padded.slice(-4);
  const integers = padded.slice(0, -4).replace(/^0+(?=\d)/, '') || '0';
  return `${integers.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${fraction}`;
}

export function maskPercent(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 6);
  if (!digits) return '';
  const padded = digits.padStart(3, '0');
  const integers = padded.slice(0, -2).replace(/^0+(?=\d)/, '') || '0';
  return `${integers},${padded.slice(-2)}`;
}

export function priceText(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '';
  const [integers, fraction = ''] = value.toFixed(4).split('.');
  return maskPrice(`${integers}${fraction}`);
}

export function percentText(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '';
  return maskPercent(String(Math.round(value * 100)));
}

export function parseMasked(value: string) {
  const text = value.replace(/\./g, '').replace(',', '.').trim();
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

export function parseStored(value: string | null | undefined) {
  const text = (value ?? '').trim();
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

export function stockQuantity(line: PricingLine) {
  return round4(line.commercialQty * line.factor);
}

export function entryUnitCost(context: PricingContext, line: PricingLine) {
  const source = context.docLines.get(line.lineNumber);
  const stockQty = stockQuantity(line);
  if (!source || !(stockQty > 0)) return null;
  return lineUnitCost(
    {
      lineAmountCents: source.lineAmount,
      freightCents: source.freightAmount,
      insuranceCents: source.insuranceAmount,
      otherCents: source.otherAmount,
      discountCents: source.discountAmount,
      ipiCents: source.ipiAmount,
      stCents: source.stAmount,
      icmsCents: source.icmsAmount,
      stockQty,
    },
    context.flags,
  );
}

export function projectedAverageForItem(
  context: PricingContext,
  itemId: string,
  lines: PricingLine[],
  info: PricingItemInfo,
) {
  const incoming: { quantity: number; unitCost: number }[] = [];
  for (const line of lines) {
    if (line.itemId !== itemId) continue;
    const unitCost = entryUnitCost(context, line);
    if (unitCost === null) return null;
    incoming.push({ quantity: stockQuantity(line), unitCost });
  }
  return projectedAverage(info.quantity, info.averageCost, incoming);
}

export function recomputePricing(
  context: PricingContext,
  itemIds: (string | null | undefined)[],
  lines: PricingLine[],
  overrides: PricingOverrides,
  fields: Record<string, PricingFields>,
  infos: Record<string, PricingItemInfo>,
) {
  const nextFields = { ...fields };
  const nextOverrides = { ...overrides };
  for (const itemId of new Set(itemIds)) {
    if (!itemId) continue;
    const info = infos[itemId];
    if (!info) continue;
    const average = projectedAverageForItem(context, itemId, lines, info) ?? 0;
    const previous = fields[itemId];
    const edited: PricingEdited = previous?.edited ?? 'none';
    const marginValue =
      edited === 'none'
        ? parseStored(itemId in overrides ? overrides[itemId] : info.grossMargin)
        : parseMasked(previous?.margin ?? '');
    const priceValue = edited === 'price' ? parseMasked(previous?.price ?? '') : null;
    const synced = syncPricing({
      average,
      marginPercent: marginValue,
      price: priceValue,
      edited,
      emptyPriceWithoutCost: true,
    });
    let error = '';
    if (
      edited === 'price' &&
      priceValue !== null &&
      average > 0 &&
      synced.marginPercent === null
    ) {
      error = pricingPriceMessage;
    }
    if (edited === 'margin' && marginValue !== null && marginValue >= 100) {
      error = pricingMarginMessage;
    }
    nextFields[itemId] = {
      edited,
      error,
      margin:
        edited === 'margin' || (edited === 'price' && error)
          ? (previous?.margin ?? '')
          : percentText(synced.marginPercent),
      price: edited === 'price' ? (previous?.price ?? '') : priceText(synced.price),
    };
    if (edited === 'margin') {
      if (marginValue === null) nextOverrides[itemId] = null;
      else if (!error) nextOverrides[itemId] = marginValue.toFixed(4);
    }
    if (edited === 'price') {
      if (priceValue === null) nextOverrides[itemId] = null;
      else if (!error && average > 0 && synced.marginPercent !== null) {
        nextOverrides[itemId] = synced.marginPercent.toFixed(4);
      }
    }
  }
  return { fields: nextFields, overrides: nextOverrides };
}

export function editPricingMargin(
  context: PricingContext,
  itemId: string,
  typed: string,
  lines: PricingLine[],
  overrides: PricingOverrides,
  fields: Record<string, PricingFields>,
  infos: Record<string, PricingItemInfo>,
) {
  const previous = fields[itemId];
  const nextFields: Record<string, PricingFields> = {
    ...fields,
    [itemId]: {
      margin: maskPercent(typed),
      price: previous?.price ?? '',
      edited: 'margin',
      error: '',
    },
  };
  return recomputePricing(context, [itemId], lines, overrides, nextFields, infos);
}

export function editPricingPrice(
  context: PricingContext,
  itemId: string,
  typed: string,
  lines: PricingLine[],
  overrides: PricingOverrides,
  fields: Record<string, PricingFields>,
  infos: Record<string, PricingItemInfo>,
) {
  const previous = fields[itemId];
  const nextFields: Record<string, PricingFields> = {
    ...fields,
    [itemId]: {
      margin: previous?.margin ?? '',
      price: maskPrice(typed),
      edited: 'price',
      error: '',
    },
  };
  return recomputePricing(context, [itemId], lines, overrides, nextFields, infos);
}
