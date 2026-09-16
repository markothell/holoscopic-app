// All HTTP goes through here. Identity-bearing requests attach a short-lived
// game token minted from the NextAuth session by /api/auth/game-token; the
// backend's enforceVerifiedUser checks that the token's sub matches the claimed
// x-user-id, so the header alone proves nothing.
//
// Same account machinery as the rest of the platform — one global User
// collection behind one backend, and these are Holoscopic accounts, said
// plainly (code/docs/plan/PLATFORM.md P18). Every existing account signs straight in.
//
// The generic circle operations (snapshot, my circles, join) ride
// /api/circles — the M8 promotion, triggered by this app being the Circle
// layer's second consumer. The ACTIVITY verbs (telling, sorting, the reveal)
// stay on /api/threshold: they are Threshold's, and each future activity
// brings its own.

import { ApiError, createApiFetch } from '@hs/api';
import type {
  Circle, GatherExtras, GatherResponse, HostedCircle, MyRanking, Placement, Pole, Seed, SeedResult,
  SentInvite, Share, MyIdea,
} from '@/lib/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001/api';

// The parent instance holding every circle. resolveInstance never fails — an
// unrecognised id falls through to the platform default — so the backend
// checks Instance.app itself; a wrong value here reads as "circle not found".
export const INSTANCE_ID = process.env.NEXT_PUBLIC_INSTANCE_ID || 'threshold';

// The token cache, error shape and fetch body are @hs/api's (M2) — the same
// deduped mint every app now shares.
export { ApiError, getGameToken, clearGameToken } from '@hs/api';

