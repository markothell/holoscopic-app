'use client';

import { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  type NodeTypes,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useRouter } from 'next/navigation';
import type { SequenceActivity } from '@/models/Sequence';
import { getLayoutedElements } from '@/utils/dagLayout';
import ActivityNode from './ActivityNode';

interface SequenceGraphViewProps {
  activities: SequenceActivity[];
  sequenceId: string;
  isEnrolled: boolean;
}

const nodeTypes: NodeTypes = {
  activityNode: ActivityNode,
};

export default function SequenceGraphView({
  activities,
  sequenceId,
  isEnrolled,
}: SequenceGraphViewProps) {
  const router = useRouter();

  const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(
    () => getLayoutedElements(activities),
    [activities]
  );

  const [nodes, , onNodesChange] = useNodesState(layoutedNodes);
  const [edges, , onEdgesChange] = useEdgesState(layoutedEdges);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const activity = node.data.activity as SequenceActivity;
      const act = activity.activity;
      if (act && activity.openedAt && isEnrolled) {
        router.push(`/${act.urlName}?sequence=${sequenceId}`);
      }
    },
    [router, sequenceId, isEnrolled]
  );

  return (
    <div className="w-full h-[500px] rounded-lg overflow-hidden" style={{ background: '#F7F4EF', border: '1px solid #D9D4CC' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.3}
        maxZoom={1.5}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
      >
        <Background variant={BackgroundVariant.Dots} color="#D9D4CC" gap={20} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
