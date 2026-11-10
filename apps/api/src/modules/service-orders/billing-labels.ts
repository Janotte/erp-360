import { formatServiceOrderNumber } from './rules.ts';

export function serviceOrderBillingDescription(numberLabel: string, lineNumber: number) {
  return `Ordem ${numberLabel} · parcela ${lineNumber}`;
}

export function serviceOrderBillingDocumentNumber(number: number, lineNumber: number) {
  const digits = formatServiceOrderNumber(number).replace(/\./g, '');
  return `${digits}-${String(lineNumber).padStart(2, '0')}`;
}
