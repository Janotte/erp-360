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
