/**
 * interView game vocabulary — single place to change a word.
 * Platform models keep their own names (Sequence, Algorithm); game UI
 * renders through these constants. If a second game ever ships, this
 * file is the seam to generalize at.
 */

export const GAME_NAME = 'interView';

export const HOLON_SYMBOL = '◈';

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

/** Builds a game-scoped path: gamePath('interview', 1, 'topics') → /interview/g1/topics */
export function gamePath(slug: string, gameNumber: number | null | undefined, sub?: string): string {
  const seg = `g${gameNumber ?? 1}`;
  return sub ? `/${slug}/${seg}/${sub}` : `/${slug}/${seg}`;
}
