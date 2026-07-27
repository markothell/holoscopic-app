import type { UnisonNode } from './types';

// Client-side mirrors of the server's structural guards
// (apps/backend/utils/unisonNodes.js) — kept here for immediate UI feedback
// (disable an illegal Marry before the round-trip). The server remains the
// only source of truth; these never replace its checks.

// Reject an edge that would close a loop — same ancestor walk as
// assertAcyclic() server-side, over an in-memory node list.
export function wouldCreateCycle(childId: string, parentIds: string[], nodes: UnisonNode[]): boolean {
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
export function deriveTopicId(kind: 'topic' | 'thought', parentDocs: (UnisonNode | undefined)[]): string | null {
  if (kind === 'topic') return null;
  for (const p of parentDocs) {
    if (!p) continue;
    if (p.kind === 'topic') return p.id;
    if (p.topicId) return p.topicId;
  }
  return null;
}

export interface LaidOutNode {
  node: UnisonNode;
  depth: number;
  x: number;
  y: number;
}

const COL_WIDTH = 220;
const ROW_HEIGHT = 160;

// A simple layered (Sugiyama-lite) DAG layout: depth = longest path from any
// root, nodes at a depth are spread left-to-right, marriage nodes center
// between their two parents where possible. Good enough for a private map at
// M0 scale; OaS's radial layout doesn't apply here since Unison's graph is a
// DAG (marriage = two parents), not a tree.
export function layoutMap(nodes: UnisonNode[]): LaidOutNode[] {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const depthCache = new Map<string, number>();

  function depthOf(id: string, guard = new Set<string>()): number {
    if (depthCache.has(id)) return depthCache.get(id)!;
    if (guard.has(id)) return 0; // cycle guard — should never trigger server-side
    guard.add(id);
    const node = byId.get(id);
    if (!node || node.parentIds.length === 0) {
      depthCache.set(id, 0);
      return 0;
    }
    const d = 1 + Math.max(...node.parentIds.map(p => (byId.has(p) ? depthOf(p, guard) : -1)));
    depthCache.set(id, d);
    return d;
  }

  const byDepth = new Map<number, UnisonNode[]>();
  for (const n of nodes) {
    const d = depthOf(n.id);
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d)!.push(n);
  }

  const positions = new Map<string, { x: number; y: number }>();
  const maxDepth = Math.max(0, ...[...byDepth.keys()]);
  for (let d = 0; d <= maxDepth; d++) {
    const row = byDepth.get(d) || [];
    // Marriage nodes try to center over the mean x of their parents; other
    // nodes keep insertion order. Sorting by a target x approximates a
    // barycenter layout without a full Sugiyama pass.
    const withTarget = row.map(n => {
      if (n.parentIds.length > 0) {
        const parentXs = n.parentIds.map(p => positions.get(p)?.x).filter((v): v is number => v !== undefined);
        if (parentXs.length) return { n, target: parentXs.reduce((a, b) => a + b, 0) / parentXs.length };
      }
      return { n, target: 0 };
    });
    withTarget.sort((a, b) => a.target - b.target);
    const count = withTarget.length;
    withTarget.forEach(({ n }, i) => {
      const x = (i - (count - 1) / 2) * COL_WIDTH;
      positions.set(n.id, { x, y: d * ROW_HEIGHT });
    });
  }

  return nodes.map(n => ({ node: n, depth: depthOf(n.id), ...positions.get(n.id)! }));
}
