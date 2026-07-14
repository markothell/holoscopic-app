'use client';

// PlayerMap — a player's redacted activity map for one game.
// Radial tree: player → topics → activities → entries. The player's own
// entries render emerald; entries they voted for render blue and arrive
// author-stripped from the server (the map is about this player only).
// Frames and patterns the player authored hang directly off the center.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  Background,
  BackgroundVariant,
  Handle,
  Position,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { GameMapResponse, GameMapEntry } from '@/services/userService';
import { STR } from '@/lib/strings';
import { btn, mono } from '@/lib/ui';
import { collectiveMapUrl } from '@/lib/games';

type PMData = {
  label: string;
  kind: 'player' | 'topic' | 'activity' | 'entry-own' | 'entry-voted' | 'frame' | 'pattern';
  meta: Record<string, unknown>;
  [key: string]: unknown;
};

const OWN_COLOR = 'var(--accent-emerald)';
const VOTED_COLOR = '#3D6FA3';

const tintOver = (tint: string) => `linear-gradient(${tint}, ${tint}), var(--bg-primary)`;

function PlayerNode({ data }: { data: PMData }) {
  return (
    <div style={{
      width: 104, height: 104, borderRadius: '50%',
      background: 'var(--bg-secondary)',
      border: '2px solid var(--accent)',
      boxShadow: '0 0 0 5px rgba(200,59,80,0.06), 0 1px 4px rgba(15,13,11,0.08)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'default', textAlign: 'center', padding: '0.5rem',
    }}>
      <span style={{
        fontSize: 'var(--text-2xs)', fontFamily: mono,
        letterSpacing: '0.1em', textTransform: 'uppercase' as const,
        color: 'var(--accent)', lineHeight: 1.3,
        display: '-webkit-box', WebkitLineClamp: 3,
        WebkitBoxOrient: 'vertical' as const, overflow: 'hidden', wordBreak: 'break-word' as const,
      }}>{data.label}</span>
      <Handle id="out" type="source" position={Position.Top} style={{ opacity: 0, left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }} />
    </div>
  );
}

