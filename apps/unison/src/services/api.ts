// All HTTP goes through here. Identity-bearing mutations attach a
// short-lived game token minted from the NextAuth session by
// /api/auth/game-token; the backend's enforceVerifiedUser checks that the
// token's sub matches the claimed x-user-id. Same pattern as apps/spectrum.
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001/api';

// The PARENT instance for Unison — used for auth and community create/join.
// A joined community is its own child Instance (see PLAN §8); in-community
// requests override with the community's own instance id.
export const PARENT_INSTANCE_ID = process.env.NEXT_PUBLIC_INSTANCE_ID || 'unison';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Game-token cache: tokens live 15 minutes; refresh with a minute to spare.
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getGameToken(): Promise<string | null> {
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

async function buildHeaders(options: { userId?: string | null; instanceId?: string }): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-instance-id': options.instanceId || PARENT_INSTANCE_ID,
  };
  if (options.userId) {
    headers['x-user-id'] = options.userId;
    const token = await getGameToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
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
  const headers = await buildHeaders(options);
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

// A `text/event-stream` POST (community synthesis, SYNTHESIS.md §9) —
// EventSource can't POST, so the caller reads `res.body` itself and parses
// `event:`/`data:` frames (see SynthesisOverlay). Throws ApiError on a
// non-2xx status BEFORE any stream reading starts (e.g. 503 `{ error: 'LLM
// not configured' }`), same failure shape as apiFetch, so callers can share
// one catch path for "not set up yet" vs. a mid-stream `event: error`.
export async function apiStream(
  path: string,
  options: {
    body?: unknown;
    userId?: string | null;
    instanceId?: string;
    signal?: AbortSignal;
  } = {},
): Promise<Response> {
  const headers = await buildHeaders(options);
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (json as { error?: string }).error || `Request failed (${res.status})`);
  }
  return res;
}