const apiFetch = createApiFetch({ apiBase: API_BASE, instanceId: INSTANCE_ID });

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
   * Start a circle. It is born running `gather` — the + builder's asks are
   * what this app makes — and in DRAFT: named, with nobody in it but you.
   * Opening it is a second, deliberate act on the circle page, so a
   * half-configured circle never mails anybody.
   *
   * Any verified account may host, capped at three open circles (P15 rung 2,
   * revised 2026-09-16). 409 `host_limit` when the cap is reached.
   */
  createCircle(
    userId: string,
    body: {
      title: string;
      urlName?: string;
      /** Seats these addresses without a link. They still have to match the
       *  ACCOUNT's confirmed address to get in. */
      invitedEmails?: string[];
      /** false = anyone holding the link may take a seat. */
      requireInvitation?: boolean;
    },
  ) {
    return apiFetch<{ circle: Circle }>('/circles', { method: 'POST', body, userId });
  },

  /** draft → running. Host only. A circle opened with an empty queue goes IDLE
   *  rather than waiting for a seeding round: the first ask anybody posts is
   *  the first cycle, so nothing waits for everybody. */
  startCircle(circleId: string, userId: string) {
    return apiFetch<{ circle: Circle }>(`/circles/${circleId}/start`, { method: 'POST', userId });
  },

  /**
   * Leave. Any member, including the host — and NOT an ending: the circle goes
   * on without you, and if you held the seat it is simply vacant. This is the
   * ordinary way out from under the host limit, since the limit counts seats.
   *
   * The last member out is the exception, and the answer says which happened:
   * `closed` if the circle held anything, `deleted` if it never collected a
   * thing. `circle` is null when it was deleted.
   */
  leaveCircle(circleId: string, userId: string) {
    return apiFetch<{
      left: true; closed: boolean; deleted: boolean; seatVacated: boolean; circle: Circle | null;
    }>(`/circles/${circleId}/leave`, { method: 'POST', userId });
  },

  /** End it, for everyone. Host only, and the only way a circle finishes (D29)
   *  — live cycles reveal on the way out rather than being left mid-sort. */
  closeCircle(circleId: string, userId: string) {
    return apiFetch<{ circle: Circle }>(`/circles/${circleId}/close`, { method: 'POST', userId });
  },

  /** Erase it. Host only, and refused the moment anybody has put something in —
   *  that case is close, not delete. For the circle made by mistake, which
   *  close cannot tidy up because a closed circle keeps its urlName forever. */
  deleteCircle(circleId: string, userId: string) {
    return apiFetch<{ deleted: true; id: string }>(`/circles/${circleId}`, {
      method: 'DELETE', userId,
    });
  },

  /** Take a vacant seat. Any member, only while it is genuinely vacant. 409
   *  `host_limit` when the taker's own plan is already full — which is the
   *  honest moment to meet the limit, and where the upgrade is offered. */
  claimHost(circleId: string, userId: string) {
    return apiFetch<{ circle: Circle }>(`/circles/${circleId}/host`, { method: 'POST', userId });
  },

  /**
   * Put a seed to the circle. `activity` selects the module when it differs
   * from the circle's own — 'synthesis' shares a document, which lands
   * NOMINATED: readable and contributable, but outside the queue until
   * somebody else backs it.
   */
  postSeed(circleId: string, userId: string, payload: Record<string, unknown>, activity?: string) {
    return apiFetch<{ circle: Circle }>(`/circles/${circleId}/seeds`, {
      method: 'POST', body: { payload, activity: activity ?? null }, userId,
    });
  },

  /** Toggle my support. On a nominated seed, the first support from anyone
   *  other than its author is what accepts it into the queue. */
  supportSeed(circleId: string, seedId: string, userId: string) {
    return apiFetch<{ circle: Circle }>(`/circles/${circleId}/seeds/${seedId}/support`, {
      method: 'POST', userId,
    });
  },

  /**
   * Take a seat. The invitation gate is server-side: when the circle requires
   * one, the ACCOUNT's confirmed address must be on its invitation list
   * (routes/circles.js#accountOf). That address also lands on the member row as
   * where this circle's mail reaches you. Joining in week six is the ordinary
   * way in, not an edge case — nothing is withheld for having missed the
   * beginning.
   */
  join(circleId: string, userId: string) {
    return apiFetch<{ circle: Circle }>(`/circles/${circleId}/join`, {
      method: 'POST', userId,
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

  // --- Gather (the builder's single-round activity) — rides /api/circles,
  // --- since gather is the platform's activity rather than any one app's.

  /**
   * Submit or update my response — one write carries everything (title, text,
   * audio, position, words), upserted. Open after the reveal (B4), text-only
   * once closed (B5). The server evaluates completion after the write, so the
   * returned circle may already be revealed — render it, don't refetch.
   */
  respond(
    circleId: string,
    seedId: string,
    userId: string,
    body: {
      title?: string; text?: string; audio?: unknown;
      position?: { x: number; y?: number } | null;
      /** Labels, not ids — unknown ones are coined against the member's budget. */
      words?: string[] | null;
    },
  ) {
    return apiFetch<{ share: GatherResponse; circle: Circle }>(
      `/circles/${circleId}/seeds/${seedId}/respond`,
      { method: 'POST', body, userId },
    );
  },

  /** Toggle my reaction. Free, no self-react; live on an open wall, at the
   *  reveal on a sealed one. */
  react(circleId: string, seedId: string, shareId: string, userId: string) {
    return apiFetch<{ share: GatherResponse }>(
      `/circles/${circleId}/seeds/${seedId}/responses/${shareId}/react`,
      { method: 'POST', userId },
    );
  },

  /**
   * One gather seed's content at any phase — the reveal's read and the respond
   * surface's refresh. The snapshot only carries extras for LIVE seeds, so a
   * revealed ask's wall comes through here. 404s until the seed opens.
   */
  seedResponses(circleId: string, seedId: string, userId: string) {
    return apiFetch<{ seed: Seed } & GatherExtras>(
      `/circles/${circleId}/seeds/${seedId}/responses`, { userId },
    );
  },

  /** The facilitator's escape hatch — reveal now (creator or the seed's
   *  author). Irreversible, so the surface confirms first (S20). */
  advanceSeed(circleId: string, seedId: string, userId: string) {
    return apiFetch<{ circle: Circle }>(
      `/circles/${circleId}/seeds/${seedId}/advance`,
      { method: 'POST', userId },
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
// The circle no longer asks synthesis what it owns — a shared document IS a
// seed on the circle, so it arrives in the snapshot. The one thing still worth
// asking across the boundary is what documents I have to share.
export const synthesisApi = {
  myIdeas(userId: string) {
    return apiFetch<{ ideas: MyIdea[] }>('/synthesis/me/ideas', { userId });
  },
};

/**
 * Where an invitation link lands. The landing page lives on holoscopic.io
 * (`apps/holoscopic-game/src/app/invite/[token]`) rather than here, because an
 * invitation is cross-app by nature — it can name a circle in this product or
 * in Threshold — and because whoever holds the link usually has no account
 * yet, so it has to render before sign-in.
 *
 * NOT `window.location.origin`: that is this app's own origin, which serves no
 * /invite route, and a link built from it 404s for every invitee.
 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:4003';

/**
 * Invitations to a circle (apps/backend/routes/invites.js).
 *
 * Deliberately NOT instance-scoped on the server — an invitation is found by
 * its token or id, and the circle it names carries its own instanceId — so
 * these are the same rows holoscopic.io/invitations reads. A link made here
 * and revoked there is one list, not two.
 *
 * There is no invitation mail, by design: `create` returns the token exactly
 * once and the host sends the link in their own words.
 */
export const invitesApi = {
  /** Circles this account hosts, each with the invitations sent for it. */
  hosting(userId: string) {
    return apiFetch<{ circles: HostedCircle[] }>('/invites/hosting', { userId });
  },

  /** Make a link for one address. An earlier pending link for the same address
   *  is revoked, so a re-sent invitation is the only one that works. */
  create(userId: string, circleId: string, email: string) {
    return apiFetch<{ invite: SentInvite; token: string }>('/invites', {
      method: 'POST', body: { circleId, email }, userId,
    });
  },

  /** Withdraw a pending link. The address comes off the circle's invitation
   *  list too, so a revoked invitee cannot walk in through the circle page. */
  revoke(userId: string, inviteId: string) {
    return apiFetch<{ invite: SentInvite }>(`/invites/${inviteId}`, { method: 'DELETE', userId });
  },
};
