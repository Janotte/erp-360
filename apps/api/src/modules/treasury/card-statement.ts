export interface CardChargeInput {
  id: string;
  issueOn: string;
  dueOn: string;
  description: string;
  supplierName: string | null;
  documentNumber: string | null;
  documentSeries: string | null;
  installmentNumber: string | null;
  documentId: string | null;
  amount: number;
  status: 'pendente' | 'pago' | 'cancelado';
}

export interface CardStatementLine {
  id: string;
  occurredOn: string;
  dueOn: string;
  description: string;
  documentId: string | null;
  amount: number;
  status: 'pendente' | 'pago' | 'cancelado';
  balance: number;
}

function plainNumber(value: string) {
  const trimmed = value.trim();
  return trimmed.replace(/^0+(?=\d)/, '') || trimmed;
}

export function describeCardCharge(charge: CardChargeInput) {
  const number = charge.documentNumber ? plainNumber(charge.documentNumber) : '';
  const series = charge.documentSeries ? plainNumber(charge.documentSeries) : '';
  if (!charge.supplierName || !number || !series) return charge.description;
  const parcel = charge.installmentNumber
    ? ` · parcela ${plainNumber(charge.installmentNumber)}`
    : '';
  return `NF ${number}/${series} · ${charge.supplierName}${parcel}`;
}

function compareCharges(left: CardChargeInput, right: CardChargeInput) {
  if (left.issueOn !== right.issueOn) return left.issueOn < right.issueOn ? -1 : 1;
  if (left.dueOn !== right.dueOn) return left.dueOn < right.dueOn ? -1 : 1;
  if (left.id !== right.id) return left.id < right.id ? -1 : 1;
  return 0;
}

/** Saldo em aberto depois de cada compra. Pago e cancelado aparecem, mas não aumentam o saldo. */
export function cardStatement(charges: CardChargeInput[]) {
  let balance = 0;
  const lines = [...charges].sort(compareCharges).map((charge) => {
    if (charge.status === 'pendente') balance += charge.amount;
    return {
      id: charge.id,
      occurredOn: charge.issueOn,
      dueOn: charge.dueOn,
      description: describeCardCharge(charge),
      documentId: charge.documentId,
      amount: charge.amount,
      status: charge.status,
      balance,
    };
  });
  return { openBalance: balance, entries: lines.reverse() };
}
