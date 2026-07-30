import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { memorialApiFor } from '@/services/api';
import { MemorialProvider } from '@/components/MemorialProvider';

// Everything under /c/<slug> is one memorial.
//
// This layout is the single place the slug turns into a resolved memorial, and
// the single place a slug that names no memorial becomes a 404. Doing it here
// rather than in each page is what lets client components several levels down
// — the compose sheet, the report control — act on the right memorial without
// the slug being threaded through as a prop at every step.

async function loadMemorial(slug: string) {
  try {
    const { memorial } = await memorialApiFor(slug).config();
    // resolveInstance falls back to the platform's default instance when a
    // header names nothing it recognises, so a typo'd slug returns a perfectly
    // valid config for the WRONG memorial. Only a config that names a subject
    // is a memorial; anything else is that fallback, and it must 404.
    if (!memorial?.subjectName) return null;
    return memorial;
  } catch {
    return null;
  }
}

// Props come from Next's generated route types (`LayoutProps`/`PageProps`),
// not hand-written shapes. They are keyed on the literal route, so renaming or
// moving this folder turns into a type error here rather than into a `slug`
// that is silently `undefined` at runtime.
export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const memorial = await loadMemorial(slug);
  // Falls back to something dignified rather than "Chorus" — an app name means
  // nothing to someone arriving from a message about a person they knew.
  if (!memorial) return { title: 'Memories' };

  const name = memorial.subjectName;
  const description = memorial.blurb || `Share a memory of ${name}.`;
  return {
    // The title and share preview come from the memorial's own config, so a
    // texted link says who it is for.
    title: `Memories of ${name}`,
    description,
    openGraph: {
      title: `Memories of ${name}`,
      description,
      images: memorial.subjectPhotoUrl ? [memorial.subjectPhotoUrl] : undefined,
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
  const memorial = await loadMemorial(slug);
  if (!memorial) notFound();

  return (
    <MemorialProvider
      slug={slug}
      instanceId={memorial.instanceId}
      subjectName={memorial.subjectName}
    >
      {children}
    </MemorialProvider>
  );
}
