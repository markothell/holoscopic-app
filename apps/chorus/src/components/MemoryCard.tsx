import Link from 'next/link';
import type { Memory, Tag } from '@/lib/types';
import AudioPill from './audio/AudioPill';
import TagLink from './tags/TagLink';
import { toggleTagHref, activeTagIds, type SearchParams } from '@/lib/filters';

// One memory on the wall. Leads with the short name the sharer gave it —
// that's the human handle on the story ("The kitchen radio") and it's what
// makes a wall scannable.
//
// THE WHOLE CARD IS TAPPABLE, and its tags are also links. Those two wants
// conflict: an <a> inside an <a> is invalid HTML and browsers resolve it by
// splitting the markup, which breaks both. So the card is a plain <article>
// and the title's link carries an `after:` pseudo-element stretched over the
// card. Tags sit above it on `z-10` (see TagLink). Screen readers get one link
// per memory rather than one per element, which is also the better outcome.

function excerpt(memory: Memory, max = 180) {
  const source = memory.body.text || memory.body.audio?.transcript.text || '';
  if (source.length <= max) return source;
  return `${source.slice(0, source.lastIndexOf(' ', max))}…`;
}

export default function MemoryCard({
  base,
  memory,
  subjectName,
  params,
  index = 0,
}: {
  /** This memorial's path, `/c/<slug>` — every link out of the card hangs off it. */
  base: string;
  memory: Memory;
  subjectName: string;
  params: SearchParams;
  index?: number;
}) {
  const audio = memory.body.audio;
  const text = excerpt(memory);
  const added = memory.threadCount - 1;
  const active = activeTagIds(params);

  // The compact sentence, rebuilt with each answer as its own filter link.
  const parts: Array<{ lead: string; tags: Tag[] }> = [
    { lead: `${subjectName} was`, tags: memory.subjectTags },
    { lead: 'I was', tags: memory.selfTags },
    { lead: 'an experience of', tags: memory.experienceTags },
  ].filter(p => p.tags.length);

  return (
    <li className="settle" style={{ '--i': index } as React.CSSProperties}>
      <article
        className="group relative rounded-[3px] bg-card px-5 py-5 shadow-[var(--shadow-card)]
                   transition-shadow duration-300 hover:shadow-[var(--shadow-lift)]
                   focus-within:shadow-[var(--shadow-lift)]"
      >
        {/* Whichever line leads the card carries the stretched link, so there
            is exactly one link per memory and never an empty heading. */}
        {memory.replyTo ? (
          <p className="eyebrow">
            <Link href={`${base}/m/${memory.id}`} className="after:absolute after:inset-0 after:content-['']">
              Added to “{memory.replyTo.title}”
            </Link>
          </p>
        ) : (
          <h2 className="voice text-[1.4375rem] leading-tight text-ink">
            <Link href={`${base}/m/${memory.id}`} className="after:absolute after:inset-0 after:content-['']">
              {memory.title}
            </Link>
          </h2>
        )}

        {parts.length > 0 && (
          <p className="mt-2.5 text-[0.9375rem] leading-[2]">
            {parts.map((p, i) => (
              <span key={p.lead}>
                {i > 0 && <span className="px-1.5 text-ink-faint">·</span>}
                <span className="connective">{p.lead} </span>
                {p.tags.map((t, j) => (
                  <span key={t.id}>
                    {j > 0 && <span className="connective"> &amp; </span>}
                    <TagLink
                      tag={t}
                      href={toggleTagHref(base, params, t.id)}
                      active={active.includes(t.id)}
                      variant="rule"
                    />
                  </span>
                ))}
              </span>
            ))}
          </p>
        )}

        {text && (
          <p className="voice mt-3 text-[1.0625rem] leading-[1.6] text-ink-soft">
            {text}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          {audio && <AudioPill memoryId={memory.id} audio={audio} />}

          <span className="text-[0.8125rem] text-ink-faint">
            {memory.anonymous ? 'Left anonymously' : memory.sharerName}
          </span>

          {added > 0 && !memory.replyTo && (
            <span className="text-[0.8125rem] text-ink-faint">
              · {added === 1 ? '1 person added' : `${added} people added`}
            </span>
          )}
        </div>
      </article>
    </li>
  );
}
