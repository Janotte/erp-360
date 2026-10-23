import { civilDate } from '@erp-360/shared';

type StoredTitleStatus = 'pendente' | 'pago' | 'recebido' | 'cancelado';

/**
 * Atrasado não é status gravado. É um título ainda pendente
 * cujo vencimento é anterior à data civil de hoje.
 */
export function titleListStatus<T extends StoredTitleStatus>(
  status: T | 'atrasado' | undefined,
  today = civilDate(),
): { status: T; dueBefore?: string } | undefined {
  if (status === undefined) return undefined;
  if (status === 'atrasado') {
    return { status: 'pendente' as T, dueBefore: today };
  }
  return { status };
}
