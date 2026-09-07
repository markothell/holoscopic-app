import Link from 'next/link';

// The way out, on every demo surface. The link that brings people here says
// "demo"; the page does not repeat it at length. What stays is navigation — a
// sample with no exit is a trap, not a demo.

export function DemoNotice() {
  return (
    <div className="mb-6 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-faint">
        Demo
      </p>
      <Link
        href="/"
        className="text-sm text-ink-soft underline decoration-[var(--rule-strong)] underline-offset-4 hover:text-ink"
      >
        ← leave the demo
      </Link>
    </div>
  );
}
