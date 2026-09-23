import { API_URL } from '@erp-360/shared';

export interface LoginResponse {
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
    tenantId: string;
  };
}

export interface RegisterInput {
  companyName: string;
  cnpj: string;
  name: string;
  email: string;
  password: string;
}

export const sendLoginAPI = async (data: {
  email: string;
  password: string;
}): Promise<LoginResponse> => {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const erro = await response.json().catch(() => ({}));
    throw new Error(erro.message || 'Falha ao autenticar.');
  }

  return response.json();
};

export const sendRegisterAPI = async (
  data: RegisterInput,
): Promise<{ success: boolean }> => {
  const response = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const erro = await response.json().catch(() => ({}));
    throw new Error(erro.message || 'Falha ao registrar empresa.');
  }

  return response.json();
};
