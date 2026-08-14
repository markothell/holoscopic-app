'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { toyrokApi, ApiError } from '@/services/api';
import type { Circle, Placement, Pole, Seed, SeedResult, Share, ShareAudio, ShareResult } from '@/lib/types';
import { Page, Band, Card, Action, Quiet, Muted } from '@/components/Shell';
import { Polarity } from '@/components/Polarity';
import { storyPreview, StoryText, StoryAudio } from '@/components/Story';
import Recorder from '@/components/Recorder';

// One exploration, phase-routed: telling, sorting, or the reveal — whatever
// the topic is actually doing when you arrive. The map and the running-now
// card both land here, so this page never assumes a phase; it reads the
// snapshot and shows the surface that is true.
//
// The mechanics are Threshold's, ported (its D-numbers cited where a rule is
// load-bearing). Telling is typed-first for now — recording arrives with the
// audio port — but playback is already here, because circles carry recordings
// from their Threshold life and a silent story reads as a broken one.
//
// Sky appears once, in the header's "running now" mark, only while this topic
// is the live one (DESIGN.md rule 1).

export default function TopicPage({ params }: { params: Promise<{ urlName: string; seedId: string }> }) {
  const { urlName, seedId } = use(params);
  const { data: session, status } = useSession();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

  const [circle, setCircle] = useState<Circle | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { circle } = await toyrokApi.getCircle(urlName, userId);
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

  if (status === 'loading' || (!circle && !error && userId)) return <Page><Muted>…</Muted></Page>;

  if (!userId) {
    return (
      <Page>
        <h1 className="mb-2 text-3xl">Sign in</h1>
        <Muted>Circles are member spaces, so this page needs to know who you are.</Muted>
        <div className="mt-5"><Action href={`/login?callbackUrl=/c/${urlName}/topic/${seedId}`}>Sign in</Action></div>
      </Page>
    );
  }
  if (!circle) return <Page><Muted>{error}</Muted></Page>;

  const seed = circle.seeds.find(s => s.id === seedId);
  if (!seed) return <Page><Muted>Not found</Muted></Page>;

  const base = `/c/${circle.urlName}`;
  const live = circle.liveSeedId === seed.id;
  const done = seed.phase === 'revealed' || seed.phase === 'skipped';

  const header = (
    <header className="mb-8">
      <Quiet href={base}>{circle.title}</Quiet>
      <h1 className="mt-2 text-3xl leading-tight">{seed.payload.topic}</h1>
      <Polarity poleA={seed.payload.poleA} poleB={seed.payload.poleB} className="mt-3" />
      {live && (
        <p className="mt-3 flex items-center gap-2 text-sm" style={{ color: 'var(--sky)' }}>
          <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: 'var(--sky)' }} />
          running now
        </p>
      )}
    </header>
  );

  if (done) {
    return <Reveal circle={circle} seed={seed} userId={userId} header={header} base={base} />;
  }
  if (live && seed.phase === 'share') {
    return (
      <Tell circle={circle} seed={seed} userId={userId} header={header} base={base}
        onDone={load} pageError={error} />
    );
  }
  if (live && seed.phase === 'rank') {
    return (
      <Sort circle={circle} seed={seed} userId={userId} header={header} base={base}
        onChanged={load} />
    );
  }

  // Queued: on the map it is not drawn yet; from the record it cannot be
  // reached. Someone lands here from an old link.
  return (
    <Page>
      {header}
      <Muted>This topic is waiting its turn in the queue.</Muted>
      <div className="mt-5"><Action href={base}>Back to the circle</Action></div>
    </Page>
  );
}

// ── Telling ─────────────────────────────────────────────────────────────────
//
// Choosing a side is how you enter (D22); the compose card STAGES and one
// button sends everything in a single write (D36) — two writes would let the
// first end the round and the second be refused. One story per pole (D10).

/** A story told but not yet sent. */
type Staged = { text: string; audio: ShareAudio | null };

