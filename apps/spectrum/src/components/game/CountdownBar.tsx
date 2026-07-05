'use client';

// Thin draining bar pinned to the very top of the nominate screen.
// Crimson→cobalt duotone; solid crimson for the last 15 seconds.
export default function CountdownBar({
  secondsLeft,
  totalSeconds,
}: {
  secondsLeft: number;
  totalSeconds: number;
}) {
  const frac = totalSeconds > 0 ? Math.min(1, secondsLeft / totalSeconds) : 0;
  const urgent = secondsLeft <= 15;
  return (
    <div className="fixed inset-x-0 top-0 z-40">
      <div className="h-1.5 w-full bg-line">
        <div
          className="h-full transition-[width] duration-1000 ease-linear"
          style={{
            width: `${frac * 100}%`,
            background: urgent
              ? 'var(--x-accent)'
              : 'linear-gradient(90deg, var(--y-accent), var(--x-accent))',
          }}
        />
      </div>
      <div className="flex justify-end px-4 pt-1">
        <span className={`eyebrow ${urgent ? 'text-ax' : ''}`}>
          {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
        </span>
      </div>
    </div>
  );
}
