import { notFound } from 'next/navigation';
import InterViewHub, { type HubView } from '@/components/hub/InterViewHub';
import GameRules from '@/components/GameRules';

const HUB_VIEWS = ['topics', 'frames', 'patterns'] as const;

/**
 * Game-numbered routes: /interview/g1/topics | frames | patterns | rules.
 * The g<N> segment keeps edition links stable; the active edition is
 * resolved by InstanceContext (one instance per domain).
 */
export default async function GameViewPage({ params }: {
  params: Promise<{ game: string; view: string }>;
}) {
  const { game, view } = await params;
  if (!/^g\d+$/.test(game)) notFound();

  if (view === 'rules') return <GameRules />;
  if ((HUB_VIEWS as readonly string[]).includes(view)) {
    return <InterViewHub key={view} view={view as HubView} />;
  }
  notFound();
}
