'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { thresholdApi, ApiError } from '@/services/api';
import type { Circle, Pole, ShareAudio } from '@/lib/types';
import { Page, Band, Card, Action, Quiet, Muted } from '@/components/Shell';
import { Polarity } from '@/components/TideLine';
import Recorder from '@/components/Recorder';

// Posting a topic. Any member, any time — the queue never closes (D27), and a
// topic posted into an idle circle starts running immediately.
//
// TWO STEPS, AND THE SECOND ONE IS OPTIONAL. Putting a topic up is meant to be
// cheap: a subject and two words. The queue's whole premise is that a topic
// nobody backs costs nothing, which only holds if proposing one costs nothing
// either — so demanding a story up front would buy tidiness with the thing that
// makes the queue work.
//
// But people propose a topic BECAUSE something happened to them, and a topic
// can sit in the queue for weeks. So once it is up, the surface offers the two
// poles: tell it now while you have it, or leave it for when the topic runs.
// Only the author may do this on a queued topic — everybody else's turn is when
// it runs, because a topic nobody backs never runs and their story would go
// unread (utils/threshold.js#assertOpenForStories).
//
// The validation is fixed server-side (utils/threshold.js#normalizeSeed): a
// topic up to 120 chars, two pole labels up to 40 each, and they may not be the
// same word — two identical ends give every ranker the same bucket twice, which
// makes agreement meaningless rather than merely uninteresting.
//
// The pole COLOURS are not chosen here and never will be: they are the app's
// identity, fixed once so neither end of anybody's polarity looks like the
// right answer (D26).

