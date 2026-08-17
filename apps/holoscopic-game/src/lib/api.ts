import { getGameToken } from '@hs/api';
import { instanceSlugFromPath } from './instanceSlug';

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

// The active tenant is a pure function of the current URL — derived here, at
// call time, with no stored state. Whatever game the URL is on, requests carry
// that slug as x-instance-id (the backend resolves slug→instance). Navigating
// between games can never leave requests pointed at a stale tenant, because
// there is nothing to leave stale.
export function getCurrentInstanceId(): string | null {
  if (typeof window === 'undefined') return null;
  return instanceSlugFromPath(window.location.pathname);
}

// ── Game token (proves identity to the backend) ──────────────────────────────
// Short-lived JWT issued by /api/auth/game-token from the NextAuth session.
// The backend rejects identity-bearing writes without it, so bare x-user-id
// headers can't be spoofed. The cache lives in @hs/api now (M2) — this app's
// mint-deduping implementation was the canonical one it extracted.
export { getGameToken, clearGameToken } from '@hs/api';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Drop-in fetch replacement that attaches the identity token on writes.
 * For services that build their own requests instead of using apiFetch.
 */
export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const extraHeaders: Record<string, string> = {};
  const instanceId = getCurrentInstanceId();
  if (instanceId) extraHeaders['x-instance-id'] = instanceId;
  // Attached on reads too, not only writes. Some GET routes now require a
  // signed-in caller (the /analytics ones were anonymous and platform-wide),
  // and a bearer on a read is harmless. Signed-out callers get null and the
  // header is simply omitted.
  const token = await getGameToken();
  if (token) extraHeaders['Authorization'] = `Bearer ${token}`;
  if (Object.keys(extraHeaders).length) {
    init = { ...init, headers: { ...(init.headers as Record<string, string>), ...extraHeaders } };
  }
  return fetch(input, init);
}

export async function apiFetch(
  path: string,
  options: RequestInit & { userId?: string } = {}
) {
  const { userId, ...rest } = options;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(rest.headers as Record<string, string>),
  };
  if (userId) headers['x-user-id'] = userId;
  // Instance derived from the URL fills in unless the caller set one explicitly
  const instanceId = getCurrentInstanceId();
  if (instanceId && !headers['x-instance-id']) headers['x-instance-id'] = instanceId;

  // Attach the identity proof on writes and on any explicit-identity request.
  // (Some routes carry userId in the body rather than the header, so writes
  // always try; signed-out callers just get null and proceed.)
  const method = (rest.method || 'GET').toUpperCase();
  if (userId || MUTATING.has(method)) {
    const token = await getGameToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, { ...rest, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || err.error || res.statusText);
  }
  return res.json();
}
