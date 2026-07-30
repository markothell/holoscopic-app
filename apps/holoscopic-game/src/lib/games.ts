/**
 * Cross-game helpers for player history / profiles.
 *
 * A player's history spans every game they've joined — interView editions and
 * On a Spectrum rooms alike. The two live in different apps, so links out of a
 * history row have to route to the right one.
 */

// On a Spectrum lives at its own domain (see apps/spectrum). Overridable for
// local dev (spectrum runs on :4000); defaults to production.
export const SPECTRUM_URL =
  process.env.NEXT_PUBLIC_SPECTRUM_URL || 'https://spectrum.holoscopic.io';

// Synthesis, same deal (see apps/synthesis, :4004 locally).
//
// NOTE: synthesis.holoscopic.io does not resolve yet. The homepage card
// pointing here is a dead link until that domain is live and added to the
// backend's CLIENT_URL, so set NEXT_PUBLIC_SYNTHESIS_URL=http://localhost:4004
// to follow the card locally.
export const SYNTHESIS_URL =
  process.env.NEXT_PUBLIC_SYNTHESIS_URL || 'https://synthesis.holoscopic.io';

// Chorus (see apps/chorus, :4005 locally).
//
// One deployment serves every memorial, each addressed by a path: a memorial
// is `${CHORUS_URL}/c/<slug>`, where the slug is its Instance's. There is no
// per-memorial URL constant to add here, and there never will be — a new
// memorial is a row in the platform admin.
//
// NOTE: chorus.holoscopic.io does not resolve yet. Set
// NEXT_PUBLIC_CHORUS_URL=http://localhost:4005 to follow these links locally.
export const CHORUS_URL =
  process.env.NEXT_PUBLIC_CHORUS_URL || 'https://chorus.holoscopic.io';

/** The public URL of one memorial. */
export function memorialUrl(slug: string): string {
  return `${CHORUS_URL}/c/${slug}`;
}

// The shape both the player-history rows and the game-map instance share.
type GameRef = { slug: string; gameType?: 'interview' | 'spectrum' };

// The backend flags On a Spectrum rooms as gameType 'spectrum' (from the
// instance's parentInstanceId — the authoritative signal). Fall back to the
// `oas-<code>` slug convention (utils/oasGames.js) if the flag is absent.
export function isSpectrum(game: GameRef): boolean {
  return game.gameType ? game.gameType === 'spectrum' : /^oas-/i.test(game.slug);
}

// The product a game belongs to, for labelling history rows.
export function gameProductName(game: GameRef): string {
  return isSpectrum(game) ? 'On a Spectrum' : 'interView';
}

// The room's collective view on the On a Spectrum app: /g/<CODE>. The room code
// is the slug with its `oas-` prefix stripped, upper-cased — the slug is the
// only place that carries the code.
export function spectrumRoomUrl(slug: string): string {
  const code = slug.replace(/^oas-/i, '').toUpperCase();
  return `${SPECTRUM_URL}/g/${code}`;
}

// The collective map for a game, routed to whichever app owns it.
export function collectiveMapUrl(game: GameRef): string {
  return isSpectrum(game) ? spectrumRoomUrl(game.slug) : `/interview/${game.slug}/topics`;
}
