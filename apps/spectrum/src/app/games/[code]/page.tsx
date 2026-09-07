import type { Metadata } from 'next';
import { Suspense } from 'react';
import PublicGame from '@/components/public/PublicGame';

// /games/<code> — the public record of a FINISHED game, under the same
// namespace as the public pulse at /games. The room itself stays at
// /g/<code> behind sign-in; this is the read-only half, and it refuses
// anything that hasn't reached `complete`.

export async function generateMetadata(
  { params }: { params: Promise<{ code: string }> },
): Promise<Metadata> {
  const { code } = await params;
  const upper = code.toUpperCase();
  return {
    title: `On a Spectrum — game ${upper}`,
    description: `A finished game of On a Spectrum: the subtopics, the spectrums the group coined, and every map it revealed.`,
    openGraph: {
      title: 'A finished game of On a Spectrum',
      description: 'The subtopics, the spectrums the group coined, and every map it revealed.',
    },
  };
}

export default async function PublicGamePage(
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  return (
    <Suspense fallback={null}>
      <PublicGame code={code.toUpperCase()} />
    </Suspense>
  );
}
