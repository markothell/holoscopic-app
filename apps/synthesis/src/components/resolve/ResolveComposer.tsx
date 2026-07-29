'use client';

import { QUADRANT_POSITIONS, LINE_STOPS, binOf, stopPosition, type Quadrant, type ResolveAxis, type ResolvePosition } from '@/lib/resolveLogic';
import AxisFrame from './AxisFrame';

// The response composer: a source thought's 1–2 axes rendered as the
// resolve interaction — a stance, not an aggregate. Shares the coordinate
// model and orientation with ResolveGrid (color = your placement, same
// four-accent vocabulary) but reads as a decision, not a data surface: big
// tap targets, one dot, a clear "place your stance" affordance. This is the
// same composer the post-view reply flow (M1) will drop into, per PLAN §3.

const QUADRANT_LABELS: Quadrant[] = [2, 1, 3, 4]; // reading order: NW, NE, SW, SE
const QUADRANT_ACCENT: Record<Quadrant, string> = {
  1: 'var(--own)', 2: 'var(--borrowed)', 3: 'var(--join)', 4: 'var(--live)',
};

function quadrantOf(pos: ResolvePosition): Quadrant {
  if (pos.x >= 0.5 && pos.y >= 0.5) return 1;
  if (pos.x < 0.5 && pos.y >= 0.5) return 2;
  if (pos.x < 0.5 && pos.y < 0.5) return 3;
  return 4;
}

export default function ResolveComposer({
  axes,
  value,
  onChange,
}: {
  axes: ResolveAxis[];
  value: ResolvePosition | null;
  onChange: (pos: ResolvePosition) => void;
}) {
  const x = axes[0];
  const y = axes[1] ?? null;
  if (!x) return <p className="text-sm text-mist-faint">This thought has no spectrum to place a stance on yet.</p>;

  // A ranked line is LINE_STOPS discrete stops, not a continuous slide. The
  // aggregate stacks each reply into the stop it chose (ResolveGrid), so
  // capturing a free-floating fraction would promise a precision the reply
  // map can't show — your dot would surface somewhere you didn't put it.
  // Stops are also a better gesture on a phone than hitting a pixel: each
  // one is its own tap target, like the quadrant buttons below.
  if (!y) {
    const activeStop = value ? binOf(value.x) : null;
    return (
      <div className="rounded-2xl border border-line bg-dusk-raised px-4 py-5">
        <div className="flex items-center gap-3">
          <span className="eyebrow max-w-[30%] truncate !text-mist-soft">{x.poleB}</span>
          <div className="relative min-w-8 flex-1">
            <span
              className="absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 rounded-full"
              style={{ background: 'var(--line-strong)' }}
            />
            <div className="relative flex">
              {Array.from({ length: LINE_STOPS }).map((_, i) => {
                const isActive = activeStop === i;
                return (
                  <button
                    key={i}
                    type="button"
                    aria-label={`Stop ${i + 1} of ${LINE_STOPS}, toward ${i < LINE_STOPS / 2 ? x.poleB : x.poleA}`}
                    aria-pressed={isActive}
                    onClick={() => onChange({ x: stopPosition(i), y: 0.5 })}
                    className="flex h-10 flex-1 items-center justify-center"
                  >
                    <span
                      className={isActive ? 'tone-in rounded-full' : 'rounded-full'}
                      style={
                        isActive
                          ? { width: 16, height: 16, background: 'var(--own)', boxShadow: '0 0 0 3px var(--dusk-raised)' }
                          : { width: 7, height: 7, background: 'var(--line-strong)', boxShadow: '0 0 0 3px var(--dusk-raised)' }
                      }
                    />
                  </button>
                );
              })}
            </div>
          </div>
          <span className="eyebrow max-w-[30%] truncate" style={{ color: 'var(--own)' }}>{x.poleA}</span>
        </div>
      </div>
    );
  }

  const active = value ? quadrantOf(value) : null;

  return (
    <div className="rounded-2xl border border-line bg-dusk-raised p-4">
      <AxisFrame x={x} y={y}>
        <div className="grid grid-cols-2 grid-rows-2 gap-2" style={{ aspectRatio: '1' }}>
          {QUADRANT_LABELS.map(q => {
            const isActive = active === q;
            const accent = QUADRANT_ACCENT[q];
            return (
              <button
                key={q}
                type="button"
                onClick={() => onChange(QUADRANT_POSITIONS[q])}
                className="flex items-center justify-center rounded-xl transition-colors duration-150"
                style={{
                  border: `1.5px solid ${isActive ? accent : 'var(--line)'}`,
                  background: isActive ? `color-mix(in srgb, ${accent} 18%, transparent)` : 'var(--dusk)',
                }}
              >
                {isActive && <span className="tone-in h-4 w-4 rounded-full" style={{ background: accent }} />}
              </button>
            );
          })}
        </div>
      </AxisFrame>
    </div>
  );
}
