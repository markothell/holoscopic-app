'use client';

import { useCallback, useEffect, useState } from 'react';
import OverlayShell from '@/components/overlays/OverlayShell';
import SynthesisMeter from './SynthesisMeter';
import { SynthesisService } from '@/services/synthesisService';
import { ApiError } from '@/services/api';
import { synthesisSocket } from '@/services/socket';
import type { Statement, StatementBoard } from '@/lib/types';

// The VOTING surface — the second of the two statement docks. Drafting lives
// on the Union (∪), where the group's read is; this is where the group decides
// what it stands behind.
//
// Splitting them is the point. Writing is a private, slow act against the
// corpus; voting is a fast read of everyone else's words. Folding both into one
// scroll made the leaderboard feel like a byproduct of the LLM, when it is
// actually the part where the group does the work.
//
// The meter sits at the TOP, above the statements, because the group's position
// is the headline and the individual statements are how it got there.

function SlotPips({ used, total }: { used: number; total: number }) {
  return (
    <span className="inline-flex items-center gap-1" title={`${used} of ${total} slots in use`}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className="block h-1.5 w-1.5 rounded-full"
          style={{ background: i < used ? 'var(--own)' : 'var(--line-strong)' }}
        />
      ))}
    </span>
  );
}

function StatementRow({
  statement,
  collaboratorCount,
  canSpend,
  busy,
  onVote,
  onWithdraw,
}: {
  statement: Statement;
  collaboratorCount: number;
  canSpend: boolean;
  busy: boolean;
  onVote: (id: string) => void;
  onWithdraw: (id: string) => void;
}) {
  const isSynthesis = !!statement.isSynthesis;
  // Backing costs a slot; taking it back always frees one, so un-voting is
  // never blocked by a full budget.
  const blocked = !statement.votedByMe && !canSpend;

  return (
    <article
      className="rounded-2xl border px-4 py-3.5"
      style={{
        borderColor: isSynthesis ? 'var(--synthesis)' : 'var(--line-strong)',
        background: isSynthesis ? 'var(--synthesis-soft)' : 'var(--dusk-raised)',
      }}
    >
      {isSynthesis && (
        <p className="eyebrow mb-2 !text-[0.55rem]" style={{ color: 'var(--synthesis)' }}>
          ∪ where the group stands
        </p>
      )}

      <p className="voice-serif text-[0.95rem] leading-snug text-mist">{statement.text}</p>

      <div className="mt-2.5 flex items-center gap-2">
        <span className="eyebrow !text-[0.6rem] !text-mist-faint">{statement.authorHandle}</span>
        {statement.sourceUnionId && (
          <span className="eyebrow !text-[0.55rem]" style={{ color: 'var(--borrowed)' }} title="Drafted from the group's Union">
            ∪ drafted
          </span>
        )}
      </div>

      {/* This wording's own share — a thin echo of the group meter, so a row
          reads as "how much of the group is here" and not as a score. */}
      <div className="mt-3 h-1 w-full overflow-hidden rounded-full" style={{ background: 'var(--dusk-deep)' }}>
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{
            width: `${Math.min(100, (statement.share ?? 0) * 100)}%`,
            background: isSynthesis ? 'var(--synthesis)' : 'var(--own)',
          }}
        />
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-3">
        <span className="eyebrow !text-[0.6rem] !text-mist-faint">
          {statement.voteCount} of {collaboratorCount}
          {!isSynthesis && (statement.votesNeeded ?? 0) > 0 && ` · ${statement.votesNeeded} more`}
        </span>

        <span className="flex items-center gap-2">
          {statement.mine && (
            <button
              type="button"
              onClick={() => onWithdraw(statement.id)}
              disabled={busy}
              className="eyebrow !text-[0.6rem] underline disabled:opacity-40"
              style={{ color: 'var(--mist-faint)' }}
            >
              withdraw
            </button>
          )}
          <button
            type="button"
            onClick={() => onVote(statement.id)}
            disabled={busy || blocked}
            title={blocked ? 'Your slots are all in use' : undefined}
            className="eyebrow rounded-full border px-3 py-1.5 !text-[0.6rem] disabled:opacity-40"
            style={{
              borderColor: statement.votedByMe ? 'var(--own)' : 'var(--line-strong)',
              color: statement.votedByMe ? 'var(--own)' : 'var(--mist-soft)',
              background: statement.votedByMe ? 'var(--own-soft)' : 'transparent',
            }}
          >
            {statement.votedByMe ? '✓ behind this' : 'stand behind'}
          </button>
        </span>
      </div>
    </article>
  );
}

