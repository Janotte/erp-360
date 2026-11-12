export function round4(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

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

export function projectedAverage(
  currentQty: number,
  currentAverage: number,
  incoming: { quantity: number; unitCost: number }[],
) {
  let quantity = currentQty;
  let average = currentAverage;
  for (const line of incoming) {
    average = nextAverage(quantity, average, line.quantity, line.unitCost);
    quantity = round4(quantity + line.quantity);
  }
  return average;
}

export function listPriceFromMargin(average: number, marginPercent: number) {
  if (!(average > 0) || !(marginPercent >= 0) || marginPercent >= 100) return null;
  return round4(average / (1 - marginPercent / 100));
}

export function marginFromListPrice(average: number, price: number) {
  if (!(average > 0) || !(price >= average)) return null;
  return round4((1 - average / price) * 100);
}

export function syncPricing(input: {
  average: number;
  marginPercent: number | null;
  price: number | null;
  edited: 'margin' | 'price' | 'none';
  emptyPriceWithoutCost: boolean;
}) {
  if (!(input.average > 0)) {
    if (!input.emptyPriceWithoutCost) {
      return { marginPercent: input.marginPercent, price: input.price };
    }
    if (input.edited === 'price') {
      return { marginPercent: input.marginPercent, price: input.price };
    }
    return { marginPercent: input.marginPercent, price: null };
  }
  if (input.edited === 'price') {
    if (input.price == null) return { marginPercent: null, price: null };
    return {
      marginPercent: marginFromListPrice(input.average, input.price),
      price: input.price,
    };
  }
  if (input.marginPercent == null) return { marginPercent: null, price: null };
  return {
    marginPercent: input.marginPercent,
    price: listPriceFromMargin(input.average, input.marginPercent),
  };
}
