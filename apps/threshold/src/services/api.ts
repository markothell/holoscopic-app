// All HTTP goes through here. Identity-bearing requests attach a short-lived
// game token minted from the NextAuth session by /api/auth/game-token; the
// backend's enforceVerifiedUser checks that the token's sub matches the claimed
// x-user-id, so the header alone proves nothing.
//
// EVERY route on /api/threshold sits behind that guard (D6) — unlike Chorus,
// there is no anonymous read path here. A call without a token is a 401, not a
// redacted answer.
//
// Safe to import from a Server Component: nothing touches `window` at module
// scope. getGameToken() does call a same-origin route, so it only works in the
// browser — server-side reads have to pass a token in explicitly.

import type { Circle, CircleResult, Placement, Pole, Share, MyRanking, SeedResult, Seed } from '@/lib/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001/api';

// The Threshold parent instance. resolveInstance never fails — an unrecognised
// id falls through to an interView edition — so routes/threshold.js checks
// Instance.app itself and 404s anything that is not a threshold instance. A
// wrong value here therefore reads as "circle not found", not as a CORS or auth
// error, which is worth knowing before you go looking in the wrong place.
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

export function clearGameToken() {
  cachedToken = null;
}

interface FetchOptions {
  method?: string;
  body?: unknown;
  userId?: string | null;
  /** Pre-minted token, for a call that cannot reach /api/auth/game-token. */
  token?: string | null;
}

