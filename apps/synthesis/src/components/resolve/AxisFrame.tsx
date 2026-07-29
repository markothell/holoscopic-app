'use client';

import type { ReactNode } from 'react';
import type { ResolveAxis } from '@/lib/resolveLogic';

// Task item 5: the one pole-label frame shared by ResolveGrid's 2-axis
// aggregate and ResolveComposer's 2-axis stance picker, so both render with
// identical orientation and neither clips nor overlaps its quadrant square.
// Poles sit fully OUTSIDE the square: y.poleA centered above, y.poleB
// centered below, x.poleB left / x.poleA right, vertically centered beside
// it. poleA is always the "most" end (top on y, right on x — OasFrame's
// orientation rule, PLAN §4/§7), so it always carries the accent color;
// poleB stays muted. Labels wrap instead of truncating, so a long pole
// phrase grows the frame rather than clipping (the original bug).
export default function AxisFrame({
  x,
  y,
  accent = 'var(--own)',
  children,
}: {
  x: ResolveAxis;
  y: ResolveAxis;
  accent?: string;
  children: ReactNode;
}) {
  const poleCls = 'eyebrow max-w-[5.5rem] text-center leading-tight';
  return (
    <div className="w-full">
      <div className="mb-2 flex justify-center px-2">
        <span className={poleCls} style={{ color: accent }}>{y.poleA}</span>
      </div>
      <div className="flex items-center gap-2.5">
        <span className={poleCls} style={{ color: 'var(--mist-soft)' }}>{x.poleB}</span>
        <div className="min-w-0 flex-1">{children}</div>
        <span className={poleCls} style={{ color: accent }}>{x.poleA}</span>
      </div>
      <div className="mt-2 flex justify-center px-2">
        <span className={poleCls} style={{ color: 'var(--mist-soft)' }}>{y.poleB}</span>
      </div>
    </div>
  );
}
