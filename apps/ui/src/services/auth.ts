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
    throw new Error(erro.message || 'Falha ao autenticar. Verifique suas credenciais.');
  }

  return response.json();
};

export interface RegisterResponse {
  sucesso: boolean;
  usuarioId: string;
  tenantId: string;
}

export const enviarRegistroAPI = async (dados: {
  nomeEmpresa: string;
  nomeUsuario: string;
  email: string;
  senha: string;
}): Promise<RegisterResponse> => {
  const response = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  });

  if (!response.ok) {
    const erro = await response.json().catch(() => ({}));
    throw new Error(erro.message || 'Falha ao registrar. Tente novamente.');
  }

  return response.json();
};
