export interface StatementOrderEntry {
  id: string;
  occurredOn: string;
  openingBalance: boolean;
  createdAt: Date | string;
  description: string;
}

function timestamp(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

/** Ordem em que o saldo corrido é calculado: o último item fica com o saldo atual. */
export function compareStatementChronological(
  a: StatementOrderEntry,
  b: StatementOrderEntry,
): number {
  if (a.occurredOn !== b.occurredOn) return a.occurredOn < b.occurredOn ? -1 : 1;
  if (a.openingBalance !== b.openingBalance) return a.openingBalance ? -1 : 1;
  const byTime = timestamp(a.createdAt) - timestamp(b.createdAt);
  if (byTime !== 0) return byTime;
  if (a.description !== b.description) return a.description < b.description ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

/** Extrato: saldo atual na primeira linha. Inverso da ordem do saldo corrido. */
export function compareStatementNewestFirst(
  a: StatementOrderEntry,
  b: StatementOrderEntry,
): number {
  return compareStatementChronological(b, a);
}
