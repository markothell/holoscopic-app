import { cache } from 'react';
import { memorialApiFor } from '@/services/api';
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
 * The memorial itself, or null if this slug does not name one.
 *
 * resolveInstance falls back to the platform's default instance when a header
 * names nothing it recognises, so a typo'd slug returns a perfectly valid
 * config for the WRONG memorial. Only a config that names a subject is a
 * memorial; anything else is that fallback, and it must 404.
 */
export async function loadMemorial(slug: string) {
  try {
    const { memorial } = await loadConfig(slug);
    if (!memorial?.subjectName) return null;
    return memorial;
  } catch {
    return null;
  }
}
