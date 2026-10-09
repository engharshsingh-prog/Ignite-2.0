import { readJsonSafe } from './http';

const ADMIN_AUTH_EVENT = 'ignite26-admin-auth-changed';

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
  Authorization: `Bearer ${getToken()}`,
});

export const subscribeToAdminAuth = (callback: () => void) => {
  window.addEventListener(ADMIN_AUTH_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(ADMIN_AUTH_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
};

export async function checkAdminAuth(): Promise<{ id: number; email: string } | null> {
  const token = getToken();
  if (!token) return null;
  try {
    const res = await fetch('/api/auth/me', { headers: authHeaders() });
    if (!res.ok) { removeToken(); return null; }
    const payload = await readJsonSafe<{ user?: { id: number; email: string } }>(res);
    return payload?.user ?? null;
  } catch {
    return null;
  }
}
