import Link from 'next/link';
import type { Tag } from '@/lib/types';
import { toggleTagHref, type SearchParams } from '@/lib/filters';

// Who she was, according to everyone.
//
// Size ∝ how many people reached for the word. This is the emotional payoff of
// the whole tag mechanic and it costs one already-loaded query: a person
// described by forty people in their own words, with the words they agreed on
// standing out. It's also the screenshot — the thing that carries a memorial
// to people who never got the link.
//
// Only the `role` vocabulary belongs here. Experiences describe the moment, not
// the person, and mixing them turns a portrait into a word cloud.

const STEPS = [
  'text-[0.875rem]',
  'text-[1.0625rem]',
  'text-[1.375rem]',
  'text-[1.75rem]',
  'text-[2.125rem]',
];

export default function TagPortrait({
  base, tags, subjectName, params,
}: {
  /** This memorial's path, `/c/<slug>` — every link here hangs off it. */
  base: string;
  tags: Tag[];
  subjectName: string;
  params: SearchParams;
}) {
  const used = tags.filter(t => t.useCount > 0);
  // Under a handful of words there's no distribution to show, only a sparse
  // row of chips pretending to be a portrait.
  if (used.length < 4) return null;

  const max = Math.max(...used.map(t => t.useCount));
  const min = Math.min(...used.map(t => t.useCount));
  const span = Math.max(1, max - min);

  // Most-used first so the strongest words lead, rather than scattering the
  // signal through an alphabetical list.
  const ordered = [...used].sort((a, b) => b.useCount - a.useCount).slice(0, 28);

  return (
    <section className="mt-14" aria-label={`Words people used about ${subjectName}`}>
      <h2 className="eyebrow border-t border-rule pt-5">
        Who {subjectName} was, according to everyone
      </h2>

      <div className="mt-5 flex flex-wrap items-baseline gap-x-4 gap-y-3">
        {ordered.map(tag => {
          const step = Math.round(((tag.useCount - min) / span) * (STEPS.length - 1));
          return (
            <Link
              key={tag.id}
              href={toggleTagHref(base, params, tag.id)}
              prefetch={false}
              className={`voice ${STEPS[step]} leading-none text-ink transition-colors
                          hover:text-dial`}
              // The count is the whole point of the size, so say it where the
              // size can't be seen.
              aria-label={`${tag.label}, said by ${tag.useCount} ${tag.useCount === 1 ? 'person' : 'people'}`}
            >
              {tag.label}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
