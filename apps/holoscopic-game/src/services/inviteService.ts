import { API_BASE, getCurrentInstanceId, getGameToken } from '@/lib/api';
import { CIRCLES_URL, THRESHOLD_URL } from '@/lib/games';

// Circle invitations: a host makes a single-use link for one email address and
// sends it themselves. There is no invite mail — the token comes back from
// POST /invites exactly once, and only the host ever sees it.

export type InviteStatus = 'pending' | 'accepted' | 'declined' | 'revoked' | 'expired';
export type InviteApp = 'circles' | 'threshold';

/** An invitation as its recipient sees it. `emailHint` is masked server-side. */
export interface InviteView {
  id: string;
  circleTitle: string;
  app: InviteApp;
  path: string;
  invitedByName: string;
  emailHint: string;
  status: InviteStatus;
  expiresAt: string;
  createdAt: string;
}

/** An invitation as its host sees it. */
export interface SentInvite {
  id: string;
  email: string;
  status: InviteStatus;
  createdAt: string;
  expiresAt: string;
  respondedAt: string | null;
}

export interface HostedCircle {
  id: string;
  title: string;
  app: InviteApp;
  path: string;
  invites: SentInvite[];
}

export interface AcceptResult {
  invite: InviteView;
  app: InviteApp;
  path: string;
}

/**
 * Thrown for any non-2xx. Unlike apiFetch's plain Error it keeps the status,
 * the machine-readable `code`, and the rest of the body — the invite pages
 * branch on `email_unverified` / `email_mismatch` / `invite_closed`, and the
 * last two carry the `emailHint` and `status` the page has to show.
 */
export class InviteError extends Error {
  status: number;
  code?: string;
  body: Record<string, unknown>;

  constructor(status: number, body: Record<string, unknown>) {
    super(typeof body.error === 'string' ? body.error : `Request failed (${status})`);
    this.name = 'InviteError';
    this.status = status;
    this.code = typeof body.code === 'string' ? body.code : undefined;
    this.body = body;
  }
}

// The same headers apiFetch sends, minus the error flattening. The token read
// by the signed-out /invites/token/:token view comes back null and the header
// is simply left off.
async function inviteFetch<T>(path: string, init: { method?: string; body?: unknown; userId?: string | null } = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (init.userId) headers['x-user-id'] = init.userId;
  const instanceId = getCurrentInstanceId();
  if (instanceId) headers['x-instance-id'] = instanceId;
  const token = await getGameToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method: init.method || 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new InviteError(res.status, data && typeof data === 'object' ? data : {});
  return data as T;
}

export const InviteService = {
  /** Pending invitations addressed to this account's confirmed email. */
  mine: (userId: string) =>
    inviteFetch<{ invites: InviteView[]; emailUnverified: boolean }>('/invites/mine', { userId }),

  /** Circles this account hosts, each with the invitations sent for it. */
  hosting: (userId: string) =>
    inviteFetch<{ circles: HostedCircle[] }>('/invites/hosting', { userId }).then(d => d.circles),

  /** The token is returned once; the caller shows the link and forgets it. */
  create: (userId: string, circleId: string, email: string) =>
    inviteFetch<{ invite: SentInvite; token: string }>('/invites', { method: 'POST', userId, body: { circleId, email } }),

  revoke: (userId: string, inviteId: string) =>
    inviteFetch<{ invite: SentInvite }>(`/invites/${inviteId}`, { method: 'DELETE', userId }).then(d => d.invite),

  /** Works signed out — the landing page for a link has to render before sign-in. */
  getByToken: (token: string, userId?: string | null) =>
    inviteFetch<{ invite: InviteView }>(`/invites/token/${encodeURIComponent(token)}`, { userId }).then(d => d.invite),

  acceptToken: (userId: string, token: string) =>
    inviteFetch<AcceptResult>(`/invites/token/${encodeURIComponent(token)}/accept`, { method: 'POST', userId }),

  declineToken: (userId: string, token: string) =>
    inviteFetch<{ invite: InviteView }>(`/invites/token/${encodeURIComponent(token)}/decline`, { method: 'POST', userId }).then(d => d.invite),

  accept: (userId: string, inviteId: string) =>
    inviteFetch<AcceptResult>(`/invites/${inviteId}/accept`, { method: 'POST', userId }),

  decline: (userId: string, inviteId: string) =>
    inviteFetch<{ invite: InviteView }>(`/invites/${inviteId}/decline`, { method: 'POST', userId }).then(d => d.invite),
};

const APP_ORIGINS: Record<InviteApp, string> = { circles: CIRCLES_URL, threshold: THRESHOLD_URL };
const APP_NAMES: Record<InviteApp, string> = { circles: 'Circles', threshold: 'Threshold' };

/** Where an invitation's circle lives. `path` is relative to its app's origin. */
export function inviteDestination(app: InviteApp, path: string): string {
  return `${APP_ORIGINS[app] ?? CIRCLES_URL}${path}`;
}

export function inviteAppName(app: InviteApp): string {
  return APP_NAMES[app] ?? app;
}
