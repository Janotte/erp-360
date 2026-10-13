import { authStorage } from '../utils/auth';

const configuredUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, '');

export const API_URL = configuredUrl || 'http://localhost:3000';

export async function apiFetch(path: string, options: RequestInit = {}) {
  const token = authStorage.getToken();
  const hasBody = options.body != null;

  const headers = {
    ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  return fetch(`${API_URL}${path}`, { ...options, headers });
}
