import type { PlayerIdentity } from '@/lib/types';

// All HTTP goes through here. Mutations attach the guest JWT minted at
// join/create time; the backend's enforceVerifiedUser checks that the
// token's sub matches the claimed x-user-id.
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001/api';

// Spectrum is one game (instance) on the shared Holoscopic backend. Declaring
// it on every request keeps its entries cleanly scoped away from other games
// (interView etc.) in the shared collections.
const INSTANCE_ID = process.env.NEXT_PUBLIC_INSTANCE_ID || 'spectrum';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: PlayerIdentity | null } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-instance-id': INSTANCE_ID,
  };
  if (options.auth) {
    headers['x-user-id'] = options.auth.playerId;
    if (options.auth.token) headers['Authorization'] = `Bearer ${options.auth.token}`;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, (json as { error?: string }).error || `Request failed (${res.status})`);
  }
  return json as T;
}
