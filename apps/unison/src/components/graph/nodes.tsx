'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { UnisonNode } from '@/lib/types';
import ProvenanceBreadcrumb from './ProvenanceBreadcrumb';

// The map's two node shapes (settled grammar, PLAN §7 / task brief):
//   topic  = a HUB — a rounded hexagon, the organizing shape.
//   thought = a CARD carrying its context (a click-to-reveal pair, never a
//             third shape) — a small corner notch signals "there's more here."
// color = origin (own = brass, borrowed = periwinkle, flips on promote);
// a synthesis (marriage) node gets a teal ring regardless of origin, since
// two lines converging is itself the notable fact. A published node shows a
// small coral "live" dot — the one state that isn't origin or kind.
// The home node (task item 3) is a topic hub flagged `isHome` — a real,
// visually distinct root every other top-level node connects to.

export interface UnisonNodeData extends Record<string, unknown> {
  unisonNode: UnisonNode;
  selected: boolean;   // selected for marriage (marry mode)
  marryMode: boolean;
  eligible: boolean;   // same-kind as the other marry-mode selection, or nothing selected yet
  onOpenSource?: (sourceNodeId: string) => void; // task item 4: borrowed-node provenance
}

const ORIGIN_COLOR = { own: 'var(--own)', borrowed: 'var(--borrowed)' } as const;

function LiveDot({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full" style={{ background: 'var(--live)', boxShadow: '0 0 0 2px var(--dusk)' }} />;
}

export function TopicNode({ data }: NodeProps & { data: UnisonNodeData }) {
  const { unisonNode: n, selected, marryMode, eligible } = data;
  const accent = ORIGIN_COLOR[n.origin];
  const dimmed = marryMode && !eligible;
  const isHome = !!n.isHome;
  return (
    <div
      className="tone-in flex flex-col items-center justify-center text-center transition-opacity duration-150"
      style={{
        width: isHome ? 148 : 128, height: isHome ? 104 : 92,
        clipPath: 'polygon(25% 4%, 75% 4%, 100% 50%, 75% 96%, 25% 96%, 0% 50%)',
        background: selected ? 'color-mix(in srgb, var(--synthesis) 22%, var(--dusk-raised))' : 'var(--dusk-raised)',
        border: `${isHome ? 2 : 1.5}px solid ${selected ? 'var(--synthesis)' : accent}`,
        boxShadow: isHome ? '0 0 0 4px color-mix(in srgb, var(--own) 16%, transparent)' : undefined,
        opacity: dimmed ? 0.35 : 1,
        position: 'relative',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <LiveDot visible={n.visibility === 'published'} />
      {isHome && <span className="eyebrow !text-[0.55rem]" style={{ color: 'var(--own)' }}>⌂ home</span>}
      <span className="eyebrow px-4 leading-snug" style={{ color: 'var(--mist)' }}>{n.content.topic || 'Untitled hub'}</span>
    </div>
  );
}

export function ThoughtNode({ data }: NodeProps & { data: UnisonNodeData }) {
  const { unisonNode: n, selected, marryMode, eligible, onOpenSource } = data;
  const accent = ORIGIN_COLOR[n.origin];
  const isSynthesis = n.edgeKind === 'marriage';
  const dimmed = marryMode && !eligible;
  return (
    <div
      className="tone-in relative flex flex-col justify-between rounded-xl px-3 py-2.5 transition-opacity duration-150"
      style={{
        width: 176, minHeight: 84,
        background: selected ? 'color-mix(in srgb, var(--synthesis) 20%, var(--dusk-raised))' : 'var(--dusk-raised)',
        border: `1.5px solid ${selected ? 'var(--synthesis)' : accent}`,
        boxShadow: isSynthesis && !selected ? `0 0 0 1px var(--synthesis) inset` : 'var(--shadow-card)',
        opacity: dimmed ? 0.35 : 1,
        clipPath: 'polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 0 100%)',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <LiveDot visible={n.visibility === 'published'} />
      <p className="voice-serif text-[0.85rem] leading-snug" style={{ color: 'var(--mist)' }}>
        {n.content.thought || 'Untitled thought'}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {n.axisFrameIds.length > 0 && (
          <span className="eyebrow !text-[0.55rem]" style={{ color: accent }}>
            {n.axisFrameIds.length === 2 ? '⊞ grid' : '— line'}
          </span>
        )}
      </div>
      {n.origin === 'borrowed' && n.sourceNodeId && (
        <ProvenanceBreadcrumb
          handle={n.sourceOwnerHandle ?? 'someone'}
          onOpenReplyMap={() => onOpenSource?.(n.sourceNodeId!)}
          compact
        />
      )}
    </div>
  );
}

export const NODE_TYPES = { topic: TopicNode, thought: ThoughtNode };
