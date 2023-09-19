import { clearToken, getToken } from '../lib/session';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  json?: unknown;
  body?: BodyInit;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { json, headers: initHeaders, ...init } = options;
  const headers = new Headers(initHeaders);
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  let body = init.body;
  if (json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(json);
  }

  const res = await fetch(`/api${path}`, { ...init, headers, body });
  if (res.status === 401 && token) {
    clearToken();
    window.location.assign('/login');
  }
  const data = res.status === 204 ? undefined : await res.json().catch(() => undefined);
  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`, data?.code);
  }
  return data as T;
}
