const businessTimeZone = 'America/Sao_Paulo';

export function civilDate(date = new Date(), timeZone = businessTimeZone): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day) {
    throw new Error('Não foi possível calcular a data civil.');
  }
  return `${year}-${month}-${day}`;
}
