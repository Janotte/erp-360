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

export interface RegistrarInput {
  nomeEmpresa: string;
  nomeUsuario: string;
  email: string;
  senha: string;
}

export const enviarLoginAPI = async (dados: {
  email: string;
  password: string;
}): Promise<LoginResponse> => {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  });

  if (!response.ok) {
    const erro = await response.json().catch(() => ({}));
    throw new Error(erro.message || 'Falha ao autenticar.');
  }

  return response.json();
};

export const enviarRegistrarAPI = async (
  dados: RegistrarInput,
): Promise<{ sucesso: boolean }> => {
  const response = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  });

  if (!response.ok) {
    const erro = await response.json().catch(() => ({}));
    throw new Error(erro.message || 'Falha ao registrar empresa.');
  }

  return response.json();
};
