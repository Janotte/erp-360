import { civilDate } from '@erp-360/shared';

import { type StatusTone } from '@/components/ui/statusTone';

const paidTone: StatusTone = {
  background: '#ECFDF5',
  hover: '#D1FAE5',
  border: '#059669',
  text: '#047857',
};

const overdueTone: StatusTone = {
  background: '#FEF2F2',
  hover: '#FEE2E2',
  border: '#DC2626',
  text: '#B91C1C',
};

const dueTodayTone: StatusTone = {
  background: '#EFF6FF',
  hover: '#DBEAFE',
  border: '#2563EB',
  text: '#1D4ED8',
};

const openTone: StatusTone = {
  background: '#FFFFFF',
  hover: '#F8FAFC',
  border: '#94A3B8',
  text: '#172337',
};

const cancelledTone: StatusTone = {
  background: '#F8FAFC',
  hover: '#F1F5F9',
  border: '#64748B',
  text: '#475569',
};

/** Cor da linha em contas a pagar e a receber. O texto segue a mesma situação. */
export function titleRowTone(
  status: string,
  dueOn: string,
  today = civilDate(),
): StatusTone {
  if (status === 'pago' || status === 'recebido') return paidTone;
  if (status === 'cancelado') return cancelledTone;

  const due = dueOn.slice(0, 10);
  if (due < today) return overdueTone;
  if (due === today) return dueTodayTone;
  return openTone;
}

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
