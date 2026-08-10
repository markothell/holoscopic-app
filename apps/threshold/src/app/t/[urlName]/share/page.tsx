'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { thresholdApi, ApiError } from '@/services/api';
import type { Circle, Pole, Share, ShareAudio } from '@/lib/types';
import { Page, Band, Card, Action, Quiet, Muted } from '@/components/Shell';
import { Polarity } from '@/components/TideLine';
import Recorder from '@/components/Recorder';

// Telling your story: record it or type it, both first-class (Q3). The brief
// describes voice notes, but ranking means comparing up to two dozen stories
// and reading is far faster than listening — so a group that mostly types gets
// a better sorting round, and the funnel has always accepted either. Every
// place that offers the recorder offers typing beside it, in the same breath
// and without apology.
//
// CHOOSING A POLE IS HOW YOU ENTER THIS SURFACE (D22). The placement is
// therefore already made when ranking opens: your own story arrives pre-placed
// on the side you chose, and never appears in the queue of things still waiting
// on you — which would otherwise read as work outstanding on a story you told.
// You can still move it while ranking, and it counts in the aggregate either way.
//
// One story per pole, so at most two per seed (D10). Re-submitting a pole
// replaces that story rather than adding a second.
//
// THE COMPOSE CARD STAGES; THIS SCREEN SENDS. Telling a side used to write it
// immediately, which made a turn two writes when somebody wanted both ends —
// and the server evaluates completion after a write, where a member holding one
// story already reads as finished. So the first send could close the round and
// the second was refused, on a topic that had moved on a moment earlier. In a
// one-member circle that happened every time; in any circle it happens to
// whoever the phase was last waiting for. Staging both sides and sending once
// removes the window rather than narrowing it, and needs nothing from the round
// machine — you have stories only once you have pressed Share, so "has at least
// one story" stays the honest test of whether somebody is done.

/** A story told but not yet sent. */
type Staged = { text: string; audio: ShareAudio | null };

