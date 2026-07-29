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
 */
export function toggleTagHref(params: SearchParams, tagId: string): string {
  const current = activeTagIds(params);
  const next = current.includes(tagId)
    ? current.filter(id => id !== tagId)
    : [...current, tagId];
  return buildHref(next, activeSort(params));
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
export function sortHref(params: SearchParams, sort: SortKey): string {
  return buildHref(activeTagIds(params), sort);
}

// The default ordering is left OUT of the URL, so the plain "/" a person is
// texted stays clean and every view has exactly one address.
function buildHref(tags: string[], sort: SortKey): string {
  const query = new URLSearchParams();
  if (tags.length) query.set('tags', tags.join(','));
  if (sort !== 'newest') query.set('sort', sort);
  const qs = query.toString();
  return qs ? `/?${qs}` : '/';
}

export function clearFiltersHref(params: SearchParams = {}): string {
  return buildHref([], activeSort(params));
}

/** Resolves active ids to tags for display, dropping any that no longer exist. */
export function resolveActiveTags(params: SearchParams, all: Tag[]): Tag[] {
  const ids = activeTagIds(params);
  const byId = new Map(all.map(t => [t.id, t]));
  return ids.map(id => byId.get(id)).filter((t): t is Tag => Boolean(t));
}
