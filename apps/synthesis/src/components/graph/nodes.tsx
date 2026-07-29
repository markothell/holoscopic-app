'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { SynNode } from '@/lib/types';
import { NODE_W, THOUGHT_H, hubWidth, hubHeight } from '@/lib/graph';

// ─── The map's shape language: cut facets on a dark field ────────────────
//
// Every node is a *faceted plane* — a shape with cut corners rather than
// rounded ones, stroked in its origin colour. The facets are always
// symmetric, which is the whole point: an asymmetric single-corner notch
// reads as an accident rather than a decision.
//
// Outlines are SVG paths, not CSS borders. A `clip-path`ed element clips its
// own border and box-shadow away, so the earlier clip+border hubs rendered
// as unoutlined blobs; and only a real stroke can carry a dash around a
// hexagon or a chamfer. Node boxes are therefore deterministic (see
// lib/graph.ts) so the path can be drawn at exact pixel coordinates.
//
// The vocabulary, one device per fact:
//   shape  = kind      hexagon = topic hub · chamfered card = thought
//   size   = nesting   a hub shrinks per hub standing above it
//   stroke = origin    brass = authored here · periwinkle = carried in
//   dashed = private   a provisional node, not yet shared with the group.
//                      Marking the exception, not the rule: new thoughts
//                      auto-publish (useMyMap.ts), so "live" is the common
//                      state and a badge on it would be noise. Topic hubs
//                      stay private scaffold and so read as dashed.
//   ring   = notable   an offset outline of the node's own shape, used for
//                      exactly two things: the home hub, and a synthesis
//                      (marriage) node. Echoes the tuning-rings backdrop.
//
// That is the whole vocabulary, and it stays that way. A mark a reader can't
// act on is noise however small — a thought's context needs no badge,
// because tapping the thought reveals it either way.

export interface SynNodeData extends Record<string, unknown> {
  synthesisNode: SynNode;
  selected: boolean;   // selected for marriage (marry mode)
  marryMode: boolean;
  eligible: boolean;   // same-kind as the other marry-mode selection, or nothing selected yet
  hubTier: number;     // hubs standing above this node — the nesting size step
  inSynthesis?: boolean; // the GROUP measure is at or above the bar (home hub only)
  onOpenSource?: (sourceNodeId: string) => void; // task item 4: borrowed-node provenance
}

const ORIGIN_COLOR = { own: 'var(--own)', borrowed: 'var(--borrowed)' } as const;
const DASH = '5 4';
const CHAMFER = 11;

// Both shapes are generated from a rect, so the "notable" ring is the same
// generator run on an expanded rect — a true parallel offset, not a scale.
const hexPath = (x: number, y: number, w: number, h: number) =>
  `M ${x + w * 0.25},${y} L ${x + w * 0.75},${y} L ${x + w},${y + h / 2} `
  + `L ${x + w * 0.75},${y + h} L ${x + w * 0.25},${y + h} L ${x},${y + h / 2} Z`;

const cardPath = (x: number, y: number, w: number, h: number, c: number) =>
  `M ${x + c},${y} L ${x + w - c},${y} L ${x + w},${y + c} L ${x + w},${y + h - c} `
  + `L ${x + w - c},${y + h} L ${x + c},${y + h} L ${x},${y + h - c} L ${x},${y + c} Z`;

function Outline({
  w, h, d, ring, ring2, ringColor, stroke, fill, strokeWidth = 1.5, dashed,
}: {
  w: number; h: number; d: string; ring?: string; ring2?: string; ringColor?: string;
  stroke: string; fill: string; strokeWidth?: number; dashed: boolean;
}) {
  return (
    // overflow visible so the ring — and the outer half of the stroke —
    // aren't cropped at the node's own box.
    <svg
      aria-hidden width={w} height={h} viewBox={`0 0 ${w} ${h}`}
      style={{ position: 'absolute', inset: 0, overflow: 'visible' }}
    >
      {/* A SECOND, wider ring is the synthesis mark, and only ever that. A
          join node already wears one teal ring, so the group's synthesis is
          set apart by treatment as well as hue — two concentric rings read as
          "this gathered" at a glance, at any zoom. */}
      {ring2 && <path d={ring2} fill="none" stroke={ringColor} strokeWidth={1.25} opacity={0.34} />}
      {ring && <path d={ring} fill="none" stroke={ringColor} strokeWidth={1.25} opacity={ring2 ? 0.85 : 0.5} />}
      <path
        d={d}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray={dashed ? DASH : undefined}
        strokeLinejoin="round"
      />
    </svg>
  );
}

const hiddenHandle = { opacity: 0, border: 0, width: 1, height: 1 } as const;

function Handles() {
  return (
    <>
      <Handle type="target" position={Position.Top} style={hiddenHandle} />
      <Handle type="source" position={Position.Bottom} style={hiddenHandle} />
    </>
  );
}