export default function SharePage({ params }: { params: Promise<{ urlName: string }> }) {
  const { urlName } = use(params);
  const router = useRouter();
  const { data: session, status } = useSession();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

  const [circle, setCircle] = useState<Circle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState<Pole | null>(null);
  const [text, setText] = useState('');
  const [audio, setAudio] = useState<ShareAudio | null>(null);
  const [recordingUi, setRecordingUi] = useState(false);
  const [busy, setBusy] = useState(false);
  // Told but not yet sent. The compose card writes here and nowhere else.
  const [staged, setStaged] = useState<Partial<Record<Pole, Staged>>>({});

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
  const sent = (pole: Pole) => mine.find(s => s.pole === pole) ?? null;
  const label = (pole: Pole) => (pole === 'A' ? seed.payload.poleA : seed.payload.poleB);
  const pending = (['A', 'B'] as Pole[]).filter(p => staged[p]);

  const open = (pole: Pole) => {
    setComposing(pole);
    setText(staged[pole]?.text ?? sent(pole)?.text ?? '');
    setAudio(staged[pole]?.audio ?? null);
    setRecordingUi(false);
    setError(null);
  };

  // Held, not sent — so this cannot end the round, and the other side stays
  // open however long it takes to think of it.
  //
  // `withAudio` is what the recorder hands back. Finishing a recording IS
  // telling that story: asking for a second click that only confirms the take
  // you just listened to is a step with nothing in it. Anything already typed
  // rides along, so a story that is a recording AND a note stays both.
  const keep = (withAudio?: ShareAudio) => {
    if (!composing) return;
    setStaged(prev => ({ ...prev, [composing]: { text: text.trim(), audio: withAudio ?? audio } }));
    setComposing(null);
    setText('');
    setAudio(null);
    setRecordingUi(false);
  };

  // The one meaningful submit. Everything held goes in a single write, and the
  // round is asked whether it should move only after all of it has landed.
  const send = async () => {
    if (!userId || pending.length === 0) return;
    setBusy(true);
    try {
      await thresholdApi.submitShares(
        seed.id,
        pending.map(pole => ({
          pole,
          text: staged[pole]!.text,
          audio: staged[pole]!.audio ?? undefined,
        })),
        userId,
      );
      setStaged({});
      // Back to the circle: telling your story is finished, and the page you
      // return to is the one that says what the round is doing now.
      router.push(base);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That did not send');
      setBusy(false);
    }
  };

  const remove = async (pole: Pole) => {
    if (!userId) return;
    // Nothing held for this side has ever reached the server, so taking it back
    // is forgetting it.
    if (staged[pole]) {
      setStaged(prev => {
        const next = { ...prev };
        delete next[pole];
        return next;
      });
      if (!sent(pole)) return;
    }
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

          {recordingUi ? (
            <Recorder
              seedId={seed.id}
              maxSeconds={seed.payload.secondsPerNote}
              doneLabel="That’s it"
              onDone={a => keep(a)}
              onCancel={() => setRecordingUi(false)}
            />
          ) : audio ? (
            <div className="rounded-xl border border-[var(--rule)] p-4 text-center">
              <p className="text-sm text-ink-soft">Your recording is ready to send.</p>
              <audio controls src={audio.url} className="mt-3 w-full" />
              <button
                type="button"
                onClick={() => { setAudio(null); setRecordingUi(true); }}
                className="mt-3 text-sm text-ink-soft underline decoration-[var(--rule-strong)] underline-offset-4 hover:text-ink"
              >
                Record a different one
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setRecordingUi(true)}
              className="mb-3 w-full rounded-xl border border-[var(--rule-strong)] px-4 py-3 text-[15px] text-ink-soft transition-colors hover:border-ink hover:text-ink"
            >
              Record it instead
            </button>
          )}

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
            {/* The honest thing, said before the take is sent rather than after.
                The payload strips names; a voice in a group this size does not
                strip, and implying otherwise would be a promise the medium
                cannot keep. */}
            {(recordingUi || audio) && ' A recording carries your voice, though — in a group this size, people who know you will know you.'}
          </p>
          <div className="mt-4 flex items-center gap-4">
            {/* Keeps it and goes back to the two sides, where the other end is
                still open and one button sends whatever you have. */}
            {/* Wrapped, so the click event is never mistaken for a recording. */}
            <Action disabled={busy || (!text.trim() && !audio)} onClick={() => keep()}>
              That&rsquo;s it
            </Action>
            <Quiet onClick={() => { setComposing(null); setText(''); setAudio(null); }}>Leave it</Quiet>
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
            {(['A', 'B'] as Pole[]).map(pole => (
              <PoleCard
                key={pole}
                pole={pole}
                label={label(pole)}
                held={staged[pole] ?? null}
                sent={sent(pole)}
                busy={busy}
                onOpen={() => open(pole)}
                onRemove={() => remove(pole)}
              />
            ))}
          </div>

          {/* The one submit, and it lives here rather than in the compose card:
              this is the screen that shows both sides, so it is the only place
              somebody can see what they are about to send. */}
          {pending.length > 0 && (
            <div className="mt-8">
              <Action disabled={busy} onClick={send}>
                {busy ? 'Sending…' : 'Share'}
              </Action>
              <p className="mt-3 text-sm text-ink-faint">
                {pending.length === 2
                  ? 'Both stories go to the circle together.'
                  : 'One side is enough. The other end is there if it went both ways.'}
              </p>
            </div>
          )}

          {pending.length === 0 && mine.length > 0 && (
            <div className="mt-8">
              <Action href={base}>Back to the circle</Action>
              {mine.length === 1 && (
                <p className="mt-3 text-sm text-ink-faint">
                  You can tell one from the other end too, while this round is open.
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
function PoleCard({ pole, label, held, sent, busy, onOpen, onRemove }: {
  pole: Pole;
  label: string;
  /** Told on this visit, waiting for Share. */
  held: Staged | null;
  /** Already with the circle, from an earlier visit. */
  sent: Share | null;
  busy: boolean;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const tint = pole === 'A' ? 'var(--pole-a)' : 'var(--pole-b)';
  const wash = pole === 'A' ? 'var(--pole-a-soft)' : 'var(--pole-b-soft)';
  const told = held ?? sent;

  if (told) {
    // A recording has no text to show, so the card says what it holds rather
    // than rendering an empty line and reading as a story that failed to save.
    const preview = held
      ? (held.text || (held.audio ? 'A recording, ready to share.' : ''))
      : (sent!.text || 'A recording.');
    return (
      <div className="relative rounded-xl p-4" style={{ background: wash }}>
        {/* Deleting is an X in the corner rather than a second link under the
            story: "Change it" and "Take it back" read as two ways of editing
            until one of them throws the story away. */}
        <button
          type="button"
          onClick={onRemove}
          disabled={busy}
          aria-label={`Delete your ${label} story`}
          title="Delete"
          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full text-lg leading-none text-ink-faint transition-colors hover:bg-ground/60 hover:text-ink disabled:opacity-50"
        >
          ×
        </button>
        <p className="pr-8 text-[13px] font-medium" style={{ color: tint }}>{label}</p>
        <p className="mt-2 line-clamp-4 text-sm leading-relaxed text-ink">{preview}</p>
        <p className="mt-2 text-xs" style={{ color: tint }}>
          {held ? 'Told — sends when you share' : 'With the circle'}
        </p>
        <div className="mt-3">
          <Quiet onClick={onOpen}>Change it</Quiet>
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
