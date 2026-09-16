'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { circlesApi, ApiError } from '@/services/api';
import type { Circle } from '@/lib/types';
import { Band, Card, Action, Muted } from '@/components/Shell';

// The three ways out, and they are deliberately three different acts:
//
//   Leave  — you go, the circle stays. Vacates the seat if you held it, and
//            this is the ordinary way out from under the host limit, since the
//            limit counts seats rather than circles created.
//   Close  — the circle ends, for everybody. The host's alone, and terminal.
//   Delete — erased. Only while nobody has put anything in it, which is why it
//            is offered for the circle made by mistake and never for one a
//            group has used.
//
// Confirmation is inline rather than a browser dialog: two of these cannot be
// undone, and a native confirm() reads as a page malfunction in a surface that
// otherwise never produces one.

type Pending = 'leave' | 'close' | 'delete' | null;

export function CircleActions({ circle, userId, onChanged }: {
  circle: Circle;
  userId: string;
  onChanged: () => Promise<void>;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The server's first delete condition, mirrored so the control is absent
  // rather than present-and-refused. It cannot see contribution rows, so the
  // server may still say no — and its words are what gets shown if it does.
  const neverRan = circle.seeds.every(s => !s.openedAt);

  const run = async (what: Exclude<Pending, null>) => {
    setBusy(true);
    setError(null);
    try {
      if (what === 'leave') {
        const res = await circlesApi.leaveCircle(circle.id, userId);
        // Gone, or ended by your going: there is no page to return to.
        if (res.deleted || res.closed || !res.circle) return router.push('/circles');
        return router.push('/circles');
      }
      if (what === 'close') {
        await circlesApi.closeCircle(circle.id, userId);
        await onChanged();
      }
      if (what === 'delete') {
        await circlesApi.deleteCircle(circle.id, userId);
        return router.push('/circles');
      }
      setPending(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That did not work');
    }
    setBusy(false);
  };

  if (circle.phase === 'closed') {
    return (
      <div className="mt-10">
        <Band>Closed</Band>
        <Muted>This circle has finished. Everything it made is still here to read.</Muted>
      </div>
    );
  }

  return (
    <div className="mt-10">
      <Band>This circle and you</Band>

      {error && <p className="mb-3 text-sm text-ochre">{error}</p>}

      {pending === null && (
        <div className="flex flex-wrap items-center gap-5">
          <button
            type="button"
            onClick={() => { setPending('leave'); setError(null); }}
            className="cursor-pointer text-sm text-ink-soft underline underline-offset-4 hover:text-ink"
          >
            Leave this circle
          </button>

          {circle.isHost && (
            <button
              type="button"
              onClick={() => { setPending('close'); setError(null); }}
              className="cursor-pointer text-sm text-ink-soft underline underline-offset-4 hover:text-ink"
            >
              Close it for everyone
            </button>
          )}

          {circle.isHost && neverRan && (
            <button
              type="button"
              onClick={() => { setPending('delete'); setError(null); }}
              className="cursor-pointer text-sm text-ink-soft underline underline-offset-4 hover:text-ink"
            >
              Delete it
            </button>
          )}
        </div>
      )}

      {pending !== null && (
        <Card>
          <Muted>
            {pending === 'leave' && (circle.isHost
              ? 'You will be out of this circle, and it will have no host. It stays open for everyone else — whatever is running finishes, and nothing new starts until a member takes it on.'
              : 'You will be out of this circle. It carries on without you, and you can be invited back.')}
            {pending === 'close' && 'This ends the circle for everyone. Anything running is revealed on the way out, and the record stays readable. It cannot be reopened.'}
            {pending === 'delete' && 'This erases the circle and frees its name. It is only possible because nobody has put anything in it yet.'}
          </Muted>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <Action onClick={() => run(pending)} disabled={busy}>
              {busy ? 'Working…' : pending === 'leave' ? 'Leave' : pending === 'close' ? 'Close it' : 'Delete it'}
            </Action>
            <button
              type="button"
              onClick={() => { setPending(null); setError(null); }}
              className="cursor-pointer text-sm text-ink-soft underline underline-offset-4 hover:text-ink"
            >
              Never mind
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}

/**
 * The vacant seat, offered where it matters rather than buried in settings.
 *
 * An unhosted circle is inactive, not ended: the queue keeps filling and
 * nothing opens. Taking the seat is what starts it moving again — and it is
 * also where a free account meets the host limit, which is the honest moment
 * for it, since this is when somebody takes on the work.
 */
export function VacantSeat({ circle, userId, onChanged }: {
  circle: Circle;
  userId: string;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const take = async () => {
    setBusy(true);
    setError(null);
    try {
      await circlesApi.claimHost(circle.id, userId);
      await onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That did not work');
      setBusy(false);
    }
  };

  const waiting = circle.queue.length + circle.nominations.length;

  return (
    <div className="mt-8">
      <Card>
        <Band>No host</Band>
        <Muted>
          Nobody is hosting this circle, so nothing new will start
          {waiting > 0
            ? ` — ${waiting} ${waiting === 1 ? 'ask is' : 'asks are'} waiting.`
            : '.'}
          {' '}Whatever is already running still finishes. Take it on and the circle picks up where
          it left off.
        </Muted>
        {error && <p className="mt-3 text-sm text-ochre">{error}</p>}
        <div className="mt-4">
          <Action onClick={take} disabled={busy}>
            {busy ? 'Taking it on…' : 'Host this circle'}
          </Action>
        </div>
      </Card>
    </div>
  );
}
