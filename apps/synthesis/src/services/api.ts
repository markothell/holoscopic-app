// All HTTP goes through here. Identity-bearing mutations attach a
// short-lived game token minted from the NextAuth session by
// /api/auth/game-token; the backend's enforceVerifiedUser checks that the
// token's sub matches the claimed x-user-id. Same pattern as apps/spectrum.
import { ApiError, getGameToken } from '@hs/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001/api';

// The PARENT instance for Synthesis — used for auth and community create/join.
// A joined community is its own child Instance (see PLAN §8); in-community
// requests override with the community's own instance id.
export const PARENT_INSTANCE_ID = process.env.NEXT_PUBLIC_INSTANCE_ID || 'synthesis';

// The token cache and error shape are @hs/api's (M2) — the same deduped mint
// every app now shares. buildHeaders stays local because apiStream needs it
// too, and a streaming POST is this app's own shape.
export { ApiError, clearGameToken } from '@hs/api';

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

// A `text/event-stream` POST (union, UNION.md §9) —
// EventSource can't POST, so the caller reads `res.body` itself and parses
// `event:`/`data:` frames (see UnionOverlay). Throws ApiError on a
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

/**
 * Upload a recording straight from the browser to Vercel Blob and return the
 * URL to hand to the backend (D20). The bytes reach Blob directly — neither
 * this Next server nor the backend ever sees them. Namespaced by community
 * instance, so a per-idea sweep or restore needs no reshuffle.
 */
export async function uploadRecording(
  blob: Blob,
  { instanceId, mimeType, onProgress }: {
    instanceId: string; mimeType: string; onProgress?: (percent: number) => void;
  },
): Promise<{ url: string; pathname: string }> {
  const { upload } = await import('@vercel/blob/client');
  const { fileExtensionFor, baseMimeType } = await import('@hs/audio');

  const pathname = `synthesis/${instanceId}/${Date.now()}.${fileExtensionFor(mimeType)}`;

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
