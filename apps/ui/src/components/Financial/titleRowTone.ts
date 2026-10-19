import { civilDate } from '@erp-360/shared';

/** Cor do texto da linha em contas a pagar e a receber. */
export function titleRowTextClass(
  status: string,
  dueOn: string,
  today = civilDate(),
): string {
  if (status === 'pago' || status === 'recebido') return 'text-emerald-600';
  if (status === 'cancelado') return 'text-zinc-900';

  const due = dueOn.slice(0, 10);
  if (due < today) return 'text-red-600';
  if (due === today) return 'text-blue-600';
  return 'text-zinc-900';
}
