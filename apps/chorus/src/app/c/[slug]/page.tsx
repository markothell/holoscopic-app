import Link from 'next/link';
import { memorialApiFor } from '@/services/api';
import MemoryCard from '@/components/MemoryCard';
import ComposeButton from '@/components/compose/ComposeButton';
import FilterRail from '@/components/tags/FilterRail';
import TagPortrait from '@/components/tags/TagPortrait';
import SortBar from '@/components/tags/SortBar';
import LiveWall from '@/components/LiveWall';
import MemorialFooter from '@/components/MemorialFooter';
import { activeTagIds, activeSort } from '@/lib/filters';
import type { ConfigResponse, WallResponse } from '@/lib/types';

// One memorial's front page: who this is for, then everything people have left.
//
// Rendered on the server. Most visitors arrive from a text message and open
// this on a phone with one bar of signal — the wall has to be there when the
// page paints, not after a client fetch resolves.
//
// Every link out of here is built on `base` (/c/<slug>) rather than "/", so a
// filtered wall or a single memory is still a link to THIS memorial.

export default async function MemorialWall({
  params: routeParams,
  searchParams,
}: PageProps<'/c/[slug]'>) {
  const { slug } = await routeParams;
  const base = `/c/${slug}`;
  const params = await searchParams;
  const tags = activeTagIds(params);
  const sort = activeSort(params);

  const api = memorialApiFor(slug);

  let config: ConfigResponse;
  let wall: WallResponse;

  try {
    [config, wall] = await Promise.all([
      api.config(),
      api.wall({ limit: 20, tags, sort }),
    ]);
  } catch {
    // An error page here is a dead end for someone who was invited to
    // contribute, so it says what to do next rather than what went wrong.
    //
    // The retry is a plain <a> to this same URL, not a button: this is a Server
    // Component and the thing that just failed was a server fetch, so a full
    // request is exactly what has to happen again. It also means the recovery
    // works with no JavaScript at all — which is the state a phone on one bar
    // is closest to. Without it the copy said "try again" while offering no way
    // to, and a reload was the visitor's problem to think of.
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 text-center">
        <p className="voice text-[1.25rem] text-ink-soft">
          These memories can&apos;t be reached right now.
        </p>
        <p className="mt-2 text-[0.9375rem] text-ink-faint">
          Nothing has been lost.
        </p>
        <a
          href={base}
          className="mt-7 w-full rounded-[3px] bg-dial px-5 py-3.5 text-[1rem] font-medium
                     text-card-raised"
        >
          Try again
        </a>
      </main>
    );
  }

  const { memorial } = config;
  const { memories, total } = wall;
  const name = memorial.subjectName;

  return (
    <main className="mx-auto max-w-md px-5 pb-24">
      {/* Announces memories that arrive while you're here; never moves what
          you're reading. */}
      <LiveWall instanceId={memorial.instanceId} />
      {/* ── Who this is for ─────────────────────────────────────────────── */}
      <header className="pt-12 pb-10">
        {memorial.subjectPhotoUrl ? (
          // Plain <img>: the photo URL comes from instance config and can be
          // any host, so next/image would need a remote-pattern entry per
          // memorial — a deploy step in what is otherwise a config change.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={memorial.subjectPhotoUrl}
            alt={name}
            className="mb-7 aspect-square w-full rounded-[3px] object-cover shadow-[var(--shadow-card)]"
          />
        ) : (
          // No photo configured yet. A full-bleed empty square would hand the
          // entire first screen to nothing — the name is the better hero when
          // there's no face to lead with.
          <div
            className="mb-6 flex h-20 w-20 items-center justify-center rounded-[3px]
                       bg-nil-deep shadow-[var(--shadow-card)]"
            aria-hidden
          >
            <span className="voice text-[2rem] text-ink-faint">
              {name.slice(0, 1)}
            </span>
          </div>
        )}

        <p className="eyebrow">Memories of</p>
        <h1 className="voice mt-1.5 text-[2.5rem] leading-[1.1] text-ink">{name}</h1>
        {memorial.lifespan && (
          <p className="voice mt-1 text-[1.0625rem] italic text-ink-faint">
            {memorial.lifespan}
          </p>
        )}
        {memorial.blurb && (
          <p className="voice mt-5 text-[1.125rem] leading-[1.6] text-ink-soft">
            {memorial.blurb}
          </p>
        )}

        {/* The one primary action, in the one accent. */}
        <div className="mt-7">
          <ComposeButton
            memorial={memorial}
            tags={config.tags}
            variant="primary"
            label="Share a memory"
          />
        </div>
      </header>

      {/* ── The wall ────────────────────────────────────────────────────── */}
      <section aria-label={`Memories of ${name}`}>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-y-2 border-t border-rule pt-5">
          <h2 className="eyebrow">
            {tags.length
              ? 'Filtered by'
              : total === 1 ? '1 memory' : `${total} memories`}
          </h2>
          {total > 1 && <SortBar base={base} params={params} />}
        </div>

        <FilterRail
          base={base}
          role={config.tags.role}
          experience={config.tags.experience}
          params={params}
          total={total}
          subjectName={name}
        />

        {memories.length === 0 ? (
          <p className="voice py-10 text-center text-[1.125rem] leading-[1.6] text-ink-soft">
            {tags.length ? (
              <>
                Try one word on its own,
                <br />
                or <Link href={base} className="text-dial underline underline-offset-4">show all memories</Link>.
              </>
            ) : (
              <>
                This wall is waiting for its first memory.
                <br />
                Tell us something about {name}.
              </>
            )}
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {memories.map((memory, i) => (
              <MemoryCard
                key={memory.id}
                base={base}
                memory={memory}
                subjectName={name}
                params={params}
                index={i}
              />
            ))}
          </ul>
        )}
      </section>

      <TagPortrait base={base} tags={config.tags.role} subjectName={name} params={params} />

      <MemorialFooter />
    </main>
  );
}
