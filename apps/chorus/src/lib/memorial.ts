import { cache } from 'react';
import { memorialApiFor, ApiError } from '@/services/api';
import type { ConfigResponse } from '@/lib/types';

// One memorial's config, fetched at most once per request.
//
// WHY THIS EXISTS. GET /memorial/config was the single busiest endpoint on the
// backend by a wide margin — thousands of calls on a day with five recorded
// visits — and most of them were the same memorial, resolved repeatedly inside
// one page render. Every route under /c/<slug> pays for the layout, and the
// layout resolved the memorial TWICE on its own (once in generateMetadata,
// once in the body) before the page resolved it a third time.
//
// React's `cache` collapses those to one call per request: same argument, same
// render pass, one fetch. It is deliberately keyed on the SLUG rather than
// taking a bound api object, because two different slugs must never share an
// entry — a memorial showing another family's memories is the one failure this
// app cannot have, and an argument you can see at the call site is easier to
// keep honest than an object identity you cannot.
//
// This is per-request only. Caching ACROSS requests is a separate decision and
// lives on the fetch itself (services/api.ts, `revalidate` on config).
//
// Server Components only — `cache` is a server API and this module reaches the
// network on import-time-resolved config.

/**
 * The memorial's full config: who it is for, plus both tag vocabularies.
 *
 * THROWS on failure, rather than returning null. Each caller means something
 * different by "could not load this": the layout means 404, the wall means
 * "show the try-again page", a memory page means notFound() on a 404 and a
 * real error otherwise. Swallowing the failure here would take that choice
 * away from all three.
 */
export const loadConfig = cache(
  (slug: string): Promise<ConfigResponse> => memorialApiFor(slug).config(),
);

/**
 * Why a read did not produce a memorial. Three different things, and for a
 * long time all of them rendered as the first one.
 *
 *   missing      This slug names no memorial. The only honest 404.
 *   busy         The server is rate-limiting us (429). The memorial exists and
 *                is fine; too many people are reading it this minute.
 *   unreachable  Anything else — a 500, an Atlas failover, a deploy restart, a
 *                phone changing towers mid-fetch.
 *
 * The distinction is the whole point. `loadMemorial` used to catch every error
 * and return null, and the layout turned null into notFound(), so a rate limit
 * told someone who had been texted a link about a person who died that the
 * person's memorial did not exist. A busy minute and a deleted memorial are
 * not the same news and must never look the same.
 */
export type FailureReason = 'missing' | 'busy' | 'unreachable';

export function classifyFailure(err: unknown): FailureReason {
  if (err instanceof ApiError) {
    // 404 is the backend saying this instance is no memorial of ours — the
    // guard in routes/memorial.js answers 404 for a slug that names nothing
    // AND for one somebody may not see, deliberately indistinguishable.
    if (err.status === 404) return 'missing';
    if (err.status === 429) return 'busy';
  }
  // A thrown TypeError from fetch (DNS, socket, timeout) lands here too, which
  // is right: from a reader's side it is the same event as a 500.
  return 'unreachable';
}

export type MemorialLoad =
  | { state: 'ok'; memorial: ConfigResponse['memorial'] }
  | { state: FailureReason };

/**
 * The memorial for this slug, or which kind of nothing happened instead.
 *
 * resolveInstance falls back to the platform's default instance when a header
 * names nothing it recognises, so a typo'd slug returns a perfectly valid
 * config for the WRONG memorial. Only a config that names a subject is a
 * memorial; anything else is that fallback, and it is 'missing'.
 */
export async function loadMemorial(slug: string): Promise<MemorialLoad> {
  try {
    const { memorial } = await loadConfig(slug);
    if (!memorial?.subjectName) return { state: 'missing' };
    return { state: 'ok', memorial };
  } catch (err) {
    return { state: classifyFailure(err) };
  }
}
