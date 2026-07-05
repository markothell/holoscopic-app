import type { Metadata } from 'next';
import { Suspense } from 'react';
import GameRoom from '@/components/game/GameRoom';

export async function generateMetadata(
  { params }: { params: Promise<{ code: string }> },
): Promise<Metadata> {
  const { code } = await params;
  const upper = code.toUpperCase();
  return {
    title: `On the Spectrum — room ${upper}`,
    description: `You've been put on the spectrum. Join room ${upper}.`,
    openGraph: {
      title: 'You’ve been put on the spectrum',
      description: `Join room ${upper} — nominate, vote, rank, reveal.`,
    },
  };
}

export default async function GamePage(
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  return (
    <Suspense fallback={null}>
      <GameRoom code={code.toUpperCase()} />
    </Suspense>
  );
}
