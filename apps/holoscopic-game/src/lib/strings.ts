/**
 * interView game vocabulary — single place to change a word.
 * Platform models keep their own names (Sequence, Algorithm); game UI
 * renders through these constants. If a second game ever ships, this
 * file is the seam to generalize at.
 */

export const GAME_NAME = 'interView';

export const HOLON_SYMBOL = '◈';

// Balance readout. In explore-mode instances the economy is off, so the
// balance shows ∞ instead of a number; otherwise the numeric balance (or
// `fallback` when it hasn't loaded yet).
export function holonAmount(
  balance: number | null | undefined,
  explore?: boolean,
  fallback = '0',
): string {
  if (explore) return '∞';
  return balance === null || balance === undefined ? fallback : String(balance);
}

export const STR = {
  topic: 'Topic',
  topics: 'Topics',
  frame: 'Frame',
  frames: 'Frames',
  frameLong: 'Frame of Reference',
  pattern: 'Pattern',
  patterns: 'Patterns',
  map: 'Map',
  maps: 'Maps',
  holon: 'Holon',
  holons: 'Holons',
  rules: 'How to play',
} as const;

/** Builds a game-scoped path: gamePath('america', 'topics') → /interview/america/topics */
export function gamePath(session: string, sub?: string): string {
  return sub ? `/interview/${session}/${sub}` : `/interview/${session}`;
}
