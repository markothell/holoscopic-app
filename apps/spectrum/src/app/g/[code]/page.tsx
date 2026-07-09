import type { Metadata } from 'next';
import { Suspense } from 'react';
import GameShell from '@/components/game/GameShell';

export async function generateMetadata(
  { params }: { params: Promise<{ code: string }> },
): Promise<Metadata> {
  const { code } = await params;
  const upper = code.toUpperCase();
  return {
    title: `On a Spectrum — room ${upper}`,
    description: `Help organize a collective mind. Join room ${upper}.`,
    openGraph: {
      title: 'You’re invited to organize a collective mind',
      description: `Join room ${upper} — nominate, stake, map, revise.`,
    },
  };
}

export default async function GamePage(
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  return (
    <Suspense fallback={null}>
      <GameShell code={code.toUpperCase()} />
    </Suspense>
  );
}
