'use client';

import { Handle, Position } from '@xyflow/react';
import type { Nomination } from '@/lib/types';

// Graph node components — paper/ink editorial takes on the interView hub
// nodes. Handles are invisible and center-anchored so edges run node
// center to node center.

export type TopicNodeData = { label: string; [key: string]: unknown };
export type SubtopicNodeData = { nomination: Nomination; quorum: number; [key: string]: unknown };
export type MapNodeData = {
  nomination: Nomination;
  quorum: number;
  theme: string;
  live: boolean;
  [key: string]: unknown;
};

export const THEME_ACCENT = ['var(--x-accent)', 'var(--y-accent)', 'var(--z-accent)'];
export const THEME_SOFT = ['var(--x-soft)', 'var(--y-soft)', 'var(--z-soft)'];

const hiddenCenter = {
  opacity: 0,
  left: '50%',
  top: '50%',
  transform: 'translate(-50%, -50%)',
} as const;

function CenterHandles() {
  return (
    <>
      <Handle id="in-c" type="target" position={Position.Top} style={hiddenCenter} />
      <Handle id="out-c" type="source" position={Position.Top} style={hiddenCenter} />
    </>
  );
}

// Stake tally: filled dots up to quorum, then a ✓ once confirmed.
export function StakeDots({ count, quorum, accent }: { count: number; quorum: number; accent: string }) {
  if (count >= quorum) {
    return <span style={{ color: accent, fontSize: '0.7rem', fontWeight: 700 }}>✓ {count}</span>;
  }
  return (
    <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}>
      {Array.from({ length: quorum }, (_, i) => (
        <span
          key={i}
          style={{
            width: 6, height: 6, borderRadius: '50%',
            background: i < count ? accent : 'transparent',
            border: `1px solid ${i < count ? accent : 'var(--line-strong)'}`,
          }}
        />
      ))}
    </span>
  );
}

// The game topic — the still center of the web.
export function TopicNode({ data }: { data: TopicNodeData }) {
  return (
    <div
      className="display"
      style={{
        width: 116, height: 116, borderRadius: '50%',
        background: 'var(--paper-raised)',
        border: '2px solid var(--ink)',
        boxShadow: 'var(--shadow-card)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        textAlign: 'center', padding: '0.6rem', cursor: 'default',
      }}
    >
      <span style={{
        fontSize: '0.95rem', lineHeight: 1.05, color: 'var(--ink)',
        display: '-webkit-box', WebkitLineClamp: 3,
        WebkitBoxOrient: 'vertical' as const, overflow: 'hidden', wordBreak: 'break-word' as const,
      }}>
        {data.label}
      </span>
      <CenterHandles />
    </div>
  );
}

// A nominated or confirmed subtopic in the web.
export function SubtopicNode({ data }: { data: SubtopicNodeData }) {
  const nom = data.nomination;
  const stakes = nom.stakes.length;
  const confirmed = nom.status === 'confirmed';
  const expired = nom.status === 'expired';

  return (
    <div
      style={{
        width: 128 + Math.min(stakes * 6, 36),
        background: 'var(--paper-raised)',
        border: confirmed ? '1.5px solid var(--ink)' : '1px dashed var(--line-strong)',
        borderRadius: 14,
        padding: '0.5rem 0.7rem',
        cursor: 'pointer',
        opacity: expired ? 0.35 : 1,
        boxShadow: confirmed ? 'var(--shadow-card)' : 'none',
      }}
    >
      <div className="eyebrow" style={{ fontSize: '0.55rem', display: 'flex', justifyContent: 'space-between', gap: 6 }}>
        <span>{confirmed ? 'subtopic' : expired ? 'expired' : 'seeking'}</span>
        {!expired && <StakeDots count={stakes} quorum={data.quorum} accent="var(--ink)" />}
      </div>
      <div style={{
        fontSize: '0.85rem', lineHeight: 1.25, color: 'var(--ink)', marginTop: 3,
        display: '-webkit-box', WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical' as const, overflow: 'hidden', wordBreak: 'break-word' as const,
      }}>
        {nom.title}
      </div>
      <CenterHandles />
    </div>
  );
}

// A proposed, live, or revealed map hanging off its subtopic — colored by
// theme.
export function MapNode({ data }: { data: MapNodeData }) {
  const nom = data.nomination;
  const accent = THEME_ACCENT[nom.themeIndex ?? 0];
  const soft = THEME_SOFT[nom.themeIndex ?? 0];
  const expired = nom.status === 'expired';
  const stage = nom.mapState?.stage ?? null;
  const revealed = stage === 'done' || stage === 'closed';
  const label = expired ? 'expired'
    : revealed ? 'map · revealed'
    : data.live ? 'map · live'
    : 'map?';
  const filled = data.live || revealed;

  return (
    <div
      style={{
        width: 112,
        background: filled ? `linear-gradient(${soft}, ${soft}), var(--paper-raised)` : 'var(--paper-raised)',
        border: filled ? `1.5px solid ${accent}` : `1px dashed ${accent}`,
        borderRadius: 12,
        padding: '0.45rem 0.6rem',
        cursor: 'pointer',
        opacity: expired ? 0.35 : 1,
      }}
    >
      <div className="eyebrow" style={{ fontSize: '0.55rem', color: accent, display: 'flex', justifyContent: 'space-between', gap: 6 }}>
        <span>{label}</span>
        {!filled && !expired && (
          <StakeDots count={nom.stakes.length} quorum={data.quorum} accent={accent} />
        )}
      </div>
      <div style={{
        fontSize: '0.75rem', lineHeight: 1.25, color: 'var(--ink)', marginTop: 2,
        display: '-webkit-box', WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical' as const, overflow: 'hidden', wordBreak: 'break-word' as const,
      }}>
        {data.theme}
      </div>
      <CenterHandles />
    </div>
  );
}

export const NODE_TYPES = { topic: TopicNode, subtopic: SubtopicNode, map: MapNode };
