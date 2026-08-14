'use client';

import { useMemo } from 'react';
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, MarkerType,
  type Node, type BuiltInEdge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { NODE_TYPES, type SynNodeData } from './nodes';
import { layoutMap } from '@/lib/graph';
import type { SynNode } from '@/lib/types';

// D18: another collaborator's published thinking, AS A MAP — the same
// tidy-tree layout and node vocabulary as My Map, with every editing gesture
// absent. You arrive at how someone is thinking, laid out the way they laid
// it out; tapping a thought opens its post (the read surface), and that is
// the whole interaction. The server already filtered to what may be shown
// (published thoughts + the hub labels they hang under), so there is nothing
// here to hide — only to render.
export default function ReadonlyMap({ nodes, onOpenThought }: {
  nodes: SynNode[];
  onOpenThought: (nodeId: string) => void;
}) {
  const { flowNodes, flowEdges } = useMemo(() => {
    const laid = layoutMap(nodes);
    const onMap = new Set(nodes.map(n => n.id));

    const flowNodes: Node[] = laid.map(({ node, x, y, hubTier }) => ({
      id: node.id,
      type: node.kind,
      position: { x, y },
      data: {
        synthesisNode: node,
        selected: false,
        marryMode: false,
        eligible: true,
        hubTier,
        inSynthesis: false,
        onOpenSource: () => {},
      } satisfies SynNodeData,
      draggable: false,
    }));

    const flowEdges: BuiltInEdge[] = [];
    for (const node of nodes) {
      const isMarriage = node.edgeKind === 'marriage';
      const stroke = isMarriage ? 'var(--join)' : 'var(--line-strong)';
      node.parentIds.filter(p => onMap.has(p)).forEach((parentId, i) => {
        flowEdges.push({
          id: `${parentId}-${node.id}-${i}`,
          source: parentId,
          target: node.id,
          type: 'smoothstep',
          pathOptions: { borderRadius: 18 },
          markerEnd: { type: MarkerType.ArrowClosed, color: stroke, width: 14, height: 14 },
          style: { stroke, strokeWidth: isMarriage ? 1.75 : 1.25, opacity: isMarriage ? 0.9 : 0.75 },
        });
      });
    }

    return { flowNodes, flowEdges };
  }, [nodes]);

  return (
    <div
      className="h-[56vh] w-full overflow-hidden rounded-2xl border"
      style={{ borderColor: 'var(--line-strong)', background: 'var(--dusk-deep)' }}
    >
      <ReactFlowProvider>
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={NODE_TYPES}
          onNodeClick={(_, n) => {
            const syn = nodes.find(x => x.id === n.id);
            if (syn?.kind === 'thought') onOpenThought(n.id);
          }}
          fitView
          fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
          panOnScroll
          zoomOnScroll
          minZoom={0.2}
          maxZoom={1.6}
          nodesConnectable={false}
          proOptions={{ hideAttribution: true }}
          style={{ background: 'transparent', width: '100%', height: '100%' }}
        >
          <Background variant={BackgroundVariant.Dots} gap={26} size={1} color="rgba(236,231,245,0.08)" />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
