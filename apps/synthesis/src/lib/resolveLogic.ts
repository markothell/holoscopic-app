// Pure logic/types borrowed from @hs/activities, per PLAN §7: "the resolve
// interaction is borrowed, not the skin." QUADRANT_POSITIONS and the
// {x,y}∈[0,1] coordinate model + pole-A orientation come straight from the
// shared package; components/resolve/* renders them in Synthesis's own theme.
export { QUADRANT_POSITIONS, getQuadrantFromPosition } from '@hs/activities';

export type Quadrant = 1 | 2 | 3 | 4;

export interface ResolvePosition {
  x: number; // [0,1]
  y: number; // [0,1]
}

// A thought's response grid: 1 axis (poleA/poleB) → a ranked line, 2 axes →
// a quadrant. axes[0] = x, axes[1] = y (if present) — mirrors OaS's
// FrameRef ordering convention (nominationAxes in FrameGlyph.tsx).
export interface ResolveAxis {
  frameId: string;
  poleA: string; // the "most" end — filled dot, right on x / top on y
  poleB: string;
}

// ── The one-axis scale ──────────────────────────────────────────────────
// A ranked line has a fixed number of stops, and the composer and the
// aggregate share it: you place your stance on a stop, and that is exactly
// the column it stacks into when the reply map draws. A continuous capture
// read as more precise than the display could honour — your dot landed
// somewhere you didn't put it. Odd count, so there is a true centre stop.
export const LINE_STOPS = 5;

// Stop index → the x it stores. Stops sit at bin centres so the stored
// value round-trips through binOf() unchanged.
export const stopPosition = (i: number) => (i + 0.5) / LINE_STOPS;

// x → which stop it belongs to. Tolerates any x in [0,1], including values
// stored before this rule existed.
export const binOf = (x: number) =>
  Math.min(LINE_STOPS - 1, Math.max(0, Math.floor(x * LINE_STOPS)));
