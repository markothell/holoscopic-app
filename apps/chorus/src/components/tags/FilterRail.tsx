import Link from 'next/link';
import type { Tag } from '@/lib/types';
import TagLink from './TagLink';
import { activeTagIds, clearFiltersHref, toggleTagHref, type SearchParams } from '@/lib/filters';

// The filter above the wall.
//
// Active filters come first and each one is its own remove button, because the
// commonest thing after filtering is un-filtering. Below them, a scrolling rail
// of the words people actually used, most-used first — the vocabulary
// self-organises, so the top of this rail is a fair summary of the memorial.
//
// Filtering is AND across the three slots (the `allTags` multikey index), so
// stacking two words narrows to memories carrying both.

export default function FilterRail({
  base, role, experience, params, total, subjectName,
}: {
  /** This memorial's path, `/c/<slug>` — every link here hangs off it. */
  base: string;
  role: Tag[];
  experience: Tag[];
  params: SearchParams;
  total: number;
  subjectName: string;
}) {
  const active = activeTagIds(params);
  const all = [...role, ...experience];
  const activeTags = active.map(id => all.find(t => t.id === id)).filter((t): t is Tag => Boolean(t));

  // Only words somebody has actually used — an unused seed tag would filter to
  // an empty wall, which reads as a broken page.
  const offered = all
    .filter(t => t.useCount > 0 && !active.includes(t.id))
    .sort((a, b) => b.useCount - a.useCount)
    .slice(0, 18);

  if (!activeTags.length && !offered.length) return null;

  return (
    <div className="mb-5">
      {activeTags.length > 0 && (
        <div className="mb-3">
          <div className="flex flex-wrap items-center gap-2">
            {activeTags.map(tag => (
              <TagLink key={tag.id} tag={tag} href={toggleTagHref(base, params, tag.id)} active size="md" />
            ))}
            <Link
              href={clearFiltersHref(base, params)}
              prefetch={false}
              className="px-2 py-1 text-[0.875rem] text-ink-faint underline
                         decoration-rule underline-offset-4 hover:text-ink"
            >
              Show all
            </Link>
          </div>
          <p className="mt-2.5 text-[0.9375rem] text-ink-soft">
            {total === 0
              ? `No memories of ${subjectName} carry ${activeTags.length > 1 ? 'all of those words' : 'that word'} yet.`
              : `${total} ${total === 1 ? 'memory' : 'memories'}.`}
          </p>
        </div>
      )}

      {/* Edge-to-edge scroll on a phone: the rail runs past the column so it
          reads as continuable, rather than stopping at a tidy margin. */}
      <div className="-mx-5 overflow-x-auto px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max gap-2 pb-1">
          {offered.map(tag => (
            <TagLink key={tag.id} tag={tag} href={toggleTagHref(base, params, tag.id)} />
          ))}
        </div>
      </div>
    </div>
  );
}