export async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-instance-id': INSTANCE_ID,
  };
  if (options.userId) {
    headers['x-user-id'] = options.userId;
    const token = options.token ?? (await getGameToken());
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

// ── Circles ─────────────────────────────────────────────────────────────────

export const thresholdApi = {
  /**
   * The snapshot. One call answers "what is this circle, what phase is it in,
   * what can I see, and what have I done" — which is why every email links to
   * /t/<urlName> and lets the page route to the current task rather than to a
   * phase that may have advanced since the mail was sent.
   */
  getCircle(urlName: string, userId?: string | null) {
    return apiFetch<{ circle: Circle }>(`/threshold/circles/${urlName}`, { userId });
  },

  createCircle(
    body: {
      title: string;
      urlName: string;
      mode: 'single' | 'circle';
      email?: string;
      /** Required in single mode — a single Threshold IS a circle with one
       *  seed, authored by the creator (D1). There is no second code path. */
      seed?: { topic: string; poleA: string; poleB: string; secondsPerNote?: number };
      config?: {
        shareHours?: number | null;
        rankHours?: number | null;
        advanceOnComplete?: boolean;
      };
      invitedEmails?: string[];
      requireInvitation?: boolean;
    },
    userId: string,
  ) {
    return apiFetch<{ circle: Circle }>('/threshold/circles', { method: 'POST', body, userId });
  },

  join(circleId: string, userId: string, email?: string) {
    return apiFetch<{ circle: Circle }>(`/threshold/circles/${circleId}/join`, {
      method: 'POST', body: { email }, userId,
    });
  },

  start(circleId: string, userId: string) {
    return apiFetch<{ circle: Circle }>(`/threshold/circles/${circleId}/start`, { method: 'POST', userId });
  },

  /**
   * Manual phase advance — a first-class control, not a rescue hatch (D16).
   * The creator may do it for any phase; a seed's author may do it for the
   * phases of their own cycle. Permission is enforced in the funnel.
   */
  advance(circleId: string, userId: string) {
    return apiFetch<{ circle: Circle }>(`/threshold/circles/${circleId}/advance`, { method: 'POST', userId });
  },

  /**
   * Drop the live topic and move to the next in the queue. Creator only.
   * A skipped topic reveals what it has, so nobody's story is deleted for
   * having been on the wrong topic (D30).
   */
  skip(circleId: string, userId: string) {
    return apiFetch<{ circle: Circle }>(`/threshold/circles/${circleId}/skip`, { method: 'POST', userId });
  },

  /** End the circle. The only way one finishes (D29). Creator only. */
  close(circleId: string, userId: string) {
    return apiFetch<{ circle: Circle }>(`/threshold/circles/${circleId}/close`, { method: 'POST', userId });
  },

  /**
   * Post a topic. Any member, any time — the queue never closes (D27), and an
   * idle circle starts on whatever just arrived. Pass `seedId` to edit one of
   * your own that has not run yet.
   */
  addSeed(
    circleId: string,
    seed: { topic: string; poleA: string; poleB: string; secondsPerNote?: number },
    userId: string,
    seedId?: string,
  ) {
    return apiFetch<{ circle: Circle }>(`/threshold/circles/${circleId}/seeds`, {
      method: 'POST', body: { seed, seedId }, userId,
    });
  },

  /** Toggle my support. One per member, freely taken back — the count is what
   *  orders the queue (D27). Returns the state it landed in. */
  toggleSupport(seedId: string, userId: string) {
    return apiFetch<{ supported: boolean; circle: Circle }>(
      `/threshold/seeds/${seedId}/support`, { method: 'PUT', userId },
    );
  },

  /** Move a queued topic to the front, over the support order (D30). Creator
   *  only, and it decides what runs NEXT — it never interrupts the live cycle. */
  promote(seedId: string, userId: string) {
    return apiFetch<{ circle: Circle }>(`/threshold/seeds/${seedId}/promote`, { method: 'POST', userId });
  },

  /** The record of the conversation so far. Readable at ANY time (D29) — a
   *  circle has no completion condition, so this never 404s on a running one. */
  circleResult(circleId: string, userId?: string | null) {
    return apiFetch<{ result: CircleResult }>(`/threshold/circles/${circleId}/result`, { userId });
  },

  myCircles(userId: string) {
    return apiFetch<{ circles: Circle[] }>('/threshold/me/circles', { userId });
  },

  // ── One seed's cycle ──────────────────────────────────────────────────────

  /**
   * Three visibilities, one per phase, all decided server-side (D17):
   * during `share` you get only your own stories, during `rank` you get
   * everyone's with no name attached, and after `revealed` you get who said
   * what. There is nothing to hide client-side because nothing arrives.
   */
  listShares(seedId: string, userId?: string | null) {
    return apiFetch<{ shares: Share[] }>(`/threshold/seeds/${seedId}/shares`, { userId });
  },

  /** Upserts on (seedId, userId, pole) — one story per pole, at most two per
   *  member per seed (D10). Re-submitting a pole replaces it. */
  submitShare(
    seedId: string,
    body: { pole: Pole; title?: string; text?: string; audio?: unknown },
    userId: string,
  ) {
    return apiFetch<{ share: Share }>(`/threshold/seeds/${seedId}/shares`, { method: 'POST', body, userId });
  },

  deleteShare(seedId: string, pole: Pole, userId: string) {
    return apiFetch<{ ok: true }>(`/threshold/seeds/${seedId}/shares/${pole}`, { method: 'DELETE', userId });
  },

  /** Save progress while sorting. Partial is expected and counts toward
   *  nothing — this is what "sort as you listen" writes. */
  saveRankingDraft(seedId: string, placements: Placement[], userId: string) {
    return apiFetch<{ ranking: MyRanking }>(`/threshold/seeds/${seedId}/ranking`, {
      method: 'PUT', body: { placements }, userId,
    });
  },

  /** The final submit. Complete or nothing (D11) — a partial ranking would make
   *  the agreement fraction depend on who bothered. */
  submitRanking(seedId: string, placements: Placement[], userId: string) {
    return apiFetch<{ ranking: MyRanking }>(`/threshold/seeds/${seedId}/ranking`, {
      method: 'POST', body: { placements }, userId,
    });
  },

  /** 404s until the cycle is revealed. */
  seedResult(seedId: string, userId?: string | null) {
    return apiFetch<{ result: SeedResult; shares: Share[]; seed: Seed }>(
      `/threshold/seeds/${seedId}/result`, { userId },
    );
  },
};
