// All HTTP goes through here. Identity-bearing requests attach a short-lived
// game token minted from the NextAuth session by /api/auth/game-token; the
// backend's enforceVerifiedUser checks that the token's sub matches the claimed
// x-user-id, so the header alone proves nothing.
//
// Same account machinery as the rest of the platform — one global User
// collection behind one backend, and these are Holoscopic accounts, said
// plainly (PLATFORM.md P18). Every existing account signs straight in.
//
// The generic circle operations (snapshot, my circles, join) ride
// /api/circles — the M8 promotion, triggered by this app being the Circle
// layer's second consumer. The ACTIVITY verbs (telling, sorting, the reveal)
// stay on /api/threshold: they are Threshold's, and each future activity
// brings its own.

import type { Circle, MyRanking, Placement, Pole, Seed, SeedResult, Share, SynthesisSession } from '@/lib/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001/api';

// The parent instance holding every circle. resolveInstance never fails — an
// unrecognised id falls through to the platform default — so the backend
// checks Instance.app itself; a wrong value here reads as "circle not found".
export const INSTANCE_ID = process.env.NEXT_PUBLIC_INSTANCE_ID || 'threshold';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Tokens live 15 minutes; refresh with a minute to spare.
let cachedToken: { token: string; expiresAt: number } | null = null;

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

interface FetchOptions {
  method?: string;
  body?: unknown;
  userId?: string | null;
}

export async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-instance-id': INSTANCE_ID,
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
    cache: 'no-store',
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, (json as { error?: string }).error || 'Something went wrong');
  }
  return json as T;
}

export const circlesApi = {
  /** Every circle I'm a member of. */
  myCircles(userId: string) {
    return apiFetch<{ circles: Circle[] }>('/circles/me', { userId });
  },

  /** The snapshot: the circle, my standing in it, and (for members) the
   *  participation rows the circle-home map draws from. */
  getCircle(urlName: string, userId?: string | null) {
    return apiFetch<{ circle: Circle }>(`/circles/${urlName}`, { userId });
  },

  /**
   * Take a seat. The invitation gate is server-side: when the circle requires
   * one, the email submitted here must be an address the invitation went to
   * (utils/circles.js#joinCircle). The email also lands on the member row as
   * where this circle's mail reaches you. Joining in week six is the ordinary
   * way in, not an edge case — nothing is withheld for having missed the
   * beginning.
   */
  join(circleId: string, userId: string, email?: string) {
    return apiFetch<{ circle: Circle }>(`/circles/${circleId}/join`, {
      method: 'POST', body: { email }, userId,
    });
  },

  /**
   * A whole telling turn in one write — one side or both. Two calls do not
   * work and cannot be made to: the server evaluates completion after a
   * write, and a member holding one story already reads as finished, so the
   * first call can end the round and the second is refused.
   */
  submitShares(
    seedId: string,
    stories: { pole: Pole; title?: string; text?: string; audio?: unknown }[],
    userId: string,
  ) {
    return apiFetch<{ share: Share; shares: Share[] }>(
      `/threshold/seeds/${seedId}/shares`,
      { method: 'POST', body: { stories }, userId },
    );
  },

  deleteShare(seedId: string, pole: Pole, userId: string) {
    return apiFetch<{ ok: true }>(`/threshold/seeds/${seedId}/shares/${pole}`, { method: 'DELETE', userId });
  },

  /** Save progress while sorting. Partial is expected and counts toward
   *  nothing — drafts never reach the aggregate. */
  saveRankingDraft(seedId: string, placements: Placement[], userId: string) {
    return apiFetch<{ ranking: MyRanking }>(`/threshold/seeds/${seedId}/ranking`, {
      method: 'PUT', body: { placements }, userId,
    });
  },

  /** The final submit. Complete or nothing — a partial ranking would make the
   *  agreement fraction depend on who bothered. */
  submitRanking(seedId: string, placements: Placement[], userId: string) {
    return apiFetch<{ ranking: MyRanking }>(`/threshold/seeds/${seedId}/ranking`, {
      method: 'POST', body: { placements }, userId,
    });
  },

  /** 404s until the topic has revealed. */
  seedResult(seedId: string, userId?: string | null) {
    return apiFetch<{ result: SeedResult; shares: Share[]; seed: Seed }>(
      `/threshold/seeds/${seedId}/result`, { userId },
    );
  },
};

/**
 * Make a Holoscopic account.
 *
 * Its own function rather than a `circlesApi` method, because `/api/auth`
 * predates the response-envelope convention and answers `{ success, error }`
 * where everything else answers `{ thing }` or `{ error }` — `apiFetch` reads
 * the latter, so a refusal here would arrive as a success with no user on it.
 *
 * Signup sends a verification email and does not wait for it: the guard
 * checks that a game token's subject matches the claimed user, never that an
 * address has been confirmed, so a new account can join a circle straight away.
 */
export async function signup(body: { email: string; password: string; name?: string }) {
  const res = await fetch(`${API_BASE}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-instance-id': INSTANCE_ID },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.success) {
    throw new ApiError(res.status, json?.error || 'That did not work');
  }
  return json as { success: true; user: { id: string; email: string; name?: string } };
}

/**
 * Upload a recording straight from the browser to Vercel Blob, and return the
 * URL to hand to the backend. The bytes reach Blob directly — neither this
 * Next server nor the backend ever sees them, which is what makes a long
 * recording on a bad connection feasible.
 *
 * The pathname keeps the `threshold/<seedId>/` namespace the circles have
 * always used, so a circle's recordings live in one place no matter which
 * front door told them, and a per-seed sweep or restore needs no reshuffle.
 *
 * `onProgress` is not decoration: a sixty-second note on a weak connection
 * takes long enough that a still button reads as a broken one.
 */
export async function uploadRecording(
  blob: Blob,
  { seedId, mimeType, onProgress }: {
    seedId: string; mimeType: string; onProgress?: (percent: number) => void;
  },
): Promise<{ url: string; pathname: string }> {
  const { upload } = await import('@vercel/blob/client');
  const { fileExtensionFor, baseMimeType } = await import('@hs/audio');

  const pathname = `threshold/${seedId}/${Date.now()}.${fileExtensionFor(mimeType)}`;

  const result = await upload(pathname, blob, {
    access: 'public',
    handleUploadUrl: '/api/audio/upload',
    // Parameters stripped: Blob's allowlist is an exact string match and the
    // codecs parameter is spelled differently per browser.
    contentType: baseMimeType(mimeType),
    multipart: true,
    onUploadProgress: onProgress ? (p) => onProgress(Math.round(p.percentage)) : undefined,
  });

  return { url: result.url, pathname: result.pathname };
}

// Where the synthesis surfaces live until they move into this app (P18's
// Tier-B port). A session appears in a member's ideas list there by itself —
// membership is mirrored from the circle, so the link needs no code.
export const SYNTHESIS_URL = process.env.NEXT_PUBLIC_SYNTHESIS_URL || 'http://localhost:4004';

/** The circle's synthesis sessions (synthesis D17) — the bridge rides the
 *  synthesis router, addressed by circle id; membership in the circle is the
 *  gate, checked there. */
export const synthesisApi = {
  sessions(circleId: string, userId: string) {
    return apiFetch<{ sessions: SynthesisSession[] }>(`/synthesis/circles/${circleId}/sessions`, { userId });
  },
  createSession(circleId: string, title: string, userId: string) {
    return apiFetch<{ session: SynthesisSession }>(`/synthesis/circles/${circleId}/sessions`, {
      method: 'POST', body: { title }, userId,
    });
  },
};
