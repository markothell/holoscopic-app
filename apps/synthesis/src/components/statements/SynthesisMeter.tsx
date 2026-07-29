'use client';

import type { SynthesisState } from '@/lib/types';

// The group's measure, drawn as ONE bar for the whole idea.
//
// The design turns on a single choice: this is not a progress bar per
// statement. Per-statement bars would stage a race — three contenders filling
// up, one of them winning. Synthesis is the group finding shared words, so the
// bar belongs to the group, and it fills to however much of the group has
// gathered behind its single best-backed wording. When a better wording takes
// over, the same bar keeps moving; nothing resets, nothing is defeated.
//
// It is a LIVING measure, so the bar goes down as readily as up — backing
// drains, or new collaborators arrive and raise the bar. That is why nothing
// here says "reached" or "complete": the copy names where the group IS.
//
// Three marks, and no more:
//   · the FILL     — the share of collaborators behind the leading wording
//   · the BAR LINE — a notch at the threshold, so the distance is visible
//   · the TICKS    — one per collaborator, so a small group counts people
//                    rather than reading a percentage of six
export default function SynthesisMeter({
  state,
  compact = false,
}: {
  state: SynthesisState;
  compact?: boolean;
}) {
  const { collaboratorCount, backing, share, threshold, votesToReach, inSynthesis, stillToWeighIn } = state;
  const accent = inSynthesis ? 'var(--synthesis)' : 'var(--own)';
  const remaining = Math.max(0, votesToReach - backing);

  // Ticks only while a group is small enough that people are countable. Past
  // that the fill alone reads better than a picket fence.
  const showTicks = collaboratorCount > 0 && collaboratorCount <= 16;

  return (
    <section aria-label="Where the group stands">
      {!compact && (
        <p className="eyebrow" style={{ color: accent }}>
          {inSynthesis ? 'In synthesis' : 'Finding synthesis'}
        </p>
      )}

      <div className={compact ? '' : 'mt-2.5'}>
        <div
          className="relative h-2.5 w-full overflow-hidden rounded-full"
          style={{ background: 'var(--dusk-deep)' }}
          role="meter"
          aria-valuenow={backing}
          aria-valuemin={0}
          aria-valuemax={collaboratorCount}
          aria-valuetext={`${backing} of ${collaboratorCount} collaborators behind one statement`}
        >
          <div
            className="h-full rounded-full transition-[width] duration-500 ease-out"
            style={{
              width: `${Math.min(100, share * 100)}%`,
              background: inSynthesis
                ? 'linear-gradient(90deg, var(--join), var(--synthesis))'
                : 'linear-gradient(90deg, var(--own-soft), var(--own))',
            }}
          />

          {/* One tick per collaborator — a small group should be able to count
              itself rather than translate a percentage. */}
          {showTicks && Array.from({ length: collaboratorCount - 1 }, (_, i) => (
            <span
              key={i}
              className="absolute top-0 h-full"
              style={{
                left: `${((i + 1) / collaboratorCount) * 100}%`,
                width: 1,
                background: 'var(--dusk)',
                opacity: 0.6,
              }}
            />
          ))}

          {/* The bar itself — where the group becomes a synthesis. */}
          <span
            className="absolute -top-0.5 h-[calc(100%+0.25rem)]"
            style={{
              left: `${threshold * 100}%`,
              width: 2,
              background: inSynthesis ? 'var(--synthesis)' : 'var(--mist-soft)',
              opacity: inSynthesis ? 1 : 0.7,
            }}
            title={`${votesToReach} of ${collaboratorCount} collaborators`}
          />
        </div>

        <p className="mt-2 text-[0.78rem] leading-snug text-mist-soft">
          {collaboratorCount === 0 ? (
            'This idea is waiting for its first collaborator.'
          ) : backing === 0 ? (
            <>Nobody is behind a statement yet. <span style={{ color: accent }}>{votesToReach} of {collaboratorCount}</span> makes it the group&rsquo;s.</>
          ) : inSynthesis ? (
            <>
              <span style={{ color: accent }}>{backing} of {collaboratorCount}</span> collaborators
              are behind the same words. The group is in synthesis.
            </>
          ) : (
            <>
              <span style={{ color: accent }}>{backing} of {collaboratorCount}</span> collaborators
              are behind the same words — {remaining} more makes it the group&rsquo;s.
            </>
          )}
        </p>

        {/* The quiet third. Naming them is the point: they are who can move
            the group next, and the measure should say they are still out
            there rather than let a synthesis look unanimous. */}
        {stillToWeighIn > 0 && collaboratorCount > 0 && (
          <p className="eyebrow mt-1.5 !text-[0.6rem]" style={{ color: 'var(--mist-faint)' }}>
            {stillToWeighIn} {stillToWeighIn === 1 ? 'collaborator has' : 'collaborators have'} yet to weigh in
          </p>
        )}
      </div>
    </section>
  );
}
