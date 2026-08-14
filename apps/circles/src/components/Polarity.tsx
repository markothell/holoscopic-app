// The two ends of a topic's polarity, in the measured pair (globals.css).
// A seed names its own ends; the colours are the platform's and never the
// author's (threshold D26 — the rule travels with the mechanic).
export function Polarity({ poleA, poleB, className }: {
  poleA: string;
  poleB: string;
  className?: string;
}) {
  return (
    <p className={`flex items-baseline gap-3 text-sm ${className ?? ''}`}>
      <span style={{ color: 'var(--pole-a)' }}>{poleA}</span>
      <span aria-hidden className="h-px flex-1 self-center bg-[var(--rule)]" />
      <span style={{ color: 'var(--pole-b)' }}>{poleB}</span>
    </p>
  );
}
