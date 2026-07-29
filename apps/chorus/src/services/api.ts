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

// One memorial per deployment for now. Read from config on the server rather
// than hardcoded anywhere, so pointing this frontend at a different memorial
// is an env change — and the eventual multi-collection version is a routing
// change rather than a data migration (PLAN §11).
export const INSTANCE_ID = process.env.NEXT_PUBLIC_INSTANCE_ID || 'chorus';

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
  path: string,
  options: { method?: string; body?: unknown; withContributor?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-instance-id': INSTANCE_ID,
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

export const memorialApi = {
  config: () => apiFetch<ConfigResponse>('/memorial/config'),

  wall: (params: {
    tags?: string[]; cursor?: string | null; limit?: number; sort?: string;
  } = {}) => {
    const q = new URLSearchParams();
    if (params.tags?.length) q.set('tags', params.tags.join(','));
    if (params.cursor) q.set('cursor', params.cursor);
    if (params.limit) q.set('limit', String(params.limit));
    if (params.sort) q.set('sort', params.sort);
    const qs = q.toString();
    return apiFetch<WallResponse>(`/memorial/memories${qs ? `?${qs}` : ''}`);
  },

  memory: (id: string) => apiFetch<MemoryDetail>(`/memorial/memories/${id}`),

  session: () => apiFetch<{ contributorId: string; token: string }>(
    '/memorial/session',
    { method: 'POST', withContributor: true },
  ),

  create: (draft: ComposeDraft) => apiFetch<MemoryDetail>('/memorial/memories', {
    method: 'POST',
    withContributor: true,
    body: {
      title: draft.title,
      sharerName: draft.sharerName,
      // The server takes LABELS, not ids, for all three slots — that's what
      // makes a picked tag and a typed-in one the same code path.
      subjectTags: draft.subjectTags,
      selfTags: draft.selfTags,
      experienceTags: draft.experienceTags,
      body: { text: draft.text, audio: draft.audio ?? undefined },
      replyToId: draft.replyToId ?? null,
    },
  }),
};

// Uploads a recording straight from the browser to Vercel Blob and returns the
// public URL. The bytes reach Blob directly — neither this Next server nor the
// Render backend ever sees them.
//
// `onProgress` is not decoration: a three-minute recording on a bad connection
// takes long enough that a still button reads as a broken one, and somebody
// who thinks it's broken closes the sheet.
export async function uploadRecording(
  blob: Blob,
  { mimeType, onProgress }: { mimeType: string; onProgress?: (percent: number) => void },
): Promise<{ url: string; pathname: string }> {
  const { upload } = await import('@vercel/blob/client');
  const { fileExtensionFor } = await import('@/lib/recorder');

  // Namespaced per memorial from day one, so the multi-collection version
  // needs no reshuffle of existing objects (PLAN §11).
  const pathname = `memorial/${INSTANCE_ID}/${Date.now()}.${fileExtensionFor(mimeType)}`;

  const result = await upload(pathname, blob, {
    access: 'public',
    handleUploadUrl: '/api/audio/upload',
    contentType: mimeType,
    multipart: true,
    onUploadProgress: onProgress ? (p) => onProgress(Math.round(p.percentage)) : undefined,
  });

  return { url: result.url, pathname: result.pathname };
}

// Mints an anonymous contributor identity if this browser doesn't have one,
// and caches it forever. Called when the compose sheet opens rather than on
// page load — someone who only ever reads a memorial should never cause a
// write to the server.
//
// Returns null if the mint fails. The caller surfaces that at submit time,
// not on open: a visitor who opened the sheet to read the prompt should not
// be shown an error about a session they never asked for.
export async function ensureContributor(): Promise<string | null> {
  const existing = contributorToken();
  if (existing) return existing;
  try {
    const { token } = await memorialApi.session();
    storeContributorToken(token);
    return token;
  } catch {
    return null;
  }
}
