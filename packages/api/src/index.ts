// @hs/api — the client half of talking to the one backend (PLATFORM.md M2).
// Extracted from five near-copies; holoscopic-game's mint-deduping token
// cache is the canonical one and now serves every app.

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// ── Game token (proves identity to the backend) ──────────────────────────────
// Short-lived JWT minted by /api/auth/game-token from the NextAuth session.
// Cached until shortly before its 15-minute expiry. `tokenPromise` dedupes
// concurrent mints: a page that fires five authed requests on mount mints
// once, not five times.

let gameToken: { token: string; expiresAt: number } | null = null;
let tokenPromise: Promise<string | null> | null = null;

/**
 * The caller's identity token, or null when signed out. Exported because the
 * Socket.IO handshake needs it too — the server derives the personal room
 * from the verified token rather than from a client-supplied userId.
 * Browser-only: on the server it resolves null (the mint route is same-origin).
 */
export async function getGameToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  if (gameToken && gameToken.expiresAt - Date.now() > 60_000) return gameToken.token;
  if (!tokenPromise) {
    tokenPromise = fetch('/api/auth/game-token')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (d?.token) { gameToken = d; return d.token as string; }
        gameToken = null;
        return null;
      })
      .catch(() => null)
      .finally(() => { tokenPromise = null; });
  }
  return tokenPromise;
}

/** Drop the cached token (call on sign-out / account switch). */
export function clearGameToken() {
  gameToken = null;
}

// ── Socket.IO handshake ──────────────────────────────────────────────────────

/**
 * The `auth` option for an authed Socket.IO connection. A function, not a
 * value, so socket.io re-runs it on every reconnect — an expired 15-minute
 * token is re-minted rather than the socket silently reconnecting anonymous.
 *
 *   io(SOCKET_URL, { transports: ['websocket'], auth: socketAuth })
 */
export function socketAuth(cb: (data: { token: string | null }) => void): void {
  getGameToken().then(token => cb({ token }));
}

// ── apiFetch ─────────────────────────────────────────────────────────────────

export interface ApiFetchOptions {
  method?: string;
  body?: unknown;
  userId?: string | null;
  /** Override the instance for this call (a joined community / room). */
  instanceId?: string;
  /** Pre-minted token, for a call that cannot reach /api/auth/game-token. */
  token?: string | null;
}

/**
 * The one HTTP path to the backend, bound to an app's base URL and parent
 * instance. Identity-bearing calls attach the game token beside x-user-id;
 * the backend's enforceVerifiedUser checks that the token's sub matches the
 * claimed identity, so the header alone proves nothing.
 */
export function createApiFetch(config: { apiBase: string; instanceId: string }) {
  return async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-instance-id': options.instanceId || config.instanceId,
    };
    if (options.userId) {
      headers['x-user-id'] = options.userId;
      const token = options.token ?? (await getGameToken());
      if (token) headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${config.apiBase}${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      cache: 'no-store',
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new ApiError(res.status, (json as { error?: string }).error || 'Something went wrong');
    }
    return json as T;
  };
}
