import dagre from 'dagre';
import type { Node, Edge } from '@xyflow/react';
import type { SequenceActivity } from '@/models/Sequence';

const NODE_WIDTH = 140;
const NODE_HEIGHT = 140;

interface LayoutOptions {
  direction?: 'TB' | 'LR';
  nodesep?: number;
  ranksep?: number;
}

export function getLayoutedElements(
  activities: SequenceActivity[],
  options: LayoutOptions = {}
): { nodes: Node[]; edges: Edge[] } {
  const {
    direction = 'TB',
    nodesep = 80,
    ranksep = 120,
  } = options;

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, nodesep, ranksep, align: 'UL' });

  // Add nodes
  activities.forEach((activity) => {
    g.setNode(activity.activityId, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  // Add edges from parentActivityIds
  activities.forEach((activity) => {
    const parents = activity.parentActivityIds || [];
    parents.forEach((parentId) => {
      // Only add edge if parent exists in this sequence
      if (activities.some((a) => a.activityId === parentId)) {
        g.setEdge(parentId, activity.activityId);
      }
    });
  });

  dagre.layout(g);

  // If any activity has a round assigned, post-process y-positions.
  // Round always overrides DAG rank; activities without a round keep dagre's y.
  const hasRounds = activities.some((a) => a.round != null);
  const roundYCache: Record<number, number> = {};
  if (hasRounds) {
    // Build a sorted list of unique rounds to compute consistent y offsets
    const rounds = [...new Set(
      activities.filter((a) => a.round != null).map((a) => a.round as number)
    )].sort((a, b) => a - b);
    rounds.forEach((r, i) => {
      roundYCache[r] = i * (NODE_HEIGHT + ranksep);
    });
  }

  const nodes: Node[] = activities.map((activity) => {
    const pos = g.node(activity.activityId);
    const y = hasRounds && activity.round != null
      ? roundYCache[activity.round]
      : pos.y - NODE_HEIGHT / 2;
    return {
      id: activity.activityId,
      type: 'activityNode',
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y,
      },
      data: { activity },
    };
  });

  const edges: Edge[] = [];
  activities.forEach((activity) => {
    const parents = activity.parentActivityIds || [];
    parents.forEach((parentId) => {
      if (activities.some((a) => a.activityId === parentId)) {
        edges.push({
          id: `${parentId}-${activity.activityId}`,
          source: parentId,
          target: activity.activityId,
          type: 'default',
          style: { stroke: '#D9D4CC', strokeWidth: 2 },
        });
      }
    });
  });

  return { nodes, edges };
}
