import type { Tag } from './types';

// Filtering lives in the URL, not in client state.
//
// That's three things for free: the wall stays a Server Component (no
// client-side refetch, no loading flicker), a filtered view is a link somebody
// can send — "here's every story where she was stubborn" — and the back button
// does what a back button should.

export type SearchParams = Record<string, string | string[] | undefined>;

export function activeTagIds(params: SearchParams): string[] {
  const raw = params.tags;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return [];
  return value.split(',').map(s => s.trim()).filter(Boolean).slice(0, 6);
}

/**
 * The href that adds this tag to (or removes it from) the current filter,
 * keeping the chosen ordering — changing a filter should never silently
 * reset the wall's order underneath the reader.
 *
 * `base` is the memorial's own path, `/c/<slug>`. Every builder here takes it
 * because one deployment serves every memorial: a bare "/?tags=…" would land
 * on the app's front door rather than on a filtered view of the wall the
 * reader was actually looking at.
 */
export function toggleTagHref(base: string, params: SearchParams, tagId: string): string {
  const current = activeTagIds(params);
  const next = current.includes(tagId)
    ? current.filter(id => id !== tagId)
    : [...current, tagId];
  return buildHref(base, next, activeSort(params));
}

// ── Sorting ─────────────────────────────────────────────────────────────────

export const SORT_LABELS = {
  newest: 'Newest',
  oldest: 'Oldest',
  connected: 'Most connected',
} as const;

export type SortKey = keyof typeof SORT_LABELS;

export function activeSort(params: SearchParams): SortKey {
  const raw = params.sort;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && value in SORT_LABELS ? (value as SortKey) : 'newest';
}

/** Builds a URL preserving the current filters while changing the ordering. */
export function sortHref(base: string, params: SearchParams, sort: SortKey): string {
  return buildHref(base, activeTagIds(params), sort);
}

// The default ordering is left OUT of the URL, so the plain link a person is
// texted stays clean and every view has exactly one address.
//
// TAG IDS ARE SORTED for the same reason, and it is load-bearing rather than
// tidy. Filtering is AND across the set, so ?tags=A,B and ?tags=B,A are the
// same wall — but as URLs they are two addresses, two cache entries, and two
// server renders. Left in click order, a six-word filter had 720 spellings.
//
// That is not a hypothetical. A crawler walking the tag links (every chip on
// every card, every chip in the rail) enumerated them at roughly a request a
// second for days: 1,215 renders in one sample, every single one returning an
// empty wall, the same filter SET arriving up to 54 times by 54 different
// routes. Sorting collapses each set to one address and makes the space the
// crawler can reach finite.
//
// Reading stays order-insensitive — the backend ANDs a multikey index — so
// every link already in circulation keeps working, whatever order it spells.
function buildHref(base: string, tags: string[], sort: SortKey): string {
  const query = new URLSearchParams();
  if (tags.length) query.set('tags', [...tags].sort().join(','));
  if (sort !== 'newest') query.set('sort', sort);
  const qs = query.toString();
  return qs ? `${base}?${qs}` : base;
}

export function clearFiltersHref(base: string, params: SearchParams = {}): string {
  return buildHref(base, [], activeSort(params));
}

/** Resolves active ids to tags for display, dropping any that no longer exist. */
export function resolveActiveTags(params: SearchParams, all: Tag[]): Tag[] {
  const ids = activeTagIds(params);
  const byId = new Map(all.map(t => [t.id, t]));
  return ids.map(id => byId.get(id)).filter((t): t is Tag => Boolean(t));
}