function CardNode({ data }: { data: PMData }) {
  const { kind, meta } = data;
  const palette: Record<string, { text: string; border: string; bg: string; caps: string }> = {
    topic:   { text: 'var(--node-topic)',   border: 'rgba(200,59,80,0.4)',   bg: tintOver('rgba(200,59,80,0.06)'),   caps: STR.topic.toUpperCase() },
    activity:{ text: 'var(--node-topic)',   border: 'rgba(200,59,80,0.4)',   bg: tintOver('rgba(200,59,80,0.06)'),   caps: STR.map.toUpperCase() },
    frame:   { text: 'var(--node-frame)',   border: 'rgba(154,123,47,0.42)', bg: tintOver('rgba(154,123,47,0.07)'),  caps: STR.frame.toUpperCase() },
    pattern: { text: 'var(--node-pattern)', border: 'rgba(61,111,163,0.42)', bg: tintOver('rgba(61,111,163,0.07)'),  caps: STR.pattern.toUpperCase() },
  };
  const p = palette[kind] ?? palette.topic;

  return (
    <div style={{
      width: 150, background: p.bg,
      border: `1px solid ${p.border}`,
      borderRadius: 8, padding: '0.45rem 0.65rem',
      cursor: meta.href || meta.popup ? 'pointer' : 'default',
      boxShadow: '0 1px 3px rgba(15,13,11,0.05)',
    }}>
      <div style={{
        fontSize: 'var(--text-2xs)', fontFamily: mono, letterSpacing: '0.1em',
        color: p.text, textTransform: 'uppercase' as const, marginBottom: '0.18rem',
      }}>
        {p.caps}
      </div>
      <div style={{ fontSize: 'var(--text-xs)', fontFamily: mono, color: 'var(--text-primary)', lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden', wordBreak: 'break-word' as const }}>
        {data.label}
      </div>
      {typeof meta.subtitle === 'string' && meta.subtitle && (
        <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', marginTop: '0.18rem', fontFamily: mono }}>
          {meta.subtitle}
        </div>
      )}
      <Handle id="in" type="target" position={Position.Top} style={{ opacity: 0, left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }} />
      <Handle id="out" type="source" position={Position.Top} style={{ opacity: 0, left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }} />
    </div>
  );
}

function EntryNode({ data }: { data: PMData }) {
  const own = data.kind === 'entry-own';
  const c = own ? OWN_COLOR : VOTED_COLOR;
  return (
    <div style={{
      width: 128, background: 'var(--bg-primary)',
      border: `1.5px solid ${c}`,
      borderRadius: 8, padding: '0.4rem 0.55rem', cursor: 'pointer',
      boxShadow: '0 1px 3px rgba(15,13,11,0.05)',
    }}>
      <div style={{ fontSize: 'var(--text-2xs)', fontFamily: mono, letterSpacing: '0.08em', color: c, textTransform: 'uppercase' as const, marginBottom: '0.15rem' }}>
        {own ? 'Entry' : 'Voted for'}
      </div>
      <div style={{ fontSize: 'var(--text-xs)', fontFamily: mono, color: 'var(--text-primary)', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden', wordBreak: 'break-word' as const }}>
        {data.label}
      </div>
      {typeof data.meta.votes === 'number' && data.meta.votes > 0 && (
        <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', marginTop: '0.15rem', fontFamily: mono }}>
          ▲ {data.meta.votes}
        </div>
      )}
      <Handle id="in" type="target" position={Position.Top} style={{ opacity: 0, left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }} />
    </div>
  );
}

const NODE_TYPES = { player: PlayerNode, card: CardNode, entry: EntryNode };

// ─── Layout ──────────────────────────────────────────────────────────────────
// Leaf-weighted radial tree. Every top-level item (topic, orphan activity,
// frame, pattern) gets an angular span proportional to its leaf count;
// children sit at the mid-angles of their sub-spans.

const R_TIER1 = 230;
const R_TIER2 = 430;
const R_TIER3 = 610;

function polar(angle: number, radius: number) {
  return { x: Math.round(Math.cos(angle) * radius), y: Math.round(Math.sin(angle) * radius) };
}

function buildGraph(map: GameMapResponse) {
  const nodes: Node<PMData>[] = [];
  const edges: Edge[] = [];

  const edge = (source: string, target: string, color = 'rgba(15,13,11,0.18)'): Edge => ({
    id: `e-${source}-${target}`, source, target,
    sourceHandle: 'out', targetHandle: 'in', type: 'straight',
    style: { stroke: color, strokeWidth: 1 }, animated: false,
  });

  nodes.push({
    id: 'player', type: 'player', position: { x: -52, y: -52 },
    data: { label: map.user.name || 'Player', kind: 'player', meta: {} },
  });

  const topicById = Object.fromEntries(map.topics.map(t => [t.id, t]));
  const entriesByActivity = new Map<string, { own: GameMapEntry[]; voted: GameMapEntry[] }>();
  const bucket = (activityId: string) => {
    if (!entriesByActivity.has(activityId)) entriesByActivity.set(activityId, { own: [], voted: [] });
    return entriesByActivity.get(activityId)!;
  };
  map.ownEntries.forEach(e => bucket(e.activityId).own.push(e));
  map.votedEntries.forEach(e => bucket(e.activityId).voted.push(e));

  // Group activities under their topic; topicless activities are top-level
  type ActivityItem = { kind: 'activity'; activity: GameMapResponse['activities'][number]; leaves: number };
  type TopItem =
    | { kind: 'topic'; topic: GameMapResponse['topics'][number]; activities: ActivityItem[]; leaves: number }
    | ActivityItem
    | { kind: 'frame'; frame: GameMapResponse['frames'][number]; leaves: number }
    | { kind: 'pattern'; pattern: GameMapResponse['patterns'][number]; leaves: number };

  const actItem = (a: GameMapResponse['activities'][number]): ActivityItem => {
    const b = entriesByActivity.get(a.id) ?? { own: [], voted: [] };
    return { kind: 'activity', activity: a, leaves: Math.max(1, b.own.length + b.voted.length) };
  };

  const byTopic = new Map<string, ActivityItem[]>();
  const orphans: ActivityItem[] = [];
  for (const a of map.activities) {
    const item = actItem(a);
    if (a.topicId && topicById[a.topicId]) {
      if (!byTopic.has(a.topicId)) byTopic.set(a.topicId, []);
      byTopic.get(a.topicId)!.push(item);
    } else {
      orphans.push(item);
    }
  }

  const top: TopItem[] = [
    ...[...byTopic.entries()].map(([topicId, acts]) => ({
      kind: 'topic' as const,
      topic: topicById[topicId],
      activities: acts,
      leaves: acts.reduce((s, a) => s + a.leaves, 0),
    })),
    ...orphans,
    ...map.frames.map(frame => ({ kind: 'frame' as const, frame, leaves: 1 })),
    ...map.patterns.map(pattern => ({ kind: 'pattern' as const, pattern, leaves: 1 })),
  ];

  const totalLeaves = Math.max(1, top.reduce((s, t) => s + t.leaves, 0));
  let cursor = -Math.PI / 2; // start at 12 o'clock, walk clockwise

  const placeEntries = (parentId: string, activityId: string, start: number, span: number) => {
    const b = entriesByActivity.get(activityId) ?? { own: [], voted: [] };
    const all = [
      ...b.own.map(e => ({ e, own: true })),
      ...b.voted.map(e => ({ e, own: false })),
    ];
    all.forEach((item, i) => {
      const angle = start + span * ((i + 0.5) / all.length);
      const { x, y } = polar(angle, R_TIER3);
      const id = `entry-${item.e.id}`;
      nodes.push({
        id, type: 'entry', position: { x: x - 64, y: y - 26 },
        data: {
          label: item.e.objectName || (item.e.text ? item.e.text.slice(0, 60) : 'Entry'),
          kind: item.own ? 'entry-own' : 'entry-voted',
          meta: { popup: true, entry: item.e, votes: item.e.voteCount || 0 },
        },
      });
      edges.push(edge(parentId, id, item.own ? 'rgba(14,143,102,0.35)' : 'rgba(61,111,163,0.35)'));
    });
  };

  const placeActivity = (parentId: string, item: ActivityItem, start: number, span: number) => {
    const mid = start + span / 2;
    const { x, y } = polar(mid, R_TIER2);
    const id = `act-${item.activity.id}`;
    const b = entriesByActivity.get(item.activity.id) ?? { own: [], voted: [] };
    nodes.push({
      id, type: 'card', position: { x: x - 75, y: y - 30 },
      data: {
        label: item.activity.title,
        kind: 'activity',
        meta: {
          href: `/a/${item.activity.urlName}`,
          subtitle: `${b.own.length} ${b.own.length === 1 ? 'entry' : 'entries'} · ${b.voted.length} voted`,
        },
      },
    });
    edges.push(edge(parentId, id));
    placeEntries(id, item.activity.id, start, span);
  };

  for (const item of top) {
    const span = 2 * Math.PI * (item.leaves / totalLeaves);
    const mid = cursor + span / 2;

    if (item.kind === 'topic') {
      const { x, y } = polar(mid, R_TIER1);
      const id = `topic-${item.topic.id}`;
      nodes.push({
        id, type: 'card', position: { x: x - 75, y: y - 30 },
        data: { label: item.topic.title, kind: 'topic', meta: { subtitle: item.topic.status === 'confirmed' ? 'open' : item.topic.status } },
      });
      edges.push(edge('player', id));
      let childCursor = cursor;
      for (const act of item.activities) {
        const childSpan = span * (act.leaves / item.leaves);
        placeActivity(id, act, childCursor, childSpan);
        childCursor += childSpan;
      }
    } else if (item.kind === 'activity') {
      // Topicless map hangs straight off the player at tier 1
      const { x, y } = polar(mid, R_TIER1);
      const id = `act-${item.activity.id}`;
      const b = entriesByActivity.get(item.activity.id) ?? { own: [], voted: [] };
      nodes.push({
        id, type: 'card', position: { x: x - 75, y: y - 30 },
        data: {
          label: item.activity.title,
          kind: 'activity',
          meta: {
            href: `/a/${item.activity.urlName}`,
            subtitle: `${b.own.length} ${b.own.length === 1 ? 'entry' : 'entries'} · ${b.voted.length} voted`,
          },
        },
      });
      edges.push(edge('player', id));
      placeEntries(id, item.activity.id, cursor, span);
    } else if (item.kind === 'frame') {
      const { x, y } = polar(mid, R_TIER1);
      const id = `frame-${item.frame.id}`;
      nodes.push({
        id, type: 'card', position: { x: x - 75, y: y - 30 },
        data: { label: `${item.frame.xLabel} / ${item.frame.yLabel}`, kind: 'frame', meta: { subtitle: 'authored' } },
      });
      edges.push(edge('player', id, 'rgba(154,123,47,0.3)'));
    } else {
      const { x, y } = polar(mid, R_TIER1);
      const id = `pattern-${item.pattern.id}`;
      nodes.push({
        id, type: 'card', position: { x: x - 75, y: y - 30 },
        data: { label: item.pattern.title, kind: 'pattern', meta: { href: `/patterns/${item.pattern.id}`, subtitle: 'published' } },
      });
      edges.push(edge('player', id, 'rgba(61,111,163,0.3)'));
    }

    cursor += span;
  }

  return { nodes, edges };
}

// ─── Component ───────────────────────────────────────────────────────────────

function EntryPopup({ entry, own, onClose }: { entry: GameMapEntry; own: boolean; onClose: () => void }) {
  const c = own ? OWN_COLOR : VOTED_COLOR;
  return (
    <div style={{
      position: 'absolute', top: '1.25rem', right: '1.25rem', width: 300, zIndex: 200,
      background: 'var(--bg-secondary)', border: '1px solid var(--border-default)',
      borderRadius: 14, padding: '1.1rem 1.25rem',
      boxShadow: '0 12px 40px rgba(15,13,11,0.16)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
        <div style={{ fontSize: 'var(--text-2xs)', fontFamily: mono, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: c }}>
          {own ? 'Their entry' : 'They voted for this'}
        </div>
        <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1, padding: 0 }}>×</button>
      </div>
      {entry.objectName && (
        <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 0.4rem', lineHeight: 1.3 }}>{entry.objectName}</h3>
      )}
      {entry.text && (
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: '0 0 0.5rem', lineHeight: 1.5 }}>{entry.text}</p>
      )}
      <div style={{ fontSize: 'var(--text-2xs)', fontFamily: mono, color: 'var(--text-muted)' }}>
        ▲ {entry.voteCount || 0} {entry.voteCount === 1 ? 'vote' : 'votes'}
      </div>
    </div>
  );
}

function PlayerMapInner({ map }: { map: GameMapResponse }) {
  const { fitView } = useReactFlow();
  const [popup, setPopup] = useState<{ entry: GameMapEntry; own: boolean } | null>(null);

  const { nodes, edges } = useMemo(() => buildGraph(map), [map]);

  useEffect(() => {
    const t = setTimeout(() => fitView({ padding: 0.15, duration: 450 }), 80);
    return () => clearTimeout(t);
  }, [fitView, nodes.length]);

  const handleNodeClick = (_: unknown, node: Node) => {
    const data = node.data as PMData;
    if (data.kind === 'entry-own' || data.kind === 'entry-voted') {
      setPopup({ entry: data.meta.entry as GameMapEntry, own: data.kind === 'entry-own' });
      return;
    }
    if (typeof data.meta.href === 'string') {
      window.location.href = data.meta.href;
    }
  };

  const isEmpty = map.activities.length === 0 && map.frames.length === 0 && map.patterns.length === 0;

  // Nothing to plot: skip the radial canvas entirely and show a single, calm
  // centered panel over the paper dots — no player node to collide with.
  if (isEmpty) {
    return (
      <div style={{
        position: 'relative', width: '100%', height: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundImage: 'radial-gradient(rgba(15,13,11,0.12) 1px, transparent 1px)',
        backgroundSize: '26px 26px',
      }}>
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem',
          textAlign: 'center', padding: '2rem',
        }}>
          <div style={{
            width: 88, height: 88, borderRadius: '50%',
            background: 'var(--bg-secondary)', border: '2px solid var(--accent)',
            boxShadow: '0 0 0 5px rgba(200,59,80,0.06), 0 1px 4px rgba(15,13,11,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{
              fontSize: 'var(--text-lg)', fontFamily: mono, letterSpacing: '0.08em',
              textTransform: 'uppercase' as const, color: 'var(--accent)',
            }}>
              {(map.user.name || 'Player').charAt(0).toUpperCase()}
            </span>
          </div>
          <p style={{ margin: 0, fontFamily: mono, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            No activity in this game yet.
          </p>
          {map.instance && (
            <Link href={collectiveMapUrl(map.instance)} style={{ ...btn('outline'), textDecoration: 'none' }}>
              Open the collective map →
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodeClick={handleNodeClick}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
        minZoom={0.15}
      >
        <Background variant={BackgroundVariant.Dots} gap={26} size={1} color="rgba(15,13,11,0.12)" />
      </ReactFlow>

      {/* Legend */}
      <div style={{
        position: 'absolute', bottom: '1rem', left: '1rem', zIndex: 150,
        display: 'flex', gap: '1rem', alignItems: 'center',
        background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)',
        borderRadius: 10, padding: '0.5rem 0.85rem',
        fontSize: 'var(--text-2xs)', fontFamily: mono, color: 'var(--text-muted)',
        letterSpacing: '0.06em', textTransform: 'uppercase' as const,
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: OWN_COLOR, display: 'inline-block' }} />
          Their entries
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: VOTED_COLOR, display: 'inline-block' }} />
          Voted for
        </span>
      </div>

      {popup && <EntryPopup entry={popup.entry} own={popup.own} onClose={() => setPopup(null)} />}
    </div>
  );
}

export default function PlayerMap({ map }: { map: GameMapResponse }) {
  return (
    <ReactFlowProvider>
      <PlayerMapInner map={map} />
    </ReactFlowProvider>
  );
}
