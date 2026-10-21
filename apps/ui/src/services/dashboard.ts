import {
  apiErrorMessage,
  type DashboardSummary,
  dashboardSchema,
} from '@erp-360/shared';

import { apiFetch } from './apiClient';

async function readBody(res: Response) {
  return res.json().catch(() => ({}));
}

export const dashboardService = {
  summary: async (): Promise<DashboardSummary> => {
    const res = await apiFetch('/dashboard');
    const body = await readBody(res);
    if (!res.ok) {
      throw new Error(apiErrorMessage(body, 'Falha ao carregar o dashboard.'));
    }
    const parsed = dashboardSchema.safeParse(body);
    if (!parsed.success) throw new Error('Resposta do dashboard inválida.');
    return parsed.data;
  },
};
