import {
  apiErrorMessage,
  type CertificateConnection,
  certificateConnectionSchema,
  type CertificateConnectionTarget,
  type CertificateEnvironment,
  type CertificateInspection,
  certificateInspectionSchema,
  tenantCertificateListSchema,
  tenantCertificateSchema,
  type TenantCertificateView,
} from '@erp-360/shared';

import { apiFetch } from './apiClient';

async function readBody(res: Response) {
  return res.json().catch(() => ({}));
}

export interface CertificateInput {
  environment: CertificateEnvironment;
  label?: string | null;
  pfxBase64: string;
  password: string;
}

export const certificateService = {
  list: async (): Promise<TenantCertificateView[]> => {
    const res = await apiFetch('/certificates');
    const body = await readBody(res);
    if (!res.ok) throw new Error(apiErrorMessage(body, 'Falha ao listar certificados.'));
    const parsed = tenantCertificateListSchema.safeParse(body);
    if (!parsed.success) throw new Error('Resposta de certificados inválida.');
    return parsed.data;
  },
  inspect: async (
    dados: Pick<CertificateInput, 'pfxBase64' | 'password'>,
  ): Promise<CertificateInspection> => {
    const res = await apiFetch('/certificates/inspect', {
      method: 'POST',
      body: JSON.stringify(dados),
    });
    const body = await readBody(res);
    if (!res.ok) throw new Error(apiErrorMessage(body, 'Falha ao testar o certificado.'));
    const parsed = certificateInspectionSchema.safeParse(body);
    if (!parsed.success) throw new Error('Resposta do teste inválida.');
    return parsed.data;
  },
  import: async (dados: CertificateInput): Promise<TenantCertificateView> => {
    const res = await apiFetch('/certificates', {
      method: 'POST',
      body: JSON.stringify(dados),
    });
    const body = await readBody(res);
    if (!res.ok)
      throw new Error(apiErrorMessage(body, 'Falha ao importar o certificado.'));
    const parsed = tenantCertificateSchema.safeParse(body);
    if (!parsed.success) throw new Error('Resposta da importação inválida.');
    return parsed.data;
  },
  remove: async (id: string): Promise<void> => {
    const res = await apiFetch(`/certificates/${id}`, { method: 'DELETE' });
    if (res.status === 204) return;
    const body = await readBody(res);
    throw new Error(apiErrorMessage(body, 'Falha ao excluir o certificado.'));
  },
  testConnection: async (
    id: string,
    target: CertificateConnectionTarget,
  ): Promise<CertificateConnection> => {
    const res = await apiFetch(`/certificates/${id}/connection`, {
      method: 'POST',
      body: JSON.stringify({ target }),
    });
    const body = await readBody(res);
    if (!res.ok) throw new Error(apiErrorMessage(body, 'Falha ao testar a conexão.'));
    const parsed = certificateConnectionSchema.safeParse(body);
    if (!parsed.success) throw new Error('Resposta do teste de conexão inválida.');
    return parsed.data;
  },
};
