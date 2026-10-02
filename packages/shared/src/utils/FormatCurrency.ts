const brlInputFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Transforma um valor inteiro em centavos para uma string formatada em Real (R\$).
 * @example formatCurrency(1050) => "R\$ 10,50"
 * @example formatCurrency(100050) => "R\$ 1.000,50"
 */
export function formatCurrency(valueInCents: number | null | undefined): string {
  if (valueInCents === null || valueInCents === undefined) {
    return 'R\$ 0,00';
  }

  const valueInReais = valueInCents / 100;

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(valueInReais);
}

/** @example formatCurrencyInput(100050) => "1.000,50" */
export function formatCurrencyInput(valueInCents: number | null | undefined): string {
  if (valueInCents == null || Number.isNaN(valueInCents)) return '';
  return brlInputFormatter.format(valueInCents / 100);
}

/** @example parseCurrencyToCents("1.000,50") => 100050 */
export function parseCurrencyToCents(value: string): number {
  const digits = value.replace(/\D/g, '');
  if (!digits) return 0;
  return Number.parseInt(digits, 10);
}

export function maskCurrencyInput(value: string): string {
  if (!value.replace(/\D/g, '')) return '';
  return formatCurrencyInput(parseCurrencyToCents(value));
}
