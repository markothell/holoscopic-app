// Pure logic/types borrowed from @hs/activities, per PLAN §7: "the resolve
// interaction is borrowed, not the skin." QUADRANT_POSITIONS and the
// {x,y}∈[0,1] coordinate model + pole-A orientation come straight from the
// shared package; components/resolve/* renders them in Unison's own theme.
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
