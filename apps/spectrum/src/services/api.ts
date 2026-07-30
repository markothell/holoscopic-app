// All HTTP goes through here. Identity-bearing mutations attach a
// short-lived game token minted from the NextAuth session by
// /api/auth/game-token; the backend's enforceVerifiedUser checks that the
// token's sub matches the claimed x-user-id.
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001/api';

// The PARENT instance for On a Spectrum — used for auth, create, and join.
// In-game requests (map entries/votes) override with the room's own
// instance id so their content scopes to the room.
export const PARENT_INSTANCE_ID = process.env.NEXT_PUBLIC_INSTANCE_ID || 'spectrum';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Game-token cache: tokens live 15 minutes; refresh with a minute to spare.
let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Exported for the Socket.IO handshake: the server now derives the personal
 * room (`user:<id>`) from the verified token instead of trusting the userId
 * the client emits, so an unauthenticated socket receives no holon push.
 */
export async function getGameToken(): Promise<string | null> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }
  try {
    const res = await fetch('/api/auth/game-token');
    if (!res.ok) return null;
    cachedToken = await res.json();
    return cachedToken?.token ?? null;
  } catch {
    return null;
  }
}

export function clearGameToken() {
  cachedToken = null;
}

export async function apiFetch<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    userId?: string | null;
    instanceId?: string;
  } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-instance-id': options.instanceId || PARENT_INSTANCE_ID,
  };
  if (options.userId) {
    headers['x-user-id'] = options.userId;
    const token = await getGameToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
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
