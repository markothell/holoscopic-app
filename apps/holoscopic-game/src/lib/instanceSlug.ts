// The single source of truth for "which game does this URL belong to."
//
// Tenant identity is a pure function of the route — never stored in mutable
// state, so it cannot drift as the user navigates between games. Requests read
// it at call time (see lib/api.ts) and always match the current URL.
//
// Game pages live under /interview/[session]; the session segment is the slug.
// The backend's resolveInstance accepts a slug directly as x-instance-id, so we
// send the slug through as-is — no async resolve, no id lookup needed to route.

// Top-level Next.js routes that are NOT game slugs. On these, there is no game
// in the URL and requests fall back to the origin/default instance.
export const SYSTEM_PATHS = new Set([
  '', 'a', 'dashboard', 'admin', 'create', 'profile', 'login', 'signup',
  'settings', 'start', 'waitlist', 'essays', 'manifesto', 'sequence',
  'patterns', 'frame', 'play', 'topics', 'inquiry', 'algorithms', 'api',
  'interview',
]);

/**
 * Extract the active game slug from a pathname, or null when the route carries
 * no game (system pages). `/interview/mompod/...` → `mompod`; `/dashboard` → null.
 */
export function instanceSlugFromPath(pathname: string | null | undefined): string | null {
  const segments = (pathname || '/').split('/');
  // /interview/[session]/... → the session segment is the slug
  const raw = segments[1] === 'interview' ? segments[2] : segments[1];
  return raw && !SYSTEM_PATHS.has(raw) ? raw : null;
}
