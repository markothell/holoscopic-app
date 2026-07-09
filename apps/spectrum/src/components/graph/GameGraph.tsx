'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  MarkerType,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { NODE_TYPES, THEME_ACCENT } from '@/components/graph/nodes';
import NodeSheet from '@/components/graph/NodeSheet';
import type { Game, Nomination } from '@/lib/types';

// The main view: the topic web. Center = the game topic; ring = subtopics
// sized by stakes; satellites = per-theme maps. Adapted from interView's
// hub graph, restyled paper/ink. Tap a node for its action sheet.

function radialPos(i: number, total: number, radius: number) {
  const angle = total === 1 ? -Math.PI / 2 : (2 * Math.PI * i) / total - Math.PI / 2;
  return { x: Math.round(Math.cos(angle) * radius), y: Math.round(Math.sin(angle) * radius) };
}

function buildGraph(game: Game, nominations: Nomination[]) {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  nodes.push({
    id: 'topic',
    type: 'topic',
    position: { x: -58, y: -58 }, // center the 116px circle on the origin
    data: { label: game.topic },
    draggable: false,
  });

  // Round 1 shows the whole brainstorm; later rounds show survivors only.
  const inRound1 = game.phase === 'round1';
  const subtopics = nominations.filter(n =>
    n.kind === 'subtopic' && (inRound1 || n.status === 'confirmed'));
  const maps = nominations.filter(n => n.kind === 'map');
  const mapsBySubtopic = new Map<string, Nomination[]>();
  for (const m of maps) {
    if (!m.subtopicId) continue;
    if (!mapsBySubtopic.has(m.subtopicId)) mapsBySubtopic.set(m.subtopicId, []);
    mapsBySubtopic.get(m.subtopicId)!.push(m);
  }

  const ringRadius = Math.max(240, 60 * subtopics.length);

  subtopics.forEach((sub, i) => {
    const pos = radialPos(i, subtopics.length, ringRadius);
    nodes.push({
      id: sub.id,
      type: 'subtopic',
      position: { x: pos.x - 70, y: pos.y - 28 },
      data: { nomination: sub, quorum: sub.quorumThreshold },
      draggable: false,
    });
    edges.push({
      id: `topic-${sub.id}`,
      source: 'topic',
      target: sub.id,
      sourceHandle: 'out-c',
      targetHandle: 'in-c',
      type: 'straight',
      style: {
        stroke: sub.status === 'confirmed' ? 'var(--line-strong)' : 'var(--line)',
        strokeWidth: sub.status === 'confirmed' ? 1.5 : 1,
        strokeDasharray: sub.status === 'confirmed' ? undefined : '4 4',
      },
    });

    // Maps orbit their subtopic, fanned outward from the center.
    const subMaps = mapsBySubtopic.get(sub.id) || [];
    subMaps.forEach((m, j) => {
      const baseAngle = Math.atan2(pos.y, pos.x);
      const spread = (j - (subMaps.length - 1) / 2) * 0.45;
      const mx = pos.x + Math.round(Math.cos(baseAngle + spread) * 150);
      const my = pos.y + Math.round(Math.sin(baseAngle + spread) * 150);
      const accent = THEME_ACCENT[m.themeIndex ?? 0];
      nodes.push({
        id: m.id,
        type: 'map',
        position: { x: mx - 56, y: my - 26 },
        data: {
          nomination: m,
          quorum: m.quorumThreshold,
          theme: game.themes[m.themeIndex ?? 0] ?? '',
          live: m.status === 'confirmed' && !!m.mapState,
        },
        draggable: false,
      });
      edges.push({
        id: `${sub.id}-${m.id}`,
        source: sub.id,
        target: m.id,
        sourceHandle: 'out-c',
        targetHandle: 'in-c',
        type: 'straight',
        markerEnd: m.status === 'confirmed' ? { type: MarkerType.ArrowClosed, color: accent } : undefined,
        style: {
          stroke: accent,
          strokeWidth: m.status === 'confirmed' ? 1.5 : 1,
          strokeDasharray: m.status === 'confirmed' ? undefined : '4 4',
          opacity: m.status === 'expired' ? 0.3 : 1,
        },
      });
    });
  });

  return { nodes, edges };
}

interface GraphProps {
  game: Game;
  nominations: Nomination[];
  userId: string;
  balance: number | null;
  onOpenMap: (mapId: string) => void;
  onProposeMap: (subtopicId: string) => void;
}

function GraphInner({
  game,
  nominations,
  userId,
  balance,
  onOpenMap,
  onProposeMap,
}: GraphProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { nodes, edges } = useMemo(() => buildGraph(game, nominations), [game, nominations]);

  // Keep the sheet pointed at fresh data as broadcasts land.
  const selected = useMemo(
    () => nominations.find(n => n.id === selectedId) ?? null,
    [nominations, selectedId],
  );
  useEffect(() => {
    if (selectedId && !selected) setSelectedId(null);
  }, [selectedId, selected]);

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodeClick={(_, node) => { if (node.id !== 'topic') setSelectedId(node.id); }}
        fitView
        fitViewOptions={{ padding: 0.18, maxZoom: 1.1 }}
        panOnScroll
        zoomOnScroll
        minZoom={0.25}
        maxZoom={2.5}
        nodesConnectable={false}
        proOptions={{ hideAttribution: true }}
        style={{ background: 'var(--paper)', width: '100%', height: '100%' }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="rgba(20,18,16,0.12)" />
      </ReactFlow>

      <NodeSheet
        game={game}
        nomination={selected}
        userId={userId}
        balance={balance}
        onClose={() => setSelectedId(null)}
        onOpenMap={onOpenMap}
        onProposeMap={onProposeMap}
      />
    </div>
  );
}

export default function GameGraph(props: GraphProps) {
  return (
    <ReactFlowProvider>
      <GraphInner {...props} />
    </ReactFlowProvider>
  );
}
