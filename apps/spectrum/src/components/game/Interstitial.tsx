'use client';

import type { WinningAxis } from '@/lib/types';

// The beat between voting and ranking: announce the two winning spectrums.
export default function Interstitial({ axes }: { axes: WinningAxis[] }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <p className="eyebrow rise-in">The spectrums are</p>
      <h1
        className="display rise-in mt-6 text-6xl leading-[0.9] text-ax"
        style={{ animationDelay: '0.25s' }}
      >
        {axes[0]?.label}
      </h1>
      <p className="rise-in mt-4 text-2xl text-ink-faint" style={{ animationDelay: '0.55s' }}>×</p>
      <h1
        className="display rise-in mt-4 text-6xl leading-[0.9] text-ay"
        style={{ animationDelay: '0.85s' }}
      >
        {axes[1]?.label}
      </h1>
    </main>
  );
}
