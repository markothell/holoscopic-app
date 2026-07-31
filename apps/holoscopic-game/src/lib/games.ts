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
// Set NEXT_PUBLIC_SYNTHESIS_URL=http://localhost:4004 to follow it locally.
export const SYNTHESIS_URL =
  process.env.NEXT_PUBLIC_SYNTHESIS_URL || 'https://synthesis.holoscopic.io';

// Chorus (see apps/chorus, :4005 locally).
//
// One deployment serves every memorial, each addressed by a path: a memorial
// is `${CHORUS_URL}/c/<slug>`, where the slug is its Instance's. There is no
// per-memorial URL constant to add here, and there never will be — a new
// memorial is a row in the platform admin.
//
// Set NEXT_PUBLIC_CHORUS_URL=http://localhost:4005 to follow these locally.
export const CHORUS_URL =
  process.env.NEXT_PUBLIC_CHORUS_URL || 'https://chorus.holoscopic.io';

// All three subdomains resolve and are allowed by the backend's CORS
// (verified 2026-07-31: chorus, synthesis and spectrum return Vercel DNS
// records, and a preflight from chorus.holoscopic.io is accepted). The
// "does not resolve yet" warnings that used to sit above the last two are
// gone because they had stopped being true, and a stale warning costs more
// than no warning — it argues against following a link that works.

/** The public URL of one memorial. */
export function memorialUrl(slug: string): string {
  return `${CHORUS_URL}/c/${slug}`;
}

// Which game an instance belongs to. Mirrors Instance.app on the backend,
// which is the stored answer — read it, never infer (root CLAUDE.md).
export type GameApp = 'interview' | 'spectrum' | 'synthesis' | 'chorus';

// The shape the player-history rows, the game-map instance, and the dashboard's
// joined-editions list all share. `app` is what /instances/mine returns;
// `gameType` is the same value under the name /users/:id/games uses.
type GameRef = { slug: string; app?: GameApp; gameType?: GameApp };

// Resolve a row to its game, preferring the stored field.
//
// The fallback exists for rows predating Instance.app: On a Spectrum rooms are
// created with an `oas-<code>` slug (utils/oasGames.js), which is the only
// other place the answer was ever written down. Everything else defaults to
// interView, matching the schema default.
export function gameApp(game: GameRef): GameApp {
  return game.app || game.gameType || (/^oas-/i.test(game.slug) ? 'spectrum' : 'interview');
}

export function isSpectrum(game: GameRef): boolean {
  return gameApp(game) === 'spectrum';
}

const PRODUCT_NAMES: Record<GameApp, string> = {
  interview: 'interView',
  spectrum: 'On a Spectrum',
  synthesis: 'Synthesis',
  chorus: 'Chorus',
};

// The product a game belongs to, for labelling history and dashboard rows.
export function gameProductName(game: GameRef): string {
  return PRODUCT_NAMES[gameApp(game)];
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

// Where "enter this game" goes, for any of the four apps. Each lives at its
// own origin except interView, which is this app.
export function gameEntryUrl(game: GameRef): string {
  switch (gameApp(game)) {
    case 'chorus': return memorialUrl(game.slug);
    case 'synthesis': return SYNTHESIS_URL;
    case 'spectrum': return spectrumRoomUrl(game.slug);
    default: return `/interview/${game.slug}/topics`;
  }
}

// True when entering leaves this app, so the link needs target/rel and reads
// as a departure rather than a tab.
export function isExternalGame(game: GameRef): boolean {
  return gameApp(game) !== 'interview';
}
