import Link from 'next/link';
import { sortHref, SORT_LABELS, activeSort, type SearchParams } from '@/lib/filters';

// How the wall is ordered. Three ways in, each answering a different question
// somebody actually asks at a memorial:
//
//   Newest    — what's just been added (the default; it's why people come back)
//   Oldest    — read it from the beginning, the way a family would sit down to
//   Connected — the moments more than one person remembers
//
// Rendered as links so ordering stays in the URL alongside the filters, which
// keeps the wall a Server Component and keeps every view shareable.

export default function SortBar({ params }: { params: SearchParams }) {
  const current = activeSort(params);

  return (
    <div className="flex items-center gap-1" role="group" aria-label="Order these memories">
      {(Object.keys(SORT_LABELS) as Array<keyof typeof SORT_LABELS>).map(key => {
        const active = key === current;
        return (
          <Link
            key={key}
            href={sortHref(params, key)}
            aria-current={active ? 'true' : undefined}
            className={`rounded-full px-2.5 py-1 text-[0.8125rem] transition-colors
                        ${active ? 'bg-card text-ink' : 'text-ink-faint hover:text-ink'}`}
          >
            {SORT_LABELS[key]}
          </Link>
        );
      })}
    </div>
  );
}
