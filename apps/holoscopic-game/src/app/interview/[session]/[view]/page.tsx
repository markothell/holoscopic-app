import { notFound } from 'next/navigation';
import InterViewHub, { type HubView } from '@/components/hub/InterViewHub';
import GameRules from '@/components/GameRules';
import GameLeaderboard from '@/components/GameLeaderboard';

const HUB_VIEWS = ['topics', 'frames', 'patterns'] as const;

export default async function GameViewPage({ params }: {
  params: Promise<{ session: string; view: string }>;
}) {
  const { view } = await params;

  if (view === 'rules') return <GameRules />;
  if (view === 'leaderboard') return <GameLeaderboard />;
  if ((HUB_VIEWS as readonly string[]).includes(view)) {
    return <InterViewHub key={view} view={view as HubView} />;
  }
  notFound();
}