export default function SeedPage({ params }: { params: Promise<{ urlName: string }> }) {
  const { urlName } = use(params);
  const router = useRouter();
  const { data: session, status } = useSession();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

  const [circle, setCircle] = useState<Circle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [topic, setTopic] = useState('');
  const [poleA, setPoleA] = useState('');
  const [poleB, setPoleB] = useState('');

  // Set once the topic is up. From here the surface is about the story.
  const [posted, setPosted] = useState<
    { seedId: string; topic: string; poleA: string; poleB: string; secondsPerNote: number } | null
  >(null);
  const [pole, setPole] = useState<Pole | null>(null);
  const [text, setText] = useState('');
  const [audio, setAudio] = useState<ShareAudio | null>(null);
  const [recordingUi, setRecordingUi] = useState(false);
  const [told, setTold] = useState(false);

  const load = useCallback(async () => {
    try {
      const { circle } = await thresholdApi.getCircle(urlName, userId);
      setCircle(circle);
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

  const base = `/t/${circle.urlName}`;

  const put = async () => {
    if (!userId) return;
    setBusy(true);
    setError(null);
    try {
      const { circle: after } = await thresholdApi.addSeed(
        circle.id,
        { topic: topic.trim(), poleA: poleA.trim(), poleB: poleB.trim() },
        userId,
      );
      setCircle(after);
      // The one the server just made is the newest of mine. Reading it back
      // rather than trusting the input means the story step uses the same
      // normalized labels the ranking surface will show.
      const id = after.mySeedIds[after.mySeedIds.length - 1];
      const seed = after.seeds.find(s => s.id === id);
      if (seed) {
        setPosted({
          seedId: seed.id,
          topic: seed.payload.topic,
          poleA: seed.payload.poleA,
          poleB: seed.payload.poleB,
          // The cap is the SEED'S own, never a constant here — normalizeSeed
          // clamps it and this reads back what it settled on.
          secondsPerNote: seed.payload.secondsPerNote,
        });
        // A topic posted into an idle circle starts running immediately, and
        // then the ordinary share surface is the right place to be.
        if (seed.phase !== 'pending') router.push(`${base}/share`);
      } else {
        router.push(base);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That did not go up');
    } finally {
      setBusy(false);
    }
  };

  const tell = async () => {
    if (!posted || !pole || !userId) return;
    setBusy(true);
    try {
      await thresholdApi.submitShare(
        posted.seedId,
        { pole, text: text.trim(), audio: audio ?? undefined },
        userId,
      );
      setTold(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That did not save');
    } finally {
      setBusy(false);
    }
  };

  // ── Step 2: it is up, and the story is on offer ───────────────────────────

  if (posted) {
    return (
      <Page>
        <header className="mb-8">
          <Quiet href={base}>{circle.title}</Quiet>
          <h1 className="mt-2 font-[family-name:var(--font-source-serif)] text-3xl leading-tight">
            {posted.topic}
          </h1>
          <Polarity poleA={posted.poleA} poleB={posted.poleB} className="mt-3" />
        </header>

        {error && <p className="mb-6 text-sm text-pole-b">{error}</p>}

        <Card>
          {told ? (
            <>
              <Band>Both are in</Band>
              <Muted>
                Your topic is in the queue with your story on it. The most-backed topic runs next,
                and everyone tells theirs when it does.
              </Muted>
              <div className="mt-4"><Action href={base}>Back to the circle</Action></div>
            </>
          ) : (
            <>
              <Band>It is in the queue</Band>
              <Muted>
                Others can back it, and the most-backed topic goes next. You can tell your own story
                now while you have it, or leave it until the topic runs.
              </Muted>

              <div className="mt-5">
                <p className="mb-2 text-sm text-ink-soft">Which side was yours?</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(['A', 'B'] as Pole[]).map(p => {
                    const label = p === 'A' ? posted.poleA : posted.poleB;
                    const tint = p === 'A' ? 'var(--pole-a)' : 'var(--pole-b)';
                    const wash = p === 'A' ? 'var(--pole-a-soft)' : 'var(--pole-b-soft)';
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPole(p)}
                        aria-pressed={pole === p}
                        className="rounded-xl border px-4 py-3 text-left text-[15px] font-medium transition-colors"
                        style={{
                          borderColor: tint,
                          color: tint,
                          background: pole === p ? wash : 'transparent',
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {pole && recordingUi && (
                <div className="mt-5">
                  <Recorder
                    seedId={posted.seedId}
                    maxSeconds={posted.secondsPerNote}
                    onDone={a => { setAudio(a); setRecordingUi(false); }}
                    onCancel={() => setRecordingUi(false)}
                  />
                </div>
              )}

              {pole && !recordingUi && (
                <div className="mt-5">
                  {audio ? (
                    <div className="mb-3 rounded-xl border border-[var(--rule)] p-4 text-center">
                      <p className="text-sm text-ink-soft">Your recording is ready to send.</p>
                      <audio controls src={audio.url} className="mt-3 w-full" />
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
                    rows={7}
                    placeholder="What happened?"
                    className="w-full resize-none rounded-lg border border-[var(--rule)] bg-ground/40 p-3 text-[15px] leading-relaxed outline-none focus:border-[var(--rule-strong)]"
                  />
                  {/* Said before anything is written, and claiming exactly what
                      the payload does. M3b adds the recognisable-voice caveat
                      here — a recording identifies its speaker whatever the
                      payload strips. */}
                  <p className="mt-3 text-xs leading-relaxed text-ink-faint">
                    While the group sorts these, they appear with no name on them. Once the topic
                    reveals, everyone can see who told which.
                    {(recordingUi || audio) && ' A recording carries your voice, though — in a group this size, people who know you will know you.'}
                  </p>
                </div>
              )}

              <div className="mt-5 flex items-center gap-4">
                {pole && <Action disabled={busy || (!text.trim() && !audio)} onClick={tell}>Tell it</Action>}
                <Quiet href={base}>{pole ? 'Leave it for now' : 'Leave it until it runs'}</Quiet>
              </div>
            </>
          )}
        </Card>
      </Page>
    );
  }

  // ── Step 1: the topic ─────────────────────────────────────────────────────

  const ready = topic.trim() && poleA.trim() && poleB.trim();

  return (
    <Page>
      <header className="mb-8">
        <Quiet href={base}>{circle.title}</Quiet>
        <h1 className="mt-2 font-[family-name:var(--font-source-serif)] text-3xl leading-tight">
          Post a topic
        </h1>
      </header>

      {error && <p className="mb-6 text-sm text-pole-b">{error}</p>}

      <Card>
        <Band>A subject</Band>
        <input
          value={topic}
          onChange={e => setTopic(e.target.value)}
          maxLength={120}
          placeholder="Being told what to do"
          className="mb-6 w-full rounded-lg border border-[var(--rule)] bg-ground/40 p-3 text-[15px] outline-none focus:border-[var(--rule-strong)]"
        />

        <Band>And the two ends people sort between</Band>
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            value={poleA}
            onChange={e => setPoleA(e.target.value)}
            maxLength={40}
            placeholder="Restful"
            className="w-full rounded-lg border p-3 text-[15px] outline-none"
            style={{ borderColor: 'var(--pole-a)', color: 'var(--pole-a)' }}
          />
          <input
            value={poleB}
            onChange={e => setPoleB(e.target.value)}
            maxLength={40}
            placeholder="Diminishing"
            className="w-full rounded-lg border p-3 text-[15px] outline-none"
            style={{ borderColor: 'var(--pole-b)', color: 'var(--pole-b)' }}
          />
        </div>

        {ready && <Polarity poleA={poleA.trim()} poleB={poleB.trim()} className="mt-5" />}

        <p className="mt-5 text-xs leading-relaxed text-ink-faint">
          Two ends that a real story could fall on either side of. The colours are the same for
          every topic in every circle, so neither end reads as the right answer.
        </p>

        <div className="mt-5 flex items-center gap-4">
          <Action disabled={busy || !ready} onClick={put}>Put it up</Action>
          <Quiet href={base}>Back to the circle</Quiet>
        </div>
      </Card>
    </Page>
  );
}
