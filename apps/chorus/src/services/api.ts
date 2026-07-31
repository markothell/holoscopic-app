// All HTTP goes through here.
//
// Chorus has no accounts and no NextAuth (PLAN.md D2), so there is no game
// token and no x-user-id anywhere in this app. Writes instead carry a signed
// contributor token minted by POST /memorial/session and kept in
// localStorage — see contributorToken() below.
//
// Reads run on the server (the landing page must paint instantly from a
// texted link), so this module must stay safe to import from a Server
// Component: nothing at module scope may touch window or localStorage.

import type { ConfigResponse, MemoryDetail, WallResponse, ComposeDraft } from '@/lib/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001/api';

// One deployment serves every memorial. Which one a request is for comes from
// the `/c/<slug>` path segment and travels as `x-instance-id` — resolveInstance
// accepts a slug or an id there.
//
// This used to be a module constant read from NEXT_PUBLIC_INSTANCE_ID, which
// meant one memorial per Vercel project. It is a parameter now precisely
// because that is the entire multi-collection change on the read side
// (PLAN §11.3): nothing else about the data or the model had to move.
//
// There is deliberately no default. A missing slug must be a 404 for a
// memorial that doesn't exist, never a quiet fallback that shows one family
// another family's memories.
const TOKEN_KEY = 'chorus.contributorToken';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function contributorToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function storeContributorToken(token: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(TOKEN_KEY, token);
}

async function apiFetch<T>(
  instance: string,
  path: string,
  options: { method?: string; body?: unknown; withContributor?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-instance-id': instance,
  };
  if (options.withContributor) {
    const token = contributorToken();
    if (token) headers['x-contributor-token'] = token;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    // A memorial gains memories at unpredictable times and a stale wall is the
    // one thing that makes a contributor think their memory did not save.
    cache: 'no-store',
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, json?.error || `Request failed (${res.status})`);
  }
  return json as T;
}

// The API bound to one memorial. Server Components build this from their
// `slug` route param; client components get it from useMemorial().
//
// Binding the instance once, here, is what keeps every call site from having
// to remember to pass it — and a call site that forgets would read the wrong
// memorial rather than fail, which is the one class of bug this app cannot
// afford.
export function memorialApiFor(instance: string) {
  return {
    instance,

    config: () => apiFetch<ConfigResponse>(instance, '/memorial/config'),

    wall: (params: {
      tags?: string[]; cursor?: string | null; limit?: number; sort?: string;
    } = {}) => {
      const q = new URLSearchParams();
      if (params.tags?.length) q.set('tags', params.tags.join(','));
      if (params.cursor) q.set('cursor', params.cursor);
      if (params.limit) q.set('limit', String(params.limit));
      if (params.sort) q.set('sort', params.sort);
      const qs = q.toString();
      return apiFetch<WallResponse>(instance, `/memorial/memories${qs ? `?${qs}` : ''}`);
    },

    memory: (id: string) => apiFetch<MemoryDetail>(instance, `/memorial/memories/${id}`),

    flag: (id: string) => apiFetch<{ ok: true }>(instance, `/memorial/memories/${id}/flag`, {
      method: 'POST',
      withContributor: true,
    }),

    // ── Curator surface ─────────────────────────────────────────────────────
    // Authenticated by a key in the URL and nothing else (D10), so a family
    // member with no holoscopic account can moderate from a texted link. Every
    // one of these 404s without it, so probing is indistinguishable from a typo.
    curate: {
      wall: (key: string, cursor?: string | null) => {
        const q = new URLSearchParams({ k: key, limit: '50' });
        if (cursor) q.set('cursor', cursor);
        return apiFetch<WallResponse>(instance, `/memorial/memories?${q}`);
      },
      setStatus: (key: string, id: string, status: 'live' | 'hidden' | 'removed', reason = '') =>
        apiFetch<{ memory: { id: string; status: string } }>(
          instance,
          `/memorial/curate/memories/${id}/status?k=${encodeURIComponent(key)}`,
          { method: 'POST', body: { status, reason } },
        ),
    },

    session: () => apiFetch<{ contributorId: string; token: string }>(
      instance,
      '/memorial/session',
      { method: 'POST', withContributor: true },
    ),

    create: (draft: ComposeDraft) => apiFetch<MemoryDetail>(instance, '/memorial/memories', {
      method: 'POST',
      withContributor: true,
      body: {
        title: draft.title,
        sharerName: draft.sharerName,
        // The server takes LABELS, not ids, for all three slots — that's what
        // makes a picked tag and a typed-in one the same code path.
        subjectTags: draft.subjectTags,
        // Still sent, always empty: the route treats an absent key as "leave
        // whatever is there" (resolveSlots), which is right for the edit path
        // and wrong for a create, where it would look like a dropped field.
        selfTags: draft.selfTags ?? [],
        experienceTags: draft.experienceTags,
        body: { text: draft.text, audio: draft.audio ?? undefined },
        replyToId: draft.replyToId ?? null,
      },
    }),
  };
}

