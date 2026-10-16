import { authStorage } from '../utils/auth';

const configuredUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, '');

export const API_URL = configuredUrl || 'http://localhost:3000';

type UnauthorizedHandler = () => void;

let onUnauthorized: UnauthorizedHandler | null = null;
let expiring = false;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  onUnauthorized = handler;
}

export function markSessionActive() {
  expiring = false;
}

function expireSession() {
  if (expiring) return;
  expiring = true;
  authStorage.removeToken();
  onUnauthorized?.();
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const token = authStorage.getToken();
  const hasBody = options.body != null;

  const headers = {
    ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (response.status === 401 && token) {
    expireSession();
  }
  return response;
}
