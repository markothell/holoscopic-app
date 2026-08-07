import Link from 'next/link';
import type { Tag } from '@/lib/types';

// A tag rendered as a link that filters the wall — in one of two shapes,
// because a tag plays two different roles and only one of them is a control.
//
//   "rule"  — inside a memory's sentence. Keeps the ruled amber line: these
//             are words somebody wrote, and the sentence has to keep reading
//             as a sentence. Making these pills turns the signature element
//             into a tag UI, which is the one thing the design must avoid.
//   "chip"  — in the filter rail and "find more like this". Here the tag IS a
//             control, so it should look like one.
//
// `relative z-10` on both: inside a memory card these sit over the stretched
// link overlay that makes the whole card tappable. Without it the overlay
// swallows the tap and opens the memory instead of filtering.
//
// prefetch={false} on both, and on every other link under /c/<slug>.
//
// A wall carries dozens of these — three or four per memory, eighteen more in
// the filter rail — and each one addresses a DIFFERENT filtered wall. Left to
// prefetch, every one that scrolled into view fetched its own server render,
// so a single visitor opening a single page cost the backend dozens of
// requests. It is also the wrong trade for the phone this app is designed
// for: on one bar of signal, prefetching thirty-eight pages to make one of
// them feel instant spends the bandwidth the visible page is still using.

export default function TagLink({
  tag, href, active = false, variant = 'chip', size = 'sm',
}: {
  tag: Tag;
  href: string;
  active?: boolean;
  variant?: 'rule' | 'chip';
  size?: 'sm' | 'md';
}) {
  if (variant === 'rule') {
    return (
      <Link
        href={href}
        prefetch={false}
        aria-label={active ? `Remove the filter ${tag.label}` : `Show memories tagged ${tag.label}`}
        className={`blank relative z-10 rounded-[2px] transition-colors
                    ${active ? 'text-dial' : 'hover:text-dial'}`}
      >
        {tag.label}
      </Link>
    );
  }

  return (
    <Link
      href={href}
      prefetch={false}
      aria-label={active ? `Remove the filter ${tag.label}` : `Show memories tagged ${tag.label}`}
      className={`relative z-10 inline-flex items-center rounded-full transition-colors
                  ${size === 'sm' ? 'px-2.5 py-1 text-[0.8125rem]' : 'px-3.5 py-1.5 text-[0.9375rem]'}
                  ${active
                    ? 'bg-dial text-card-raised'
                    : 'bg-card-raised text-ink-soft border border-[var(--rule)] hover:border-dial hover:text-ink'}`}
    >
      {tag.label}
      {active && <span className="ml-1.5 text-[0.875em]" aria-hidden>×</span>}
    </Link>
  );
}
