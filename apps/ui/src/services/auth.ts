import { type RegisterResponse, RegisterResponseSchema } from '@erp-360/shared';

import { apiFetch } from './apiClient';

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
  const response = await apiFetch(`/auth/login`, {
    method: 'POST',
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const erro = await response.json().catch(() => ({}));
    throw new Error(erro.message || 'Falha ao autenticar.');
  }

  return response.json();
};

export const sendRegisterAPI = async (data: RegisterInput): Promise<RegisterResponse> => {
  const response = await apiFetch(`/auth/register`, {
    method: 'POST',
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const erro = await response.json().catch(() => ({}));
    throw new Error(erro.message || 'Falha ao registrar empresa.');
  }

  const parsed = RegisterResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error('Resposta de cadastro inválida.');
  }

  return parsed.data;
};
