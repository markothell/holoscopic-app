'use client';

import type { FrameRef, Nomination, SlateFrame } from '@/lib/types';

// The frame glyph — every spectrum in the game drawn the same way, so a
// lens is recognizable at a glance wherever it appears: on a nomination's
// slate, as the gather screen's prompt, flanking the rank list, in the
// reveal, on the shelf.
//
// Orientation convention (matches the ranking math, where position.x = 1 =
// "most"): poleA is the MOST end — filled dot, right side on x, top on y.
// poleB is the open-dot end. Inputs that build a frame put poleB in the
// left field and poleA in the right one, so what you type is what you see.

export function FrameLine({
  poleA,
  poleB,
  accent = 'var(--ink)',
  muted = false,
  className = '',
}: {
  poleA: string;
  poleB: string;
  accent?: string;
  muted?: boolean;
  className?: string;
}) {
  const ink = muted ? 'var(--ink-faint)' : 'var(--ink)';
  const line = muted ? 'var(--line-strong)' : accent;
  return (
    <span className={`flex min-w-0 items-center gap-2 ${className}`}>
      <span className="max-w-[38%] truncate text-sm" style={{ color: ink }}>{poleB}</span>
      <span className="flex min-w-6 flex-1 items-center" aria-hidden>
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full border"
          style={{ borderColor: line, background: 'transparent' }}
        />
        <span className="h-px flex-1" style={{ background: line }} />
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: line }}
        />
      </span>
      <span className="max-w-[38%] truncate text-sm" style={{ color: ink }}>{poleA}</span>
    </span>
  );
}

// The empty map a frame slate would produce: one axis as a labeled line,
// two as the crossed 2×2 grid — the same skeleton the reveal fills with
// items, shown wherever the group is choosing or reading a lens.
// axes[0] = x, axes[1] = y (if present).
export function FramePreview({
  axes,
  accent,
  compact = false,
}: {
  axes: FrameRef[];
  accent: string;
  compact?: boolean;
}) {
  const x = axes[0];
  const y = axes[1] ?? null;
  if (!x) return null;

  if (!y) {
    return (
      <div className={`rounded-2xl border border-line bg-paper-raised px-4 ${compact ? 'py-3' : 'py-5'}`}>
        <div className="flex items-center gap-3">
          <span className="eyebrow max-w-[38%] truncate !text-ink">{x.poleB}</span>
          <span className="flex min-w-8 flex-1 items-center" aria-hidden>
            <span className="h-2 w-2 shrink-0 rounded-full border" style={{ borderColor: accent }} />
            <span className="h-px flex-1" style={{ background: accent }} />
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: accent }} />
          </span>
          <span className="eyebrow max-w-[38%] truncate" style={{ color: accent }}>{x.poleA}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative w-full rounded-2xl border border-line bg-paper-raised ${
        compact ? 'aspect-[7/5]' : 'aspect-square'
      }`}
    >
      {/* the crossed axes items will land on */}
      <div className="absolute inset-y-3 left-1/2 w-px bg-line" />
      <div className="absolute inset-x-3 top-1/2 h-px bg-line" />
      <span className="eyebrow absolute left-1/2 top-2 max-w-[80%] -translate-x-1/2 truncate" style={{ color: accent }}>
        {y.poleA}
      </span>
      <span className="eyebrow absolute bottom-2 left-1/2 max-w-[80%] -translate-x-1/2 truncate !text-ink-faint">
        {y.poleB}
      </span>
      <span className="eyebrow absolute right-2 top-1/2 max-w-[38%] -translate-y-1/2 truncate" style={{ color: accent }}>
        {x.poleA}
      </span>
      <span className="eyebrow absolute left-2 top-1/2 max-w-[38%] -translate-y-1/2 truncate !text-ink-faint">
        {x.poleB}
      </span>
    </div>
  );
}

// Mirror of the server's slate resolution: votes first, then proposal
// order. What this shows pre-quorum is exactly what confirmation would
// lock — and for a confirmed map, prefer mapState.winningAxes.
export function leadingAxes(slate: SlateFrame[], dimensions: number): SlateFrame[] {
  return slate
    .map((f, i) => ({ f, i }))
    .sort((a, b) => (b.f.voterIds.length - a.f.voterIds.length) || (a.i - b.i))
    .slice(0, dimensions)
    .map(({ f }) => f);
}

// The axes a map nomination stands for right now: locked ones once live,
// the slate's leaders while the contest runs.
export function nominationAxes(nom: Nomination): FrameRef[] {
  if (nom.mapState && nom.mapState.winningAxes.length) return nom.mapState.winningAxes;
  if (nom.frameSlate) return leadingAxes(nom.frameSlate, nom.dimensions ?? 2);
  return [];
}

// ---------------------------------------------------------------------------
// The shelf: every frame in play this game, derived from the nomination
// stream (each frame is born on a slate, so the slates are the registry).

export interface FrameInPlay extends FrameRef {
  // Maps citing this frame, in nomination order.
  usedOn: {
    nominationId: string;
    title: string;
    themeIndex: number | null;
    status: Nomination['status'];
    // True where the frame actually became an axis (confirmed maps only).
    winning: boolean;
  }[];
}

export function framesInPlay(nominations: Nomination[]): FrameInPlay[] {
  const byId = new Map<string, FrameInPlay>();
  for (const nom of nominations) {
    if (nom.kind !== 'map' || !nom.frameSlate) continue;
    const winners = new Set((nom.mapState?.winningAxes ?? []).map(a => a.frameId));
    for (const f of nom.frameSlate) {
      let frame = byId.get(f.frameId);
      if (!frame) {
        frame = { frameId: f.frameId, poleA: f.poleA, poleB: f.poleB, usedOn: [] };
        byId.set(f.frameId, frame);
      }
      frame.usedOn.push({
        nominationId: nom.id,
        title: nom.title,
        themeIndex: nom.themeIndex,
        status: nom.status,
        winning: winners.has(f.frameId),
      });
    }
  }
  return [...byId.values()];
}
