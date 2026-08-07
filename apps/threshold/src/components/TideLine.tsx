// The app's one mark (PLAN.md §9.2): the line left where two things meet and
// neither wins. It runs pole → threshold → pole, so the neutral middle is
// always the widest part of it, and it is the same shape at every scale — a
// hairline under a header, a bar inside a topic node on the circle-final graph.
//
// The colours come from globals.css and are FIXED for every topic in every
// circle (D26). A seed names its own ends; it never chooses their colours.

/**
 * The hairline. Decorative — every place it appears, the pole names appear too,
 * so it carries no information a screen reader loses.
 */
export function TideLine({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`h-px w-full ${className}`}
      style={{
        background:
          'linear-gradient(to right, var(--pole-a), var(--threshold-soft) 45%, var(--threshold-soft) 55%, var(--pole-b))',
      }}
    />
  );
}

/**
 * A seed's two ends, in the app's two colours, with the tide line between them.
 *
 * The labels are the seed's own words throughout — nothing a participant reads
 * ever says "A" or "B" (§6.2).
 */
export function Polarity({ poleA, poleB, className = '' }: {
  poleA: string;
  poleB: string;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <span className="text-[13px] font-medium text-pole-a whitespace-nowrap">{poleA}</span>
      <TideLine className="flex-1" />
      <span className="text-[13px] font-medium text-pole-b whitespace-nowrap">{poleB}</span>
    </div>
  );
}
