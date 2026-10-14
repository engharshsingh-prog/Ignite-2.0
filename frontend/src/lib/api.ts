const configuredApiUrl = String(import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '');

/** Prefix API requests when the frontend and backend are deployed on separate origins. */
export function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  if (typeof input === 'string' && input.startsWith('/api/')) {
    input = `${configuredApiUrl}${input}`;
  }
  return fetch(input, { ...init, credentials: init.credentials ?? 'include' });
}

export function apiAssetUrl(url: string): string {
  if (url.startsWith('/uploads/')) return `${configuredApiUrl}${url}`;
  return url;
}
