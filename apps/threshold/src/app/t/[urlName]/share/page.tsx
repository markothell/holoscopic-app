'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { thresholdApi, ApiError } from '@/services/api';
import type { Circle, Pole, Share } from '@/lib/types';
import { Page, Band, Card, Action, Quiet, Muted } from '@/components/Shell';
import { Polarity } from '@/components/TideLine';

// Telling your story. Text only for now — the recorder is M3b, and building the
// flow first means the browser-dependent half lands on something already known
// to work.
//
// CHOOSING A POLE IS HOW YOU ENTER THIS SURFACE (D22). The placement is
// therefore already made when ranking opens: your own story arrives pre-placed
// on the side you chose, and never appears in the queue of things still waiting
// on you — which would otherwise read as work outstanding on a story you told.
// You can still move it while ranking, and it counts in the aggregate either way.
//
// One story per pole, so at most two per seed (D10). Re-submitting a pole
// replaces that story rather than adding a second.

export default function SharePage({ params }: { params: Promise<{ urlName: string }> }) {
  const { urlName } = use(params);
  const { data: session, status } = useSession();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

  const [circle, setCircle] = useState<Circle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState<Pole | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { circle } = await thresholdApi.getCircle(urlName, userId);
      setCircle(circle);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load this circle');
    }
  }, [urlName, userId]);

  useEffect(() => {
    if (status === 'loading' || !userId) return;
    void load();
  }, [status, userId, load]);

  if (status === 'loading' || (!circle && !error)) return <Page><Muted>…</Muted></Page>;
  if (!circle) return <Page><Muted>{error}</Muted></Page>;

  const seed = circle.currentSeed;
  const base = `/t/${circle.urlName}`;

  // Every email links to the circle page, so somebody can still arrive here
  // after the round turned over. Say what happened rather than showing a form
  // that would be refused.
  if (!seed || seed.phase !== 'share') {
    return (
      <Page>
        <Muted>This topic has moved on from telling stories.</Muted>
        <div className="mt-4"><Action href={base}>Back to the circle</Action></div>
      </Page>
    );
  }

  const mine: Share[] = (circle.shares ?? []).filter(s => s.isMine);
  const on = (pole: Pole) => mine.find(s => s.pole === pole) ?? null;
  const label = (pole: Pole) => (pole === 'A' ? seed.payload.poleA : seed.payload.poleB);

  const open = (pole: Pole) => {
    setComposing(pole);
    setText(on(pole)?.text ?? '');
    setError(null);
  };

  const save = async () => {
    if (!composing || !userId) return;
    setBusy(true);
    try {
      await thresholdApi.submitShare(seed.id, { pole: composing, text: text.trim() }, userId);
      setComposing(null);
      setText('');
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That did not save');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (pole: Pole) => {
    if (!userId) return;
    setBusy(true);
    try {
      await thresholdApi.deleteShare(seed.id, pole, userId);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That did not work');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <header className="mb-8">
        <Quiet href={base}>{circle.title}</Quiet>
        <h1 className="mt-2 font-[family-name:var(--font-source-serif)] text-3xl leading-tight">
          {seed.payload.topic}
        </h1>
        <Polarity poleA={seed.payload.poleA} poleB={seed.payload.poleB} className="mt-3" />
      </header>

      {error && <p className="mb-6 text-sm text-pole-b">{error}</p>}

      {composing ? (
        <Card>
          <Band>A time it was {label(composing)}</Band>
          <textarea
            autoFocus
            value={text}
            onChange={e => setText(e.target.value)}
            maxLength={2000}
            rows={8}
            placeholder="What happened?"
            className="w-full resize-none rounded-lg border border-[var(--rule)] bg-ground/40 p-3 text-[15px] leading-relaxed outline-none focus:border-[var(--rule-strong)]"
          />
          {/* Said BEFORE anything is written, never after. The claim has to be
              exactly true: the payload withholds names while the group sorts,
              and hands them back at the reveal. When M3b lands, this is also
              where the honest caveat about a recognisable voice goes — a
              recording identifies its speaker whatever the payload strips. */}
          <p className="mt-3 text-xs leading-relaxed text-ink-faint">
            While the group sorts these, they appear with no name on them. Once the topic reveals,
            everyone can see who told which.
          </p>
          <div className="mt-4 flex items-center gap-4">
            <Action disabled={busy || !text.trim()} onClick={save}>
              {on(composing) ? 'Save the change' : 'Tell it'}
            </Action>
            <Quiet onClick={() => { setComposing(null); setText(''); }}>Leave it</Quiet>
          </div>
        </Card>
      ) : (
        <>
          <Band>Which side was it?</Band>
          <Muted>
            Tell us about a time {seed.payload.topic.charAt(0).toLowerCase() + seed.payload.topic.slice(1)}{' '}
            was one of these. Choosing a side is how you start — it is where your story sits when
            the group comes to sort them, and you can move it then.
          </Muted>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {(['A', 'B'] as Pole[]).map(pole => {
              const told = on(pole);
              return (
                <PoleCard
                  key={pole}
                  pole={pole}
                  label={label(pole)}
                  told={told}
                  busy={busy}
                  onOpen={() => open(pole)}
                  onRemove={() => remove(pole)}
                />
              );
            })}
          </div>

          {mine.length > 0 && (
            <div className="mt-8">
              <Action href={base}>Back to the circle</Action>
              {mine.length === 1 && (
                <p className="mt-3 text-sm text-ink-faint">
                  You can tell one from the other end too, if it went both ways.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </Page>
  );
}

/**
 * One end of the polarity, as a target. The two ends carry the app's two fixed
 * colours (D26) and the seed's own words — nothing a participant reads ever
 * says "A" or "B".
 */
function PoleCard({ pole, label, told, busy, onOpen, onRemove }: {
  pole: Pole;
  label: string;
  told: Share | null;
  busy: boolean;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const tint = pole === 'A' ? 'var(--pole-a)' : 'var(--pole-b)';
  const wash = pole === 'A' ? 'var(--pole-a-soft)' : 'var(--pole-b-soft)';

  if (told) {
    return (
      <div className="rounded-xl p-4" style={{ background: wash }}>
        <p className="text-[13px] font-medium" style={{ color: tint }}>{label}</p>
        <p className="mt-2 line-clamp-4 text-sm leading-relaxed text-ink">{told.text}</p>
        <div className="mt-3 flex items-center gap-4">
          <Quiet onClick={onOpen}>Change it</Quiet>
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            className="text-sm text-ink-faint underline decoration-[var(--rule-strong)] underline-offset-4 hover:text-ink disabled:opacity-50"
          >
            Take it back
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={busy}
      className="rounded-xl border p-4 text-left transition-colors disabled:opacity-50"
      style={{ borderColor: tint, color: tint }}
    >
      <span className="text-[15px] font-medium">{label}</span>
      <span className="mt-1 block text-sm text-ink-soft">Tell a time it was this</span>
    </button>
  );
}
