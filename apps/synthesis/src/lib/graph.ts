import type { SynNode } from './types';

// Client-side mirrors of the server's structural guards
// (apps/backend/utils/synNodes.js) — kept here for immediate UI feedback
// (disable an illegal Marry before the round-trip). The server remains the
// only source of truth; these never replace its checks.

// Reject an edge that would close a loop — same ancestor walk as
// assertAcyclic() server-side, over an in-memory node list.
export function wouldCreateCycle(childId: string, parentIds: string[], nodes: SynNode[]): boolean {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const parents = [...new Set(parentIds)];
  if (parents.includes(childId)) return true;
  const visited = new Set<string>();
  const stack = [...parents];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === childId) return true;
    if (visited.has(id)) continue;
    visited.add(id);
    const node = byId.get(id);
    if (node) for (const p of node.parentIds) stack.push(p);
  }
  return false;
}

// A thought's home hub = nearest topic-kind ancestor (deriveTopicId mirror).
export function deriveTopicId(kind: 'topic' | 'thought', parentDocs: (SynNode | undefined)[]): string | null {
  if (kind === 'topic') return null;
  for (const p of parentDocs) {
    if (!p) continue;
    if (p.kind === 'topic') return p.id;
    if (p.topicId) return p.topicId;
  }
  return null;
}

// Node footprints. Layout owns these (not nodes.tsx) because packing needs a
// width before anything renders; nodes.tsx imports them back so the drawn
// shape and the reserved slot can never drift apart.
export const NODE_W = {
  topicHome: 152,
  topicRoot: 132,
  topicMin: 96,
  thought: 188,
} as const;

// Thought cards are a fixed height: uniform cards read as one class of thing
// across the map, and a deterministic box is what lets the outline be an SVG
// path (the only way to stroke a chamfered silhouette dashed). Claim clamps
// to three lines, meta row to one — see graph/nodes.tsx.
export const THOUGHT_H = 100;

// A hub is a regular hexagon, so its height falls out of its width.
export const hubHeight = (width: number) => Math.round(width * 0.866);

const HUB_TIER_STEP = 18;

// A hub shrinks by how many hubs stand above it, so nesting is legible as
// diminishing size instead of needing a label. Tier counts real hubs only —
// the home hub is the map's root, not a level of nesting, so every top-level
// hub hanging off it is still tier 0 and draws full size.
export function hubWidth(tier: number, isHome: boolean): number {
  if (isHome) return NODE_W.topicHome;
  return Math.max(NODE_W.topicMin, NODE_W.topicRoot - tier * HUB_TIER_STEP);
}

export const ROW_GAP = 172;   // vertical distance between depth rows
const SIB_GAP = 30;           // horizontal clearance between neighbours
const ROOT_GAP = 72;          // extra clearance between separate root trees

export interface LaidOutNode {
  node: SynNode;
  depth: number;
  hubTier: number; // hubs standing above this node (home excluded) — the size step
  width: number;
  x: number;       // top-left, ready for React Flow
  y: number;
}

