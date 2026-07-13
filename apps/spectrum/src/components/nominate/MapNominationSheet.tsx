'use client';

import { useEffect, useState } from 'react';
import BottomSheet from '@/components/ui/BottomSheet';
import Button from '@/components/ui/Button';
import { THEME_ACCENT } from '@/components/graph/nodes';
import { FrameLine, FramePreview, framesInPlay } from '@/components/frames/FrameGlyph';
import FrameComposer from '@/components/frames/FrameComposer';
import { OasService } from '@/services/oasService';
import { ApiError } from '@/services/api';
import type { FrameSpec, Game, Nomination } from '@/lib/types';

// Rounds 2–4: propose mapping a surviving subtopic through this round's
// theme, with the lens up front. The nominator builds the frame slate —
// 1 spectrum = a ranked line, 2 = a 2×2 map — typed fresh or borrowed from
// the game's shelf. Supporters see exactly this map before they stake;
// rivals can contest the slate until quorum locks it.

// A chosen frame: borrowed lenses carry their frameId, new ones just poles.
interface ChosenFrame {
  frameId?: string;
  poleA: string;
  poleB: string;
}

export default function MapNominationSheet({
  game,
  nominations,
  userId,
  open,
  preselectedSubtopicId,
  onClose,
}: {
  game: Game;
  nominations: Nomination[];
  userId: string;
  open: boolean;
  preselectedSubtopicId?: string | null;
  onClose: () => void;
}) {
  const [subtopicId, setSubtopicId] = useState<string | null>(null);
  const [chosen, setChosen] = useState<ChosenFrame[]>([]);
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fresh each open: fall back to whatever node the player came in from.
  useEffect(() => {
    if (open) { setSubtopicId(null); setChosen([]); setChanging(false); setError(null); }
  }, [open]);

  const round = Number((/^round([2-4])$/.exec(game.phase) || [])[1] || 0);
  const themeIndex = round - 2;
  const theme = game.themes[themeIndex] ?? '';
  const accent = THEME_ACCENT[themeIndex] ?? 'var(--ink)';

  const confirmedSubtopics = nominations.filter(
    n => n.kind === 'subtopic' && n.status === 'confirmed');
  // Parent titles, so a branched subtopic reads unambiguously even when a
  // label recurs on another branch.
  const subtopicTitles = new Map(
    nominations.filter(n => n.kind === 'subtopic').map(n => [n.id, n.title]));

  // A subtopic can host several maps a round — one per lens. Count the live
  // ones so the list reads honestly, and lock their frames out of the slate.
  const mapsOnSubtopic = new Map<string, Nomination[]>();
  for (const n of nominations) {
    if (n.kind !== 'map' || n.round !== round || n.status === 'expired' || !n.subtopicId) continue;
    if (!mapsOnSubtopic.has(n.subtopicId)) mapsOnSubtopic.set(n.subtopicId, []);
    mapsOnSubtopic.get(n.subtopicId)!.push(n);
  }

  const effectiveSubtopicId = subtopicId ?? preselectedSubtopicId ?? null;
  const selectedSub = confirmedSubtopics.find(s => s.id === effectiveSubtopicId) ?? null;
  // Arrived from a node? Show the chosen subtopic, not the whole list — the
  // list only reappears if they tap "change".
  const showList = !selectedSub || changing;
  const selectedParent = selectedSub?.parentSubtopicId
    ? subtopicTitles.get(selectedSub.parentSubtopicId) : null;

  const shelf = framesInPlay(nominations);
  // Frames already mapping (or contesting) the selected subtopic this round
  // — a rival map needs a genuinely different lens — plus the ones already
  // on this proposal. A confirmed map only claims its locked axes; a frame
  // that lost its slate vote is fair game again.
  const unavailable = new Set<string>();
  if (effectiveSubtopicId) {
    for (const rival of mapsOnSubtopic.get(effectiveSubtopicId) ?? []) {
      const claimed = rival.status === 'confirmed' && rival.mapState
        ? rival.mapState.winningAxes
        : rival.frameSlate ?? [];
      for (const f of claimed) unavailable.add(f.frameId);
    }
  }
  for (const c of chosen) if (c.frameId) unavailable.add(c.frameId);

  async function submit() {
    if (!effectiveSubtopicId) { setError('Pick a subtopic first'); return; }
    if (chosen.length < 1) { setError('Give the map a spectrum first'); return; }
    setBusy(true);
    setError(null);
    try {
      const frames: FrameSpec[] = chosen.map(c =>
        c.frameId ? { frameId: c.frameId } : { poleA: c.poleA, poleB: c.poleB });
      await OasService.nominateMap(game.code, effectiveSubtopicId, frames, userId);
      setSubtopicId(null);
      setChosen([]);
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        setError('Out of tokens — finish a map or wait for returns.');
      } else {
        setError(err instanceof Error ? err.message : 'Could not nominate');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      <p className="eyebrow" style={{ color: accent }}>Round {round} · {theme} · costs 1 token</p>
      <h2 className="display mt-1 text-3xl">Propose a map</h2>
      <p className="mt-1 text-sm text-ink-soft">
        {game.config.quorum} tokens make it live. Your spectrum{chosen.length === 2 ? 's' : ''} can
        be challenged until then — supporters vote before it locks.
      </p>

      {!showList && selectedSub ? (
        <div className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-line-strong bg-paper-raised px-3 py-2.5">
          <div className="min-w-0">
            <p className="eyebrow !text-ink-faint">Mapping</p>
            {selectedParent && (
              <span className="eyebrow block !text-ink-faint opacity-60">{selectedParent} ›</span>
            )}
            <p className="truncate text-base">{selectedSub.title}</p>
          </div>
          <button
            onClick={() => setChanging(true)}
            className="shrink-0 text-sm text-ink-soft underline"
          >
            change
          </button>
        </div>
      ) : (
        <>
          <p className="eyebrow mb-2 mt-5">Subtopic</p>
          <ul className="max-h-56 space-y-1.5 overflow-y-auto">
            {confirmedSubtopics.map(s => {
              const liveLenses = mapsOnSubtopic.get(s.id)?.length ?? 0;
              const selected = effectiveSubtopicId === s.id;
              const parentTitle = s.parentSubtopicId ? subtopicTitles.get(s.parentSubtopicId) : null;
              return (
                <li key={s.id}>
                  <button
                    onClick={() => { setSubtopicId(s.id); setChanging(false); }}
                    className={`w-full rounded-xl border px-3 py-2.5 text-left text-base transition-colors ${
                      selected ? 'border-ink bg-ink text-paper'
                      : 'border-line-strong bg-paper-raised active:bg-paper-dim'
                    }`}
                  >
                    {parentTitle && (
                      <span className="eyebrow block !text-inherit opacity-60">{parentTitle} ›</span>
                    )}
                    {s.title}
                    {liveLenses > 0 && (
                      <span className="eyebrow ml-2 !text-inherit opacity-60">
                        {liveLenses} spectrum{liveLenses > 1 ? 's' : ''} on it — bring a new one
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
            {confirmedSubtopics.length === 0 && (
              <li className="rounded-xl border border-dashed border-line-strong px-3 py-2 text-sm text-ink-soft">
                No subtopics survived round 1.
              </li>
            )}
          </ul>
        </>
      )}

      <p className="eyebrow mb-2 mt-5">
        The spectrum{chosen.length === 2 ? 's' : ''} — 1 makes a line, 2 make a 2×2
      </p>

      {chosen.length > 0 && (
        <>
          <FramePreview
            axes={chosen.map(c => ({ frameId: c.frameId ?? '', poleA: c.poleA, poleB: c.poleB }))}
            accent={accent}
            compact
          />
          <ul className="mt-2 space-y-1.5">
            {chosen.map((c, i) => (
              <li
                key={`${c.frameId ?? c.poleA}-${i}`}
                className="flex items-center gap-3 rounded-xl border border-line bg-paper-raised px-3 py-2"
              >
                <span className="eyebrow shrink-0" style={{ color: accent }}>
                  {chosen.length === 2 ? (i === 0 ? '→' : '↑') : '→'}
                </span>
                <FrameLine poleA={c.poleA} poleB={c.poleB} accent={accent} className="min-w-0 flex-1" />
                <button
                  onClick={() => setChosen(prev => prev.filter((_, j) => j !== i))}
                  aria-label={`Remove ${c.poleB} — ${c.poleA}`}
                  className="shrink-0 text-sm text-ink-faint"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {chosen.length < 2 && (
        <div className={chosen.length > 0 ? 'mt-3' : ''}>
          <FrameComposer
            accent={accent}
            shelf={shelf}
            disabledFrameIds={unavailable}
            busy={busy}
            onPick={pick => setChosen(prev =>
              prev.length >= 2 ? prev : [...prev, pick])}
          />
        </div>
      )}

      <Button
        className="mt-6"
        onClick={submit}
        disabled={busy || !effectiveSubtopicId || chosen.length < 1}
      >
        {busy ? 'Proposing…' : 'Propose · ● 1'}
      </Button>
      {error && <p className="mt-3 text-sm text-ax">{error}</p>}
    </BottomSheet>
  );
}
