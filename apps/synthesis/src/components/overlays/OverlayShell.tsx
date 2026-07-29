'use client';

import type { ReactNode } from 'react';

// Full-screen overlay shell shared by Post / Feed / Ask (D7): slides up over
// the map, dismisses back to it. Distinct from Sheet (a partial bottom
// sheet for map actions) — these three surfaces are destinations, not
// quick actions, so they take the whole screen under the dock.
export default function OverlayShell({
  title,
  eyebrow,
  onClose,
  children,
}: {
  title: string;
  eyebrow: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="sheet-up fixed inset-0 z-30 flex flex-col" style={{ background: 'var(--dusk)' }}>
      <header className="mx-auto flex w-full max-w-md items-center justify-between px-5 pb-3 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <div>
          <p className="eyebrow" style={{ color: 'var(--own)' }}>{eyebrow}</p>
          <h1 className="display text-3xl">{title}</h1>
        </div>
        <button aria-label="Back to map" onClick={onClose} className="rounded-full border border-line-strong px-3 py-2 text-sm text-mist-soft">
          ✕
        </button>
      </header>
      <div className="mx-auto w-full max-w-md flex-1 overflow-y-auto px-5 pb-24">
        {children}
      </div>
    </div>
  );
}
