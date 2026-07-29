import Link from 'next/link';
import { notFound } from 'next/navigation';
import { memorialApi } from '@/services/api';
import PromptSentence from '@/components/PromptSentence';
import ComposeButton from '@/components/compose/ComposeButton';
import AudioPill from '@/components/audio/AudioPill';
import TagLink from '@/components/tags/TagLink';
import LiveWall from '@/components/LiveWall';
import ReportMemory from '@/components/ReportMemory';
import { ApiError } from '@/services/api';
import type { Memory } from '@/lib/types';

// One memory, at full size, with everything linked to it.
//
// The full prompt sentence leads here — this is the page people screenshot and
// send on, so the sentence gets the room the wall card denies it. Below the
// story sits the rest of the thread: "linked memories appear whenever one of
// them is selected" is a single query on threadId (PLAN §3.3), and opening any
// member shows the whole cluster, not just what was added after it.

function Sibling({ memory, subjectName }: { memory: Memory; subjectName: string }) {
  return (
    <li>
      <Link
        href={`/m/${memory.id}`}
        className="block rounded-[3px] bg-card px-5 py-4 shadow-[var(--shadow-card)]
                   transition-shadow duration-300 hover:shadow-[var(--shadow-lift)]"
      >
        <p className="text-[0.8125rem] text-ink-faint">
          {memory.anonymous ? 'Left anonymously' : memory.sharerName}
        </p>
        <p className="voice mt-1.5 text-[1.0625rem] leading-[1.6] text-ink-soft">
          {memory.body.text.slice(0, 150)}
          {memory.body.text.length > 150 ? '…' : ''}
        </p>
        <div className="mt-2.5">
          <PromptSentence
            density="compact"
            subjectName={subjectName}
            subjectTags={memory.subjectTags}
            selfTags={memory.selfTags}
            experienceTags={memory.experienceTags}
          />
        </div>
      </Link>
    </li>
  );
}

export default async function MemoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let detail;
  let config;
  try {
    [config, detail] = await Promise.all([
      memorialApi.config(),
      memorialApi.memory(id),
    ]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const { memory, thread } = detail;
  const name = config.memorial.subjectName;

  return (
    <main className="mx-auto max-w-md px-5 pb-24">
      {/* Lets a transcript appear the moment Deepgram returns it. */}
      <LiveWall instanceId={config.memorial.instanceId} announce={false} />
      <nav className="pt-8 pb-6">
        <Link
          href="/"
          className="text-[0.9375rem] text-ink-faint transition-colors hover:text-ink"
        >
          ← All memories of {name}
        </Link>
      </nav>

      <article>
        <h1 className="voice text-[2rem] leading-[1.15] text-ink">{memory.title}</h1>

        <p className="mt-3 text-[0.9375rem] text-ink-faint">
          {memory.anonymous ? 'Left anonymously' : memory.sharerName}
          {memory.replyTo && (
            <>
              {' · added to '}
              <Link
                href={`/m/${memory.replyTo.id}`}
                className="underline decoration-rule underline-offset-2 hover:text-ink"
              >
                {memory.replyTo.anonymous
                  ? 'an earlier memory'
                  : `${memory.replyTo.sharerName}’s memory`}
              </Link>
            </>
          )}
        </p>

        {/* The screenshot artifact. */}
        <div className="my-7 border-y border-rule py-6">
          <PromptSentence
            subjectName={name}
            subjectTags={memory.subjectTags}
            selfTags={memory.selfTags}
            experienceTags={memory.experienceTags}
          />
        </div>

        {memory.body.audio && (
          <div className="mb-7">
            <AudioPill memoryId={memory.id} audio={memory.body.audio} size="full" />
            {/* The transcript is a way to read a memory you can't play — on a
                bus, in a hospital corridor, or with the sound off. It's the
                spoken words, so it's set in the same voice as a typed story. */}
            {memory.body.audio.transcript.status === 'ready' && (
              <details className="mt-3">
                <summary className="cursor-pointer text-[0.9375rem] text-ink-faint">
                  Read it instead
                </summary>
                <p className="voice mt-3 text-[1.0625rem] leading-[1.65] text-ink-soft">
                  {memory.body.audio.transcript.text}
                </p>
              </details>
            )}
          </div>
        )}

        {memory.body.text && (
          <div className="voice whitespace-pre-line text-[1.1875rem] leading-[1.7] text-ink">
            {memory.body.text}
          </div>
        )}

        {/* The same words, now as a way out into everyone else's stories.
            Reading one memory is the moment you most want the next one. */}
        {[...memory.subjectTags, ...memory.selfTags, ...memory.experienceTags].length > 0 && (
          <div className="mt-8 border-t border-rule pt-5">
            <p className="eyebrow mb-3">Find more like this</p>
            <div className="flex flex-wrap gap-2">
              {[...memory.subjectTags, ...memory.selfTags, ...memory.experienceTags]
                // A tag chosen in two slots is one word, not two chips.
                .filter((t, i, all) => all.findIndex(x => x.id === t.id) === i)
                .map(tag => (
                  <TagLink key={tag.id} tag={tag} href={`/?tags=${tag.id}`} />
                ))}
            </div>
          </div>
        )}
      </article>

      {thread.length > 0 && (
        <section className="mt-12" aria-label="Also on this memory">
          <h2 className="eyebrow mb-4 border-t border-rule pt-5">
            Also on this memory
          </h2>
          <ul className="flex flex-col gap-3">
            {thread.map(sibling => (
              <Sibling key={sibling.id} memory={sibling} subjectName={name} />
            ))}
          </ul>
        </section>
      )}

      {/* The quietest thing on the page, and the only route a visitor has to
          raise a concern about a memory. */}
      <div className="mt-10 border-t border-rule pt-5">
        <ReportMemory memoryId={memory.id} />
      </div>

      {/* Prefilled with this memory's title and tags — you're describing the
          same afternoon as the person you're answering. */}
      <div className="mt-8">
        <ComposeButton
          memorial={config.memorial}
          tags={config.tags}
          variant="secondary"
          label="Add to this memory"
          addTo={{
            id: memory.id,
            title: memory.title,
            subjectTags: memory.subjectTags.map(t => t.label),
            selfTags: memory.selfTags.map(t => t.label),
            experienceTags: memory.experienceTags.map(t => t.label),
          }}
        />
      </div>
    </main>
  );
}
