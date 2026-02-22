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

  const nodes: Node[] = activities.map((activity) => {
    const pos = g.node(activity.activityId);
    return {
      id: activity.activityId,
      type: 'activityNode',
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
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