function Tell({ circle, seed, userId, header, base, onDone, pageError }: {
  circle: Circle; seed: Seed; userId: string;
  header: React.ReactNode; base: string;
  onDone: () => Promise<void>; pageError: string | null;
}) {
  const router = useRouter();
  const [composing, setComposing] = useState<Pole | null>(null);
  const [text, setText] = useState('');
  const [audio, setAudio] = useState<ShareAudio | null>(null);
  const [recordingUi, setRecordingUi] = useState(false);
  const [staged, setStaged] = useState<Partial<Record<Pole, Staged>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(pageError);

  const mine = (circle.shares ?? []).filter(s => s.isMine);
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

  // Held, not sent — so this cannot end the round. `withAudio` is what the
  // recorder hands back: finishing a take IS telling that story, and anything
  // already typed rides along.
  const keep = (withAudio?: ShareAudio) => {
    if (!composing) return;
    const a = withAudio ?? audio;
    if (!text.trim() && !a) return;
    setStaged(prev => ({ ...prev, [composing]: { text: text.trim(), audio: a } }));
    setComposing(null);
    setText('');
    setAudio(null);
    setRecordingUi(false);
  };

  const send = async () => {
    if (pending.length === 0) return;
    setBusy(true);
    try {
      await toyrokApi.submitShares(
        seed.id,
        pending.map(pole => ({
          pole,
          text: staged[pole]!.text,
          audio: staged[pole]!.audio ?? undefined,
        })),
        userId,
      );
      setStaged({});
      router.push(base);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That did not send');
      setBusy(false);
    }
  };

  const remove = async (pole: Pole) => {
    if (staged[pole] !== undefined) {
      setStaged(prev => {
        const next = { ...prev };
        delete next[pole];
        return next;
      });
      if (!sent(pole)) return;
    }
    setBusy(true);
    try {
      await toyrokApi.deleteShare(seed.id, pole, userId);
      await onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That did not work');
    } finally {
      setBusy(false);
    }
  };

  if (composing) {
    return (
      <Page>
        {header}
        {error && <p className="mb-6 text-sm text-pole-b">{error}</p>}
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
                className="mt-3 cursor-pointer text-sm text-ink-soft underline decoration-[var(--rule-strong)] underline-offset-4 hover:text-ink"
              >
                Record a different one
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setRecordingUi(true)}
              className="mb-3 w-full cursor-pointer rounded-xl border border-[var(--rule-strong)] px-4 py-3 text-[15px] text-ink-soft transition-colors hover:border-ink hover:text-ink"
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
            className="mt-3 w-full resize-none rounded-lg border border-[var(--rule)] bg-ground/50 p-3 text-[15px] leading-relaxed outline-none focus:border-[var(--rule-strong)]"
          />
          {/* Said BEFORE anything is written: the payload withholds names while
              the group sorts and hands them back at the reveal (D9/D17). The
              voice caveat is the honest thing said before the take is sent —
              the payload strips names; a voice in a group this size does not. */}
          <p className="mt-3 text-xs leading-relaxed text-ink-faint">
            While the group sorts these, they appear with no name on them. Once the topic reveals,
            everyone can see who told which.
            {(recordingUi || audio) && ' A recording carries your voice, though — in a group this size, people who know you will know you.'}
          </p>
          <div className="mt-4 flex items-center gap-4">
            <Action disabled={busy || (!text.trim() && !audio)} onClick={() => keep()}>
              That&rsquo;s it
            </Action>
            <Quiet onClick={() => { setComposing(null); setText(''); setAudio(null); }}>Leave it</Quiet>
          </div>
        </Card>
      </Page>
    );
  }

  return (
    <Page>
      {header}
      {error && <p className="mb-6 text-sm text-pole-b">{error}</p>}

      <Band>Which side was it?</Band>
      <Muted>
        Tell a time it was one of these. Choosing a side is how you start — it is where your
        story sits when the group comes to sort them, and you can move it then.
      </Muted>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {(['A', 'B'] as Pole[]).map(pole => {
          const tint = pole === 'A' ? 'var(--pole-a)' : 'var(--pole-b)';
          const wash = pole === 'A' ? 'var(--pole-a-soft)' : 'var(--pole-b-soft)';
          const held = staged[pole];
          const already = sent(pole);
          if (held || already) {
            // A recording has no text to show, so the card says what it holds
            // rather than rendering an empty line.
            const preview = held
              ? (held.text || (held.audio ? 'A recording, ready to share.' : ''))
              : (already!.text || 'A recording.');
            return (
              <div key={pole} className="relative rounded-xl p-4" style={{ background: wash }}>
                <button
                  type="button"
                  onClick={() => remove(pole)}
                  disabled={busy}
                  aria-label={`Delete your ${label(pole)} story`}
                  title="Delete"
                  className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full text-lg leading-none text-ink-faint transition-colors hover:bg-ground/60 hover:text-ink disabled:opacity-50"
                >
                  ×
                </button>
                <p className="pr-8 text-[13px] font-medium" style={{ color: tint }}>{label(pole)}</p>
                <p className="mt-2 line-clamp-4 text-sm leading-relaxed text-ink">{preview}</p>
                <p className="mt-2 text-xs" style={{ color: tint }}>
                  {held ? 'Told — sends when you share' : 'With the circle'}
                </p>
                <div className="mt-3"><Quiet onClick={() => open(pole)}>Change it</Quiet></div>
              </div>
            );
          }
          return (
            <button
              key={pole}
              type="button"
              onClick={() => open(pole)}
              disabled={busy}
              className="cursor-pointer rounded-xl border p-4 text-left transition-colors disabled:opacity-50"
              style={{ borderColor: tint, color: tint }}
            >
              <span className="text-[15px] font-medium">{label(pole)}</span>
              <span className="mt-1 block text-sm text-ink-soft">Tell a time it was this</span>
            </button>
          );
        })}
      </div>

      {pending.length > 0 && (
        <div className="mt-8">
          <Action disabled={busy} onClick={send}>{busy ? 'Sending…' : 'Share'}</Action>
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
    </Page>
  );
}

// ── Sorting ─────────────────────────────────────────────────────────────────
//
// A queue, then a review screen that owns submit (D21). One story at a time
// with two big targets; drafts save as you sort and count toward nothing;
// submit is complete-or-nothing (D11). Your own stories arrive pre-placed on
// the side you chose (D22) — the server did that, nothing to seed here.

/** A stable per-reader order, so whoever posts first gains no anchor. */
function readerOrder<T extends { id: string }>(items: T[], salt: string): T[] {
  const key = (id: string) => {
    let h = 2166136261;
    for (const ch of `${salt}:${id}`) {
      h ^= ch.charCodeAt(0);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };
  return [...items].sort((a, b) => key(a.id) - key(b.id));
}

function Sort({ circle, seed, userId, header, base, onChanged }: {
  circle: Circle; seed: Seed; userId: string;
  header: React.ReactNode; base: string;
  onChanged: () => Promise<void>;
}) {
  const initial = useMemo(() => {
    const next: Record<string, Pole> = {};
    for (const p of circle.myRanking?.placements ?? []) next[p.shareId] = p.pole;
    return next;
  }, [circle.myRanking]);

  const [placements, setPlacements] = useState<Record<string, Pole>>(initial);
  const [reviewing, setReviewing] = useState(Boolean(circle.myRanking?.submittedAt));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shares = useMemo(
    () => readerOrder(circle.shares ?? [], `${userId}:${seed.id}`),
    [circle.shares, userId, seed.id],
  );

  const submitted = Boolean(circle.myRanking?.submittedAt);
  const label = (pole: Pole) => (pole === 'A' ? seed.payload.poleA : seed.payload.poleB);
  const queue = shares.filter(s => !placements[s.id]);
  const current = queue[0] ?? null;

  const asPlacements = (map: Record<string, Pole>): Placement[] =>
    Object.entries(map).map(([shareId, pole]) => ({ shareId, pole }));

  const place = async (shareId: string, pole: Pole) => {
    const next = { ...placements, [shareId]: pole };
    setPlacements(next);
    if (shares.filter(s => !next[s.id]).length === 0) setReviewing(true);
    if (submitted) return;
    try {
      await toyrokApi.saveRankingDraft(seed.id, asPlacements(next), userId);
    } catch {
      setError('That placement is saved here but did not reach the server yet.');
    }
  };

  const submit = async () => {
    setBusy(true);
    try {
      await toyrokApi.submitRanking(seed.id, asPlacements(placements), userId);
      await onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That did not submit');
    } finally {
      setBusy(false);
    }
  };

  if (!reviewing && current) {
    return (
      <Page>
        {header}
        {error && <p className="mb-6 text-sm text-pole-b">{error}</p>}
        <Card>
          {/* No name, and none arrived: the server withholds attribution for
              everybody but you while the group is sorting (D9). */}
          <Band>Someone in the circle</Band>
          <StoryAudio share={current} className="mb-4 w-full" />
          <StoryText share={current} className="text-[17px] leading-relaxed" />
        </Card>

        <p className="mt-6 mb-3 text-center text-sm text-ink-soft">Which side is this?</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {(['A', 'B'] as Pole[]).map(pole => (
            <button
              key={pole}
              type="button"
              onClick={() => place(current.id, pole)}
              className="cursor-pointer rounded-xl border px-4 py-5 text-[15px] font-medium transition-colors hover:opacity-80"
              style={{
                borderColor: pole === 'A' ? 'var(--pole-a)' : 'var(--pole-b)',
                color: pole === 'A' ? 'var(--pole-a)' : 'var(--pole-b)',
              }}
            >
              {label(pole)}
            </button>
          ))}
        </div>

        <div className="mt-8 flex items-center gap-5">
          <Quiet onClick={() => setReviewing(true)}>See them all</Quiet>
          <Quiet href={base}>Come back to this</Quiet>
        </div>
      </Page>
    );
  }

  return (
    <Page>
      {header}
      {error && <p className="mb-6 text-sm text-pole-b">{error}</p>}

      {submitted && (
        <div className="mb-8">
          <Card>
            <Muted>
              Your sorting is in. The topic reveals once the group is done, or when its clock
              runs out.
            </Muted>
            <div className="mt-4"><Action href={base}>Back to the circle</Action></div>
          </Card>
        </div>
      )}

      <div className="space-y-8">
        {(['A', 'B'] as Pole[]).map(pole => (
          <section key={pole}>
            <Band>
              <span style={{ color: pole === 'A' ? 'var(--pole-a)' : 'var(--pole-b)' }}>
                {label(pole)}
              </span>
            </Band>
            {shares.filter(s => placements[s.id] === pole).length === 0 ? (
              <Muted>Nothing here yet.</Muted>
            ) : (
              <ul className="space-y-3">
                {shares.filter(s => placements[s.id] === pole).map(s => (
                  <li
                    key={s.id}
                    className="rounded-lg p-3"
                    style={{ background: pole === 'A' ? 'var(--pole-a-soft)' : 'var(--pole-b-soft)' }}
                  >
                    <StoryAudio share={s} className="mb-2 w-full" />
                    <StoryText share={s} className="text-sm leading-relaxed" />
                    <div className="mt-2 flex items-center gap-3 text-xs text-ink-faint">
                      {s.isMine && <span>yours</span>}
                      {!submitted && (
                        <button
                          type="button"
                          onClick={() => place(s.id, pole === 'A' ? 'B' : 'A')}
                          className="cursor-pointer underline underline-offset-4 hover:text-ink"
                        >
                          move to {label(pole === 'A' ? 'B' : 'A')}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}

        {/* What is left to do IS the remaining stories — never a count, never
            a dead button. */}
        {queue.length > 0 && (
          <section>
            <Band>Still to read</Band>
            <ul className="mb-4 space-y-2">
              {queue.map(s => (
                <li key={s.id} className="text-sm leading-relaxed text-ink-soft">
                  {storyPreview(s)}
                </li>
              ))}
            </ul>
            <Action onClick={() => setReviewing(false)}>Sort the rest</Action>
          </section>
        )}
      </div>

      {!submitted && queue.length === 0 && (
        <div className="mt-10 border-t border-[var(--rule)] pt-6">
          <Muted>
            Everything is placed. Sending it in is what puts it into the group&rsquo;s picture.
          </Muted>
          <div className="mt-4 flex items-center gap-5">
            <Action disabled={busy} onClick={submit}>Send in your sorting</Action>
            <Quiet href={base}>Leave it for now</Quiet>
          </div>
        </div>
      )}
    </Page>
  );
}

// ── The reveal ──────────────────────────────────────────────────────────────
//
// Three groups — two poles and the middle — and no position inside a group
// (D23). Where the line sits is a reader's control (D24): agreement is stored,
// bands never are (D15), so moving the line is a re-render. The middle band
// wears the map's shared/rope pair: it is what the group made together.

type Cutoff = 'half' | 'three-quarters' | 'all';
type BandKey = 'A' | 'middle' | 'B';

const CUTOFFS: { key: Cutoff; label: string; c: number }[] = [
  { key: 'half', label: 'more than half', c: 0.5 },
  { key: 'three-quarters', label: 'three in four', c: 0.75 },
  { key: 'all', label: 'all of them', c: 1 },
];

const MIN_RANKERS = 3;

function bandOf(agreement: number | null, c: number): BandKey {
  if (agreement === null) return 'middle';
  if (agreement >= c && agreement > 0.5) return 'A';
  if (agreement <= 1 - c && agreement < 0.5) return 'B';
  return 'middle';
}

function Reveal({ circle, seed, userId, header, base }: {
  circle: Circle; seed: Seed; userId: string;
  header: React.ReactNode; base: string;
}) {
  const [data, setData] = useState<{ result: SeedResult; shares: Share[]; seed: Seed } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cutoff, setCutoff] = useState<Cutoff>('three-quarters');
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    toyrokApi.seedResult(seed.id, userId)
      .then(setData)
      .catch(e => setError(e instanceof ApiError ? e.message : 'Could not load this topic'));
  }, [seed.id, userId]);

  const c = CUTOFFS.find(x => x.key === cutoff)!.c;

  const groups = useMemo(() => {
    const out: Record<BandKey, { share: Share; row: ShareResult }[]> = { A: [], middle: [], B: [] };
    if (!data) return out;
    const byId = new Map(data.shares.map(s => [s.id, s]));
    for (const row of data.result.shares) {
      const share = byId.get(row.shareId);
      if (share) out[bandOf(row.agreement, c)].push({ share, row });
    }
    return out;
  }, [data, c]);

  if (!data && !error) return <Page><Muted>…</Muted></Page>;
  if (!data) return <Page>{header}<Muted>{error}</Muted></Page>;

  const { result } = data;
  const poleA = seed.payload.poleA;
  const poleB = seed.payload.poleB;
  const enough = result.rankers >= MIN_RANKERS;
  const middle = groups.middle.length;

  return (
    <Page>
      {header}
      <p className="-mt-4 mb-8 text-sm text-ink-faint">
        {result.shares.length} {result.shares.length === 1 ? 'story' : 'stories'} ·{' '}
        {result.rankers} {result.rankers === 1 ? 'person' : 'people'} sorted them
        {seed.phase === 'skipped' && ' · the group moved on part-way'}
      </p>

      {enough ? (
        <>
          <div className="mb-8">
            <Band>Change the threshold</Band>
            <p className="mb-3 text-sm leading-relaxed text-ink-soft">
              A story sits at one end when this many people read it that way.
            </p>
            <div className="flex flex-wrap gap-2">
              {CUTOFFS.map(o => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setCutoff(o.key)}
                  aria-pressed={cutoff === o.key}
                  className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm transition-colors ${
                    cutoff === o.key
                      ? 'border-ink bg-ink text-card'
                      : 'border-[var(--rule-strong)] text-ink-soft hover:border-ink hover:text-ink'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <StoryGroup
            label={poleA} tint="var(--pole-a)" wash="var(--pole-a-soft)"
            rows={groups.A} open={open} onOpen={setOpen} poleA={poleA} poleB={poleB}
            empty="No story was read this way by that many people."
          />

          {/* The subject of the screen. Its population is the finding. */}
          <section className="my-8 rounded-xl border border-[var(--rule)] bg-shared/60 p-5">
            <Band>Across the line</Band>
            {middle > 0 ? (
              <>
                <p className="mb-4 text-sm leading-relaxed text-ink-soft">
                  {middle === 1
                    ? 'One story sits across the line. The group agreed about the rest.'
                    : `${middle} stories sit across the line. That is where the group's reading came apart.`}
                </p>
                <ul className="space-y-2">
                  {groups.middle.map(({ share, row }) => (
                    <Story
                      key={share.id} share={share} row={row}
                      tint="var(--rope)" wash="var(--shared)"
                      expanded={open === share.id}
                      onOpen={() => setOpen(open === share.id ? null : share.id)}
                      poleA={poleA} poleB={poleB}
                    />
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-[15px] leading-relaxed text-ink-soft">
                {cutoff === 'all'
                  ? 'Every person read every story the same way.'
                  : 'Nothing sits across the line at this setting. Ask for more agreement to see where it comes apart.'}
              </p>
            )}
          </section>

          <StoryGroup
            label={poleB} tint="var(--pole-b)" wash="var(--pole-b-soft)"
            rows={groups.B} open={open} onOpen={setOpen} poleA={poleA} poleB={poleB}
            empty="No story was read this way by that many people."
          />
        </>
      ) : (
        <>
          {/* Below three rankings the stories are here and attributed, and the
              screen says nothing about a group's line — there is no group yet
              to have one. */}
          <Muted>
            {result.rankers === 0
              ? 'Nobody sorted these, so the stories stand as they were told.'
              : `${result.rankers} ${result.rankers === 1 ? 'person' : 'people'} sorted these. Where a group's line falls takes three, so here are the stories and how the sorting went.`}
          </Muted>
          <ul className="mt-6 space-y-2">
            {data.result.shares.map(row => {
              const share = data.shares.find(s => s.id === row.shareId);
              if (!share) return null;
              return (
                <Story
                  key={row.shareId} share={share} row={row}
                  tint="var(--rope)" wash="var(--shared)"
                  expanded={open === row.shareId}
                  onOpen={() => setOpen(open === row.shareId ? null : row.shareId)}
                  poleA={poleA} poleB={poleB}
                />
              );
            })}
          </ul>
        </>
      )}

      <div className="mt-10 border-t border-[var(--rule)] pt-6">
        <Action href={base}>Back to the circle</Action>
      </div>
    </Page>
  );
}

function StoryGroup({ label, tint, wash, rows, open, onOpen, poleA, poleB, empty }: {
  label: string; tint: string; wash: string;
  rows: { share: Share; row: ShareResult }[];
  open: string | null; onOpen: (id: string | null) => void;
  poleA: string; poleB: string; empty: string;
}) {
  return (
    <section>
      <Band><span style={{ color: tint }}>{label}</span></Band>
      {rows.length === 0 ? (
        <Muted>{empty}</Muted>
      ) : (
        <ul className="space-y-2">
          {rows.map(({ share, row }) => (
            <Story
              key={share.id} share={share} row={row} tint={tint} wash={wash}
              expanded={open === share.id}
              onOpen={() => onOpen(open === share.id ? null : share.id)}
              poleA={poleA} poleB={poleB}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/** A dot with a preview, expanding on tap — teller, split, and playback live
 *  inside the expanded state, never on every dot (D23). */
function Story({ share, row, tint, wash, expanded, onOpen, poleA, poleB }: {
  share: Share; row: ShareResult; tint: string; wash: string;
  expanded: boolean; onOpen: () => void; poleA: string; poleB: string;
}) {
  const preview = storyPreview(share);
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-expanded={expanded}
        className="flex w-full cursor-pointer items-start gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-ground-deep"
      >
        <span aria-hidden className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: tint }} />
        <span className={`text-sm leading-relaxed ${expanded ? 'text-ink' : 'text-ink-soft'}`}>
          {expanded ? (share.text || (share.audio ? '' : preview)) : preview}
        </span>
      </button>

      {expanded && (
        <div className="ml-8 mt-1 rounded-lg p-3 text-xs" style={{ background: wash }}>
          {share.audio && (
            <div className="mb-3">
              <StoryAudio share={share} />
              {!share.text && <StoryText share={share} className="mt-2 text-sm leading-relaxed text-ink" />}
            </div>
          )}
          {/* Attributed, because the topic has revealed (D9). */}
          <p className="text-ink-soft">
            {share.username ? <strong className="font-medium text-ink">{share.username}</strong> : 'Someone'}
            {' told it as '}
            {share.pole === 'A' ? poleA : poleB}
          </p>
          {row.agreement !== null && (
            <p className="mt-1 text-ink-faint">
              {row.splits.a} read it as {poleA} · {row.splits.b} as {poleB}
            </p>
          )}
        </div>
      )}
    </li>
  );
}
