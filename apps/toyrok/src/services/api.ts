// All HTTP goes through here. Identity-bearing requests attach a short-lived
// game token minted from the NextAuth session by /api/auth/game-token; the
// backend's enforceVerifiedUser checks that the token's sub matches the claimed
// x-user-id, so the header alone proves nothing.
//
// Same account machinery as the rest of the platform (one global User
// collection behind one backend), but no surface here ever says so — Toyrok's
// accounts read as Toyrok's own (PLATFORM.md P18).
//
// v1 reads the Circle machine through /api/threshold, its only REST surface
// today. When Synthesis joins, the generic circle operations get promoted to
// /api/circles (the M8 trigger) and this file's paths change in one place.

import type { Circle, MyRanking, Placement, Pole, Seed, SeedResult, Share } from '@/lib/types';

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

export const toyrokApi = {
  /** Every circle I'm a member of. */
  myCircles(userId: string) {
    return apiFetch<{ circles: Circle[] }>('/threshold/me/circles', { userId });
  },

  /** The snapshot: the circle, my standing in it, and (for members) the
   *  participation rows the circle-home map draws from. */
  getCircle(urlName: string, userId?: string | null) {
    return apiFetch<{ circle: Circle }>(`/threshold/circles/${urlName}`, { userId });
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