export type MemorialApi = ReturnType<typeof memorialApiFor>;

// Uploads a recording straight from the browser to Vercel Blob and returns the
// public URL. The bytes reach Blob directly — neither this Next server nor the
// Render backend ever sees them.
//
// `onProgress` is not decoration: a three-minute recording on a bad connection
// takes long enough that a still button reads as a broken one, and somebody
// who thinks it's broken closes the sheet.
export async function uploadRecording(
  blob: Blob,
  { instance, mimeType, onProgress }: {
    instance: string; mimeType: string; onProgress?: (percent: number) => void;
  },
): Promise<{ url: string; pathname: string }> {
  const { upload } = await import('@vercel/blob/client');
  const { fileExtensionFor, baseMimeType } = await import('@/lib/recorder');

  // Namespaced per memorial from day one, so the multi-collection version
  // needs no reshuffle of existing objects (PLAN §11).
  const pathname = `memorial/${instance}/${Date.now()}.${fileExtensionFor(mimeType)}`;

  const result = await upload(pathname, blob, {
    access: 'public',
    handleUploadUrl: '/api/audio/upload',
    // Parameters stripped: Blob's allowlist is an exact string match and the
    // codecs parameter is spelled differently per browser (see baseMimeType).
    contentType: baseMimeType(mimeType),
    multipart: true,
    onUploadProgress: onProgress ? (p) => onProgress(Math.round(p.percentage)) : undefined,
  });

  return { url: result.url, pathname: result.pathname };
}

// Tell the backend that a send failed on this phone.
//
// The recording goes browser → Blob directly, which is what makes a long
// recording on a bad connection feasible and also means a failure there is
// invisible to every server we own: the token mint returned 200, Render was
// never called, and no row was ever written. The phone is the only machine
// that knows. Without this beacon the first iPhone failure was findable only
// because a person happened to be holding the phone and said so.
//
// Fire-and-forget in the strongest sense: a report that fails is swallowed,
// because an error about an error helps nobody. `keepalive` lets it survive
// the contributor closing the tab in frustration, which is the exact moment
// the report matters most.
export async function reportFailure(instance: string, payload: {
  stage: string; kind: string; code: string; detail: string;
  mimeType?: string; sizeBytes?: number; durationMs?: number; attempts?: number;
}): Promise<void> {
  try {
    await fetch(`${API_BASE}/memorial/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-instance-id': instance },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    // no-op
  }
}

// Mints an anonymous contributor identity if this browser doesn't have one,
// and caches it forever. Called when the compose sheet opens rather than on
// page load — someone who only ever reads a memorial should never cause a
// write to the server.
//
// Returns null if the mint fails. The caller surfaces that at submit time,
// not on open: a visitor who opened the sheet to read the prompt should not
// be shown an error about a session they never asked for.
export async function ensureContributor(api: MemorialApi): Promise<string | null> {
  const existing = contributorToken();
  if (existing) return existing;
  try {
    const { token } = await api.session();
    storeContributorToken(token);
    return token;
  } catch {
    return null;
  }
}
