import type { Metadata } from 'next';
import { loadMemorial } from '@/lib/memorial';
import { MemorialProvider } from '@/components/MemorialProvider';
import MemorialUnavailable from '@/components/MemorialUnavailable';
import MemorialNotFound from '@/components/MemorialNotFound';
import Beacon from '@/components/Beacon';

// Everything under /c/<slug> is one memorial.
//
// This layout is the single place the slug turns into a resolved memorial, and
// the single place a slug that names no memorial becomes a 404. Doing it here
// rather than in each page is what lets client components several levels down
// — the compose sheet, the report control — act on the right memorial without
// the slug being threaded through as a prop at every step.
//
// loadMemorial lives in lib/memorial.ts and is request-cached, so the two
// calls below — metadata and body — plus the page's own are one fetch.

// Props come from Next's generated route types (`LayoutProps`/`PageProps`),
// not hand-written shapes. They are keyed on the literal route, so renaming or
// moving this folder turns into a type error here rather than into a `slug`
// that is silently `undefined` at runtime.
export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const load = await loadMemorial(slug);
  // Falls back to something dignified rather than "Chorus" — an app name means
  // nothing to someone arriving from a message about a person they knew. This
  // is also the right answer for a busy or unreachable read: a share preview
  // has nothing useful to say about a transient failure, and saying the wrong
  // name would be worse than saying little.
  if (load.state !== 'ok') return { title: 'Memories' };

  const name = load.memorial.subjectName;
  const description = load.memorial.blurb || `Share a memory of ${name}.`;
  return {
    // The title and share preview come from the memorial's own config, so a
    // texted link says who it is for.
    title: `Memories of ${name}`,
    description,
    openGraph: {
      title: `Memories of ${name}`,
      description,
      images: load.memorial.subjectPhotoUrl ? [load.memorial.subjectPhotoUrl] : undefined,
    },
    // A memorial is for people who were sent the link, not for search results.
    // The person it is about did not choose to be written about publicly, and
    // neither did anyone named inside a story (PLAN §8).
    robots: { index: false, follow: false },
  };
}

export default async function MemorialLayout({
  children, params,
}: LayoutProps<'/c/[slug]'>) {
  const { slug } = await params;
  const load = await loadMemorial(slug);

  // Three different pieces of news, told apart.
  //
  // This used to be `if (!memorial) notFound()` over a loader that caught
  // every error — so a rate limit, an Atlas failover or a deploy restart all
  // told a visitor that the memorial did not exist. That is the cruellest
  // sentence this app can produce and it was the default answer to every
  // transient blip. Now only 'missing' says the link names nothing; 'busy'
  // says everyone arrived at once; anything else says try again.
  //
  // Rendered rather than thrown — see MemorialNotFound for why notFound()
  // cannot be used here.
  if (load.state === 'missing') return <MemorialNotFound />;
  if (load.state !== 'ok') {
    return <MemorialUnavailable reason={load.state} href={`/c/${slug}`} />;
  }
  const { memorial } = load;

  return (
    <MemorialProvider
      slug={slug}
      instanceId={memorial.instanceId}
      subjectName={memorial.subjectName}
    >
      {/* Counted here rather than in the root layout, because this is the only
          place the memorial is known — one deployment serves every one of
          them, so a view without a slug attributes a family's traffic to
          nothing. Clicks stay off: a memorial is somewhere people write about
          someone they lost, and instrumenting what they touch there buys a
          number nobody should want. */}
      <Beacon app="chorus" instanceId={memorial.instanceId} slug={slug} />
      {children}
    </MemorialProvider>
  );
}