export function TopicNode({ data }: NodeProps & { data: SynNodeData }) {
  const { synthesisNode: n, selected, marryMode, eligible, hubTier, inSynthesis } = data;
  const isHome = !!n.isHome;
  // The idea's own hub carries the group's state: when the group has found
  // shared words, the centre of everyone's map says so. It moves back when the
  // measure does — Synthesis is living, so this is never a permanent badge.
  const homeSynthesis = isHome && !!inSynthesis;
  const w = hubWidth(hubTier, isHome);
  const h = hubHeight(w);
  const stroke = selected
    ? 'var(--join)'
    : homeSynthesis ? 'var(--synthesis)' : ORIGIN_COLOR[n.origin];
  const fill = selected
    ? 'color-mix(in srgb, var(--join) 20%, var(--dusk-raised))'
    : homeSynthesis
      ? 'color-mix(in srgb, var(--synthesis) 14%, var(--dusk-raised))'
      : 'var(--dusk-raised)';

  return (
    <div
      className="tone-in transition-opacity duration-150"
      style={{ position: 'relative', width: w, height: h, opacity: marryMode && !eligible ? 0.3 : 1 }}
    >
      <Outline
        w={w} h={h}
        d={hexPath(0, 0, w, h)}
        ring={isHome ? hexPath(-7, -7, w + 14, h + 14) : undefined}
        ring2={homeSynthesis ? hexPath(-13, -13, w + 26, h + 26) : undefined}
        ringColor={homeSynthesis ? 'var(--synthesis)' : 'var(--own)'}
        stroke={stroke}
        fill={fill}
        strokeWidth={isHome ? 2 : 1.5}
        dashed={n.visibility !== 'published'}
      />
      {/* Padding tracks the hexagon's own width so a deeply nested hub keeps
          the same optical margin as a full-size one. */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center text-center"
        style={{ paddingLeft: Math.round(w * 0.2), paddingRight: Math.round(w * 0.2) }}
      >
        {isHome && (
          <span
            className="eyebrow !text-[0.5rem] mb-0.5"
            style={{ color: homeSynthesis ? 'var(--synthesis)' : 'var(--own)' }}
          >
            {homeSynthesis ? '∪ in synthesis' : 'home'}
          </span>
        )}
        <span
          className="eyebrow !text-[0.6rem] leading-snug"
          style={{
            color: 'var(--mist)',
            display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const,
            overflow: 'hidden', wordBreak: 'break-word',
          }}
        >
          {n.content.topic || 'Untitled hub'}
        </span>
      </div>
      <Handles />
    </div>
  );
}

export function ThoughtNode({ data }: NodeProps & { data: SynNodeData }) {
  const { synthesisNode: n, selected, marryMode, eligible } = data;
  const w = NODE_W.thought;
  const h = THOUGHT_H;
  const isSynthesis = n.edgeKind === 'marriage';
  const accent = ORIGIN_COLOR[n.origin];
  const stroke = selected ? 'var(--join)' : accent;
  const fill = selected
    ? 'color-mix(in srgb, var(--join) 18%, var(--dusk-raised))'
    : 'var(--dusk-raised)';

  return (
    <div
      className="tone-in transition-opacity duration-150"
      style={{
        position: 'relative', width: w, height: h,
        opacity: marryMode && !eligible ? 0.3 : 1,
        // drop-shadow, not box-shadow: a rectangular shadow behind a
        // chamfered card shows at the corners. This one follows the path.
        filter: 'drop-shadow(0 8px 20px rgba(10, 8, 16, 0.45))',
      }}
    >
      <Outline
        w={w} h={h}
        d={cardPath(0, 0, w, h, CHAMFER)}
        ring={isSynthesis && !selected ? cardPath(-5, -5, w + 10, h + 10, CHAMFER + 5) : undefined}
        ringColor="var(--join)"
        stroke={stroke}
        fill={fill}
        dashed={n.visibility !== 'published'}
      />
      <div className="absolute inset-0 flex flex-col justify-between px-3.5 py-3">
        <p
          className="voice-serif text-[0.85rem] leading-snug"
          style={{
            color: 'var(--mist)',
            display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const,
            overflow: 'hidden', wordBreak: 'break-word',
          }}
        >
          {n.content.thought || 'Untitled thought'}
        </p>
        {/* The meta line: what this node carries, in one scannable row that
            never wraps — a map card shouldn't reflow. Two facts only: the
            shape of its response space, and who it came from. Provenance is
            a plain chip here; the two follow-through links live in the popup
            and the sheet, not on the map.
            Deliberately NOT here: whether the thought has context. Tapping a
            thought always opens the popup, which either shows the prose or
            says there is none — a badge for it changes nothing the reader
            would do, and reads as a stray label. */}
        <div className="flex items-center gap-x-2 overflow-hidden whitespace-nowrap">
          {n.axisFrameIds.length > 0 && (
            <span className="eyebrow !text-[0.55rem]" style={{ color: accent }}>
              {n.axisFrameIds.length === 2 ? '⊞ grid' : '— line'}
            </span>
          )}
          {n.sourceNodeId && (
            <span
              className="eyebrow !text-[0.55rem] overflow-hidden text-ellipsis"
              style={{ color: n.origin === 'own' ? 'var(--own)' : 'var(--borrowed)' }}
            >
              {n.origin === 'own' ? `on ${n.sourceOwnerHandle ?? 'someone'}’s` : `from ${n.sourceOwnerHandle ?? 'someone'}`}
            </span>
          )}
        </div>
      </div>
      <Handles />
    </div>
  );
}

export const NODE_TYPES = { topic: TopicNode, thought: ThoughtNode };