// Tidy-tree layout (Reingold–Tilford shape, DAG-tolerant).
//
// The previous layout put every node of a given depth in one full-width row
// ordered by parent barycenter, which meant a root's children could land far
// from it and every edge in the map shared one horizontal channel — the
// "which hub owns this thought?" confusion. Here each node's subtree occupies
// a contiguous, non-overlapping band of x, so a parent always sits directly
// above its own children and sibling subtrees can never interleave.
//
// Marriage keeps this a DAG, not a tree, so we pack over a spanning tree
// (each node's first present parent) and then handle the second parent in two
// passes: recenter a marriage node between both of its parents, then sweep
// each row left-to-right pushing apart anything that recentering overlapped.
export function layoutMap(nodes: SynNode[]): LaidOutNode[] {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const present = (id: string) => byId.has(id);

  // Depth = longest path from any root, so a marriage node always sits below
  // both of its parents rather than beside the shallower one.
  const depthCache = new Map<string, number>();
  function depthOf(id: string, guard = new Set<string>()): number {
    if (depthCache.has(id)) return depthCache.get(id)!;
    if (guard.has(id)) return 0; // cycle guard — should never trigger server-side
    guard.add(id);
    const node = byId.get(id);
    if (!node || !node.parentIds.some(present)) {
      depthCache.set(id, 0);
      return 0;
    }
    const d = 1 + Math.max(...node.parentIds.filter(present).map(p => depthOf(p, guard)));
    depthCache.set(id, d);
    return d;
  }

  // How many real hubs stand above this node, walking the primary-parent
  // chain. Drives hub size (hubWidth) — see the comment there for why the
  // home hub doesn't count as a level.
  const tierCache = new Map<string, number>();
  function hubTierOf(id: string, guard = new Set<string>()): number {
    if (tierCache.has(id)) return tierCache.get(id)!;
    if (guard.has(id)) return 0;
    guard.add(id);
    const parentId = byId.get(id)?.parentIds.find(present);
    const parent = parentId ? byId.get(parentId)! : null;
    const tier = parent
      ? hubTierOf(parent.id, guard) + (parent.kind === 'topic' && !parent.isHome ? 1 : 0)
      : 0;
    tierCache.set(id, tier);
    return tier;
  }

  const widthOf = (n: SynNode) =>
    n.kind === 'thought' ? NODE_W.thought : hubWidth(hubTierOf(n.id), !!n.isHome);

  // Spanning tree: every node hangs off its first parent that's actually on
  // this map. A borrowed node whose parent hasn't loaded yet reads as a root.
  const kids = new Map<string, string[]>();
  const roots: SynNode[] = [];
  for (const n of nodes) {
    const parent = n.parentIds.find(present) ?? null;
    if (!parent) { roots.push(n); continue; }
    const list = kids.get(parent);
    if (list) list.push(n.id);
    else kids.set(parent, [n.id]);
  }

  const center = new Map<string, number>();

  function shift(id: string, dx: number, seen = new Set<string>()) {
    if (seen.has(id)) return;
    seen.add(id);
    center.set(id, (center.get(id) ?? 0) + dx);
    for (const k of kids.get(id) ?? []) shift(k, dx, seen);
  }

  // Places `id`'s subtree starting at x = left; returns the width it consumed
  // and sets every descendant's center. A node narrower than its children
  // centers over them; a node wider than them pushes them right to sit under it.
  function place(id: string, left: number, seen = new Set<string>()): number {
    const node = byId.get(id)!;
    const w = widthOf(node);
    const children = seen.has(id) ? [] : (kids.get(id) ?? []);
    seen.add(id);

    if (children.length === 0) {
      center.set(id, left + w / 2);
      return w;
    }

    let cursor = left;
    let total = 0;
    children.forEach((childId, i) => {
      const consumed = place(childId, cursor, seen);
      cursor += consumed + SIB_GAP;
      total += consumed + (i > 0 ? SIB_GAP : 0);
    });

    const first = center.get(children[0])!;
    const last = center.get(children[children.length - 1])!;

    if (total >= w) {
      center.set(id, (first + last) / 2);
      return total;
    }
    const dx = (w - total) / 2;
    for (const childId of children) shift(childId, dx);
    center.set(id, left + w / 2);
    return w;
  }

  let cursor = 0;
  for (const root of roots) cursor += place(root.id, cursor) + ROOT_GAP;

  // A synthesis belongs visually between the two lines it joins.
  for (const n of nodes) {
    if (n.edgeKind !== 'marriage') continue;
    const parentXs = n.parentIds.filter(present).map(p => center.get(p)!);
    if (parentXs.length < 2) continue;
    const target = parentXs.reduce((a, b) => a + b, 0) / parentXs.length;
    shift(n.id, target - center.get(n.id)!);
  }

  // Recentering can overlap a marriage node onto a neighbour. Sweep each row
  // left-to-right and push apart anything closer than its own half-widths.
  const rows = new Map<number, SynNode[]>();
  for (const n of nodes) {
    const d = depthOf(n.id);
    const row = rows.get(d);
    if (row) row.push(n);
    else rows.set(d, [n]);
  }
  for (const row of rows.values()) {
    row.sort((a, b) => center.get(a.id)! - center.get(b.id)!);
    for (let i = 1; i < row.length; i++) {
      const prev = row[i - 1];
      const cur = row[i];
      const min = center.get(prev.id)! + widthOf(prev) / 2 + SIB_GAP + widthOf(cur) / 2;
      if (center.get(cur.id)! < min) center.set(cur.id, min);
    }
  }

  return nodes.map(n => {
    const width = widthOf(n);
    return {
      node: n,
      depth: depthOf(n.id),
      hubTier: hubTierOf(n.id),
      width,
      x: center.get(n.id)! - width / 2,
      y: depthOf(n.id) * ROW_GAP,
    };
  });
}
