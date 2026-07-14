'use client';

import { useState } from 'react';
import BottomSheet from '@/components/ui/BottomSheet';
import { StakeDots, THEME_ACCENT } from '@/components/graph/nodes';
import { OasService } from '@/services/oasService';
import { ApiError } from '@/services/api';
import type { Game, Nomination } from '@/lib/types';

// The one place to read the whole running carry-vote in rounds 3–4: every
// item carried forward this round, ranked by how close it is to becoming a
// live map. Confirmed carries pin to the top ("now mapping"); the rest show
// their progress to quorum. Support (a 1-token stake) or open, right here.

export default function CarryTally({
  game,
  nominations,
  userId,
  balance,
  open,
  onClose,
  onOpenMap,
}: {
  game: Game;
  nominations: Nomination[];
  userId: string;
  balance: number | null;
  open: boolean;
  onClose: () => void;
  onOpenMap: (mapId: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const round = Number((/^round([2-4])$/.exec(game.phase) || [])[1] || 0);
  const accent = THEME_ACCENT[round - 2] ?? 'var(--ink)';
  const theme = game.themes[round - 2] ?? '';

  const carries = nominations
    .filter(n => n.kind === 'map' && n.round === round && n.sourceEntryId && n.status !== 'expired')
    .sort((a, b) =>
      (a.status === 'confirmed' ? -1 : 0) - (b.status === 'confirmed' ? -1 : 0)
      || b.stakes.length - a.stakes.length);

  const live = carries.filter(c => c.status === 'confirmed');
  const forming = carries.filter(c => c.status !== 'confirmed');

  async function support(nom: Nomination) {
    setBusy(nom.id);
    setError(null);
    try {
      await OasService.stake(game.code, nom.id, userId);
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) setError('Out of tokens');
      else setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(null);
    }
  }

  function Row({ nom }: { nom: Nomination }) {
    const iBacked = nom.stakes.some(s => s.userId === userId);
    const isLive = nom.status === 'confirmed';
    return (
      <li className="flex items-center justify-between gap-3 rounded-xl border border-line bg-paper-raised px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-base">{nom.title}</p>
          <div className="mt-1">
            <StakeDots count={nom.stakes.length} quorum={nom.quorumThreshold} accent={accent} />
          </div>
        </div>
        {isLive ? (
          <button
            onClick={() => { onOpenMap(nom.id); onClose(); }}
            className="shrink-0 rounded-full px-3 py-1.5 text-xs text-white"
            style={{ background: accent }}
          >
            open map
          </button>
        ) : (
          <button
            disabled={busy === nom.id || iBacked || (balance !== null && balance < 1)}
            onClick={() => support(nom)}
            className="shrink-0 rounded-full border border-line-strong px-3 py-1.5 text-xs text-ink-soft disabled:opacity-40"
          >
            {iBacked ? 'backing ✓' : 'support · ● 1'}
          </button>
        )}
      </li>
    );
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      <p className="eyebrow" style={{ color: accent }}>Round {round} · {theme}</p>
      <h2 className="display mt-1 text-3xl">Running votes</h2>
      <p className="mt-1 text-sm text-ink-soft">
        {carries.length === 0
          ? 'Nothing carried forward yet — tap a revealed map to carry its comments.'
          : `${live.length} mapping · ${forming.length} gathering support.`}
      </p>

      {live.length > 0 && (
        <section className="mt-5">
          <p className="eyebrow" style={{ color: accent }}>Now mapping</p>
          <ul className="mt-2 space-y-1.5">
            {live.map(n => <Row key={n.id} nom={n} />)}
          </ul>
        </section>
      )}

      {forming.length > 0 && (
        <section className="mt-5">
          <p className="eyebrow">Gathering support</p>
          <ul className="mt-2 space-y-1.5">
            {forming.map(n => <Row key={n.id} nom={n} />)}
          </ul>
        </section>
      )}

      {error && <p className="mt-3 text-sm text-ax">{error}</p>}
    </BottomSheet>
  );
}
