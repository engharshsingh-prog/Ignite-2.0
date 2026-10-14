import { apiFetch } from './api';
import { readJsonSafe } from './http';

const ADMIN_AUTH_EVENT = 'ignite26-admin-auth-changed';

export interface AdminUser {
  id: number;
  email: string;
  role: 'super_admin' | 'admin';
}

export const getToken = () => localStorage.getItem('ignite26_admin_token');

function notifyAuthChanged() {
  window.dispatchEvent(new Event(ADMIN_AUTH_EVENT));
}

export const setToken = (token: string) => {
  localStorage.setItem('ignite26_admin_token', token);
  notifyAuthChanged();
};

export const removeToken = () => {
  localStorage.removeItem('ignite26_admin_token');
  notifyAuthChanged();
};

export const authHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${getToken() || ''}`,
});

export const subscribeToAdminAuth = (callback: () => void) => {
  window.addEventListener(ADMIN_AUTH_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(ADMIN_AUTH_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
};

export async function checkAdminAuth(): Promise<AdminUser | null> {
  const token = getToken();
  if (!token) return null;
  try {
    const res = await apiFetch('/api/auth/me', { headers: authHeaders() });
    if (!res.ok) {
      removeToken();
      return null;
    }
    const payload = await readJsonSafe<{ user?: AdminUser }>(res);
    return payload?.user ?? null;
  } catch {
    return null;
  }
}