export default function StatementsOverlay({
  instanceId,
  userId,
  useMock,
  onClose,
  onDraft,
}: {
  instanceId: string;
  userId: string;
  useMock: boolean;
  onClose: () => void;
  // Drafting lives on the Union surface, so this hands off rather than
  // opening a composer here.
  onDraft: () => void;
}) {
  const [board, setBoard] = useState<StatementBoard | null>(null);
  const [loading, setLoading] = useState(!useMock);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (useMock) { setLoading(false); return; }
    SynthesisService.statements(instanceId, userId)
      .then(setBoard)
      .catch(err => setError(err instanceof Error ? err.message : 'Could not load statements'))
      .finally(() => setLoading(false));
  }, [instanceId, userId, useMock]);

  useEffect(load, [load]);

  // Someone else voting moves the same meter, so the board follows the room.
  useEffect(() => {
    if (useMock) return;
    const refresh = () => load();
    const offStatement = synthesisSocket.on('statement_upserted', refresh);
    const offSynthesis = synthesisSocket.on('synthesis_changed', refresh);
    return () => { offStatement(); offSynthesis(); };
  }, [useMock, load]);

  async function act(fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
      load();
    } catch (err) {
      // 409 is the slot budget or a withdrawn statement — a rule, not a fault.
      setError(err instanceof ApiError ? err.message : 'That did not go through');
    } finally {
      setBusy(false);
    }
  }

  const canSpend = !!board && board.slotsUsed < board.slotsTotal;

  return (
    <OverlayShell title="Synthesis" eyebrow="Where the group stands" onClose={onClose}>
      {loading ? (
        <p className="eyebrow text-mist-faint">Loading…</p>
      ) : useMock || !board ? (
        <p className="text-sm text-mist-soft">
          Statements open up once you are in a live idea.
        </p>
      ) : (
        <div className="flex flex-col gap-5 pb-4">
          <div
            className="rounded-2xl border px-4 py-4"
            style={{
              borderColor: board.inSynthesis ? 'var(--synthesis)' : 'var(--line)',
              background: 'var(--dusk-raised)',
            }}
          >
            <SynthesisMeter state={board} />
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <SlotPips used={board.slotsUsed} total={board.slotsTotal} />
              <span className="eyebrow !text-[0.6rem] !text-mist-faint">
                {board.slotsUsed} of {board.slotsTotal} slots
              </span>
            </span>
            <button
              type="button"
              onClick={onDraft}
              className="eyebrow rounded-full border px-3 py-1.5 !text-[0.6rem]"
              style={{ borderColor: 'var(--own)', color: 'var(--own)' }}
            >
              ∪ draft a statement
            </button>
          </div>

          {board.statements.length === 0 ? (
            <p className="text-sm text-mist-soft">
              The first statement starts here. Read the group&rsquo;s Union, put its
              thinking in your own words, and see who stands behind it.
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {board.statements.map(s => (
                <StatementRow
                  key={s.id}
                  statement={s}
                  collaboratorCount={board.collaboratorCount}
                  canSpend={canSpend}
                  busy={busy}
                  onVote={id => act(() => SynthesisService.voteStatement(instanceId, userId, id))}
                  onWithdraw={id => act(() => SynthesisService.withdrawStatement(instanceId, userId, id))}
                />
              ))}
            </div>
          )}

          {!canSpend && (
            <p className="eyebrow !text-[0.6rem]" style={{ color: 'var(--mist-faint)' }}>
              All {board.slotsTotal} slots are in use. Free one by withdrawing a
              statement or stepping back from one you are behind.
            </p>
          )}
          {error && <p className="text-sm" style={{ color: 'var(--live)' }}>{error}</p>}
        </div>
      )}
    </OverlayShell>
  );
}
