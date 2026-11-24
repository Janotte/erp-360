import { formatServiceOrderNumber } from './rules.ts';

export function serviceOrderBillingDescription(numberLabel: string, lineNumber: number) {
  return `Ordem ${numberLabel} · parcela ${lineNumber}`;
}

export function serviceOrderBillingDocumentNumber(number: number, lineNumber: number) {
  const digits = formatServiceOrderNumber(number).replace(/\./g, '');
  return `${digits}-${String(lineNumber).padStart(2, '0')}`;
}

/** Número comercial que o cliente vê: 000.001. */
export function formatBillingDocumentNumber(value: number): string {
  const digits = String(Math.trunc(value));
  const padded = digits.length < 6 ? digits.padStart(6, '0') : digits;
  return padded.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
