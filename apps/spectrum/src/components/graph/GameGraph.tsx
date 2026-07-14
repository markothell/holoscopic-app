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
import type { Game, MapItem, Nomination } from '@/lib/types';

// The main view: the topic web. Center = the game topic; subtopics branch
// out as a recursive tree (round 1 lets you nominate subtopics on subtopics
// to any depth), sized by stakes; per-theme maps orbit each subtopic.
// Adapted from interView's hub graph, restyled paper/ink. Tap a node for its
// action sheet.

const ROOT = 'topic';
const RING0 = 240;      // radius of the first subtopic ring
const RING_STEP = 175;  // added radius per extra level of depth

function buildGraph(game: Game, nominations: Nomination[]) {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  nodes.push({
    id: ROOT,
    type: 'topic',
    position: { x: -58, y: -58 }, // center the 116px circle on the origin
    data: { label: game.topic },
    draggable: false,
  });

  // Round 1 shows the whole brainstorm; later rounds show survivors only.
  const inRound1 = game.phase === 'round1';
  const subtopics = nominations.filter(n =>
    n.kind === 'subtopic' && (inRound1 || n.status === 'confirmed'));
  const visible = new Set(subtopics.map(s => s.id));

  // A subtopic hangs off its parent only when that parent is itself visible;
  // otherwise (e.g. a confirmed child whose parent expired) it reconnects to
  // the root topic so nothing dangles.
  const childrenOf = new Map<string, Nomination[]>();
  for (const sub of subtopics) {
    const key = sub.parentSubtopicId && visible.has(sub.parentSubtopicId)
      ? sub.parentSubtopicId : ROOT;
    if (!childrenOf.has(key)) childrenOf.set(key, []);
    childrenOf.get(key)!.push(sub);
  }

  // Leaf count drives each subtree's angular share, so dense branches get
  // proportionally more of the circle.
  const leafCache = new Map<string, number>();
  function leaves(id: string): number {
    if (leafCache.has(id)) return leafCache.get(id)!;
    const kids = childrenOf.get(id) || [];
    const n = kids.length === 0 ? 1 : kids.reduce((s, k) => s + leaves(k.id), 0);
    leafCache.set(id, n);
    return n;
  }

  // A carried map (round 3–4) hangs off the map it was carried from, not off
  // the subtopic directly — so the web reads as subtopic → round-2 map →
  // round-3 map → round-4 map, the actual lineage. A fresh map (no
  // sourceMapId) roots straight on its subtopic, same as before.
  const maps = nominations.filter(n => n.kind === 'map');
  const mapsByParent = new Map<string, Nomination[]>();
  for (const m of maps) {
    const parentId = m.sourceMapId || m.subtopicId;
    if (!parentId) continue;
    if (!mapsByParent.has(parentId)) mapsByParent.set(parentId, []);
    mapsByParent.get(parentId)!.push(m);
  }

  function attachMaps(parentId: string, x: number, y: number, avoidRadial: boolean) {
    const kids = mapsByParent.get(parentId) || [];
    // A subtopic's children extend radially outward, so a map fanned outward
    // would land on top of a child. When the parent has subtopic children,
    // fan the map tangentially (to the side) instead; a carried map's own
    // children (it has none) never compete for that ray, so they fan straight
    // out from their source map.
    const radial = Math.atan2(y, x);
    const baseAngle = avoidRadial ? radial + Math.PI / 2 : radial;
    kids.forEach((m, j) => {
      const spread = (j - (kids.length - 1) / 2) * 0.5;
      const mx = x + Math.round(Math.cos(baseAngle + spread) * 155);
      const my = y + Math.round(Math.sin(baseAngle + spread) * 155);
      const accent = THEME_ACCENT[m.themeIndex ?? 0];
      nodes.push({
        id: m.id,
        type: 'map',
        position: { x: mx - 56, y: my - 26 },
        data: {
          nomination: m,
          quorum: m.quorumThreshold,
          theme: game.themes[m.themeIndex ?? 0] ?? '',
          live: m.status === 'confirmed' &&
            (m.mapState?.stage === 'gather' || m.mapState?.stage === 'rank'),
        },
        draggable: false,
      });
      edges.push({
        id: `${parentId}-${m.id}`,
        source: parentId,
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
      attachMaps(m.id, mx, my, false);
    });
  }

  // Lay a parent's children out across its angular sector, recursing so each
  // grandchild fans out around its own parent's outward ray.
  function layout(parentKey: string, depth: number, a0: number, a1: number) {
    const kids = childrenOf.get(parentKey) || [];
    if (kids.length === 0) return;
    const totalLeaves = kids.reduce((s, k) => s + leaves(k.id), 0);
    const span = a1 - a0;
    let cursor = a0;
    const radius = RING0 + (depth - 1) * RING_STEP;

    for (const sub of kids) {
      const frac = leaves(sub.id) / totalLeaves;
      const secStart = cursor;
      const secEnd = cursor + span * frac;
      cursor = secEnd;
      const mid = (secStart + secEnd) / 2;
      const x = Math.round(Math.cos(mid) * radius);
      const y = Math.round(Math.sin(mid) * radius);

      nodes.push({
        id: sub.id,
        type: 'subtopic',
        position: { x: x - 70, y: y - 28 },
        data: { nomination: sub, quorum: sub.quorumThreshold },
        draggable: false,
      });
      edges.push({
        id: `${parentKey}-${sub.id}`,
        source: parentKey,
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

      const hasChildren = (childrenOf.get(sub.id)?.length ?? 0) > 0;
      attachMaps(sub.id, x, y, hasChildren);
      layout(sub.id, depth + 1, secStart, secEnd);
    }
  }

  // Top-level subtopics span the full circle, starting from the top.
  layout(ROOT, 1, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI);

  return { nodes, edges };
}

interface GraphProps {
  game: Game;
  nominations: Nomination[];
  userId: string;
  balance: number | null;
  onOpenMap: (mapId: string) => void;
  onProposeMap: (subtopicId: string) => void;
  onBranchSubtopic: (parentSubtopicId: string) => void;
  onCarry?: (source: { mapNom: Nomination; item: MapItem }) => void;
}

function GraphInner({
  game,
  nominations,
  userId,
  balance,
  onOpenMap,
  onProposeMap,
  onBranchSubtopic,
  onCarry,
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
        nominations={nominations}
        nomination={selected}
        userId={userId}
        balance={balance}
        onClose={() => setSelectedId(null)}
        onOpenMap={onOpenMap}
        onProposeMap={onProposeMap}
        onBranchSubtopic={onBranchSubtopic}
        onCarry={onCarry}
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
