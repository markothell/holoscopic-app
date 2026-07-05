'use client';

import type { ResultDot } from '@/lib/types';

// The 2×2 reveal. Dots spring in one by one — the theatrical moment.
// x axis = first winning spectrum (crimson), y = second (cobalt).
export default function SpectrumGrid({
  results,
  xLabel,
  yLabel,
  selectedId,
  onSelect,
}: {
  results: ResultDot[];
  xLabel: string;
  yLabel: string;
  selectedId: string | null;
  onSelect: (dot: ResultDot) => void;
}) {
  return (
    <div className="relative mx-auto w-full max-w-[440px]">
      {/* Axis edge labels */}
      <p className="eyebrow mb-1 text-center" style={{ color: 'var(--y-accent)' }}>
        most {yLabel}
      </p>
      <div className="flex items-stretch">
        <div className="flex items-center">
          <p
            className="eyebrow"
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
          >
            least {xLabel}
          </p>
        </div>

        <div
          className="relative mx-1 aspect-square flex-1 overflow-hidden rounded-2xl border border-line-strong bg-paper-raised"
          style={{
            backgroundImage: `
              linear-gradient(to right, transparent 40%, color-mix(in srgb, var(--x-accent) 7%, transparent)),
              linear-gradient(to top, transparent 40%, color-mix(in srgb, var(--y-accent) 7%, transparent))
            `,
          }}
        >
          {/* Quadrant hairlines */}
          <div className="absolute left-1/2 top-0 h-full w-px bg-line" />
          <div className="absolute left-0 top-1/2 h-px w-full bg-line" />

          {results.map((dot, i) => {
            const selected = selectedId === dot.playerId;
            return (
              <button
                key={dot.playerId}
                onClick={() => onSelect(dot)}
                className="dot-in absolute -translate-x-1/2 -translate-y-1/2"
                style={{
                  left: `${8 + dot.x * 84}%`,
                  top: `${8 + (1 - dot.y) * 84}%`,
                  animationDelay: `${0.35 + i * 0.09}s`,
                }}
                aria-label={dot.name}
              >
                <span
                  className="block h-5 w-5 rounded-full border-[3px] border-paper-raised bg-ink"
                  style={selected ? { background: 'var(--x-accent)' } : undefined}
                />
                <span
                  className={`display absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap text-sm transition-opacity ${
                    selected ? 'opacity-100' : 'opacity-60'
                  }`}
                >
                  {dot.name}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center">
          <p className="eyebrow" style={{ writingMode: 'vertical-rl', color: 'var(--x-accent)' }}>
            most {xLabel}
          </p>
        </div>
      </div>
      <p className="eyebrow mt-1 text-center">least {yLabel}</p>
    </div>
  );
}
