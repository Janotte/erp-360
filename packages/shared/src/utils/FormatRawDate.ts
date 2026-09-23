/**
 * Transforma uma string de data pura (YYYY-MM-DD) no formato brasileiro (DD/MM/AAAA).
 * Evita problemas de fuso horário pois faz manipulação direta de strings.
 * @example formatRawDate("2026-10-25") => "25/10/2026"
 */
export function formatRawDate(dataString: string | null | undefined): string {
  if (!dataString) return '-';

  // Corta apenas a parte da data caso venha algum resquício de ISO completa (timestamp)
  const dateOnly = dataString.split('T')[0];
  const parts = dateOnly.split('-');

  if (parts.length !== 3) return dataString;

  const [year, month, day] = parts;
  return `${day}/${month}/${year}`;
}
