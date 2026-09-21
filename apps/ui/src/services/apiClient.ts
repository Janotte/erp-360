import { authStorage } from '../utils/auth';

export async function apiFetch(endpoint: string, options: RequestInit = {}) {
  const token = authStorage.getToken();

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(endpoint, { ...options, headers });
  return response;
}
