'use client';

// One gather ask, phase-routed (PRIMITIVES.md §9): respond while it runs,
// the reveal once it closes — and because input stays open after the reveal
// (B4), the two are one surface with the compose offered wherever it is still
// honest. Visibility is all server-side: sealed serves own-only until the
// close, so this page renders whatever arrives and never filters.

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Page, Band, Card, Muted, Action, Quiet } from '@/components/Shell';
import Recorder from '@/components/Recorder';
import { ResponseRing, StackChart, DotMap, Portrait, ResponseCard, stopX, stopOf, STOP_COUNT } from '@/components/gather';
import { circlesApi, ApiError } from '@/services/api';
import type {
  Circle, Seed, GatherExtras, GatherResponse, GatherVocabWord, ShareAudio,
} from '@/lib/types';
import { seedActivityOf } from '@/lib/types';

export default function ActivityPage({ params }: { params: Promise<{ urlName: string; seedId: string }> }) {
  const { urlName, seedId } = use(params);
  const { data: session, status } = useSession();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;
  const base = `/c/${urlName}`;

  const [circle, setCircle] = useState<Circle | null>(null);
  const [extras, setExtras] = useState<GatherExtras | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { circle } = await circlesApi.getCircle(urlName, userId);
      setCircle(circle);
      setError(null);
      if (userId && circle.isMember) {
        try {
          const { seed: _seed, ...ex } = await circlesApi.seedResponses(circle.id, seedId, userId);
          setExtras(ex as GatherExtras);
        } catch (e) {
          // A 404 is the ordinary queued state — the guard below says so in
          // words. Anything else is a real failure and must not be swallowed
          // into an empty surface.
          setExtras(null);
          if (!(e instanceof ApiError && e.status === 404)) {
            console.error('[gather] responses read failed:', e);
            setError(e instanceof ApiError ? e.message : 'Could not load the responses — reload to retry');
          }
        }
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load this circle');
    }
  }, [urlName, seedId, userId]);

  useEffect(() => {
    if (status === 'loading') return;
    void load();
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [status, load]);

  if (status === 'loading' || (!circle && !error)) return <Page><Muted>…</Muted></Page>;
  if (!userId) {
    return (
      <Page>
        <Card>
          <Muted>This is a member space.</Muted>
          <div className="mt-4">
            <Action href={`/login?callbackUrl=${encodeURIComponent(`${base}/activity/${seedId}`)}`}>Sign in</Action>
          </div>
        </Card>
      </Page>
    );
  }
  if (!circle) return <Page><p className="text-ochre">{error}</p></Page>;

  const seed = circle.seeds.find(s => s.id === seedId);
  if (!seed || seedActivityOf(circle, seed) !== 'gather') {
    return (
      <Page>
        <Muted>Nothing here by that name.</Muted>
        <div className="mt-4"><Action href={base}>To the circle</Action></div>
      </Page>
    );
  }
  if (!circle.isMember) {
    return (
      <Page>
        <Muted>This activity belongs to {circle.title}&rsquo;s members.</Muted>
        <div className="mt-4"><Action href={base}>To the circle</Action></div>
      </Page>
    );
  }

  const queued = seed.phase === 'pending' || seed.phase === 'nominated';
  const header = (
    <div className="pt-2">
      <Quiet href={base}>{circle.title}</Quiet>
      <h1 className="mt-1 text-2xl leading-snug" style={{ textWrap: 'balance' }}>
        {seed.payload.prompt}
      </h1>
      {seed.payload.context && <Muted>{seed.payload.context}</Muted>}
    </div>
  );

  if (queued) {
    const more = Math.max(0, (circle.approvalsToStart ?? 3) - seed.supporterCount);
    return (
      <Page>
        {header}
        <div className="mt-6">
          {seed.phase === 'nominated' ? (
            <>
              <Muted>
                Put to the circle — {more === 0
                  ? 'ready to start.'
                  : `${more} more ${more === 1 ? 'backer' : 'backers'} and it starts.`}
              </Muted>
              <div className="mt-4">
                <Action onClick={async () => {
                  await circlesApi.supportSeed(circle.id, seed.id, userId);
                  await load();
                }}>
                  {seed.iSupport ? 'Backed — take it back' : 'Back this'}
                </Action>
              </div>
            </>
          ) : (
            <Muted>Approved — waiting for a slot.</Muted>
          )}
        </div>
      </Page>
    );
  }

  return (
    <GatherSurface
      key={`${seed.id}:${seed.phase}`}
      circle={circle}
      seed={seed}
      extras={extras}
      userId={userId}
      header={header}
      onChanged={load}
      pageError={error}
    />
  );
}

// ---------------------------------------------------------------------------
// The surface — respond + reveal in one, because B4 keeps input open
// ---------------------------------------------------------------------------

function GatherSurface({ circle, seed, extras, userId, header, onChanged, pageError }: {
  circle: Circle;
  seed: Seed;
  extras: GatherExtras | null;
  userId: string;
  header: React.ReactNode;
  onChanged: () => Promise<void>;
  pageError: string | null;
}) {
  const cfg = seed.payload;
  const shape = cfg.shape ?? 'story';
  const done = seed.phase === 'revealed' || seed.phase === 'skipped';
  const open = cfg.reveal === 'open' || done;
  const storyShape = shape === 'story' || shape === 'story-placement';
  const canReact = Boolean(cfg.reactions) && storyShape && open;

  const responses = extras?.responses ?? [];
  const myResponse = extras?.myResponse ?? null;
  const vocabulary = extras?.vocabulary ?? null;

  const [composing, setComposing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(pageError);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [activeWordId, setActiveWordId] = useState<string | null>(null);
  const [confirmReveal, setConfirmReveal] = useState(false);

  const submit = async (body: {
    text?: string; audio?: ShareAudio | null;
    position?: { x: number; y?: number } | null; words?: string[] | null;
  }) => {
    setBusy(true);
    setError(null);
    try {
      await circlesApi.respond(circle.id, seed.id, userId, {
        text: body.text ?? '',
        audio: body.audio ?? undefined,
        position: body.position ?? undefined,
        words: body.words ?? undefined,
      });
      setComposing(false);
      await onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That did not go through — try again');
    } finally {
      setBusy(false);
    }
  };

  const react = async (shareId: string) => {
    try {
      await circlesApi.react(circle.id, seed.id, shareId, userId);
      await onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That did not land');
    }
  };

  const revealNow = async () => {
    setBusy(true);
    try {
      await circlesApi.advanceSeed(circle.id, seed.id, userId);
      setConfirmReveal(false);
      await onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That did not work');
    } finally {
      setBusy(false);
    }
  };

  // --- the state line (S13/S19/S20) ---------------------------------------

  const isFacilitator = circle.isCreator || seed.authorId === userId;
  const stateLine = (() => {
    if (done) {
      return myResponse
        ? 'Revealed — still open; a late response joins.'
        : 'Revealed — and still open for yours.';
    }
    if (cfg.reveal === 'open') {
      return `${responses.length} of ${circle.memberCount} have answered${countdownTail(seed.phaseDeadline)}`;
    }
    return myResponse
      ? `Waiting on results — yours is in${countdownTail(seed.phaseDeadline)}`
      : `Sealed until everyone has answered${countdownTail(seed.phaseDeadline)}`;
  })();

  const composeOpen = composing || (!myResponse && !done) || (!myResponse && done);

  return (
    <Page>
      {header}

      <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p className="text-sm text-ink-soft">{stateLine}</p>
        {!done && isFacilitator && (confirmReveal ? (
          <span className="text-sm text-ink-soft">
            Reveal now? It can&rsquo;t be unsealed.{' '}
            <button type="button" onClick={revealNow} disabled={busy} className="cursor-pointer underline underline-offset-4 hover:text-ink">Reveal</button>
            {' · '}
            <button type="button" onClick={() => setConfirmReveal(false)} className="cursor-pointer underline underline-offset-4 hover:text-ink">Keep waiting</button>
          </span>
        ) : (
          <Quiet onClick={() => setConfirmReveal(true)}>Reveal now</Quiet>
        ))}
      </div>

      {error && <p className="mt-3 text-sm text-pole-b">{error}</p>}

      {/* --- my move -------------------------------------------------------- */}
      {composeOpen ? (
        <div className="mt-6">
          <Compose
            seed={seed}
            shape={shape}
            done={done}
            myResponse={myResponse}
            vocabulary={vocabulary}
            busy={busy}
            onSubmit={submit}
            onCancel={myResponse ? () => setComposing(false) : null}
          />
        </div>
      ) : myResponse && (
        <div className="mt-6">
          <Band>Yours</Band>
          <Card>
            <ResponseCard response={myResponse} canReact={false} />
            {/* Post-close, only text moves (B5) — so the edit door only opens
                on shapes that carry any. A words pick has nothing left to say. */}
            {(!done || (Boolean(cfg.editAfterClose) && shape !== 'words')) && (
              <div className="mt-2">
                <Quiet onClick={() => setComposing(true)}>
                  {done ? 'Edit your words' : 'Change it'}
                </Quiet>
                {done && <span className="ml-3 text-xs text-ink-faint">Positions and recordings are fixed now — text stays yours.</span>}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* --- the circle's --------------------------------------------------- */}
      {open && responses.length > 0 && (
        <Artifact
          shape={shape}
          seed={seed}
          circle={circle}
          responses={responses}
          extras={extras}
          canReact={canReact}
          onReact={react}
          selectedUserId={selectedUserId}
          onPickUser={u => setSelectedUserId(cur => (cur === u ? null : u))}
          activeWordId={activeWordId}
          onPickWord={w => setActiveWordId(cur => (cur === w ? null : w))}
        />
      )}
      {open && responses.length === 0 && done && (
        /* S13 — nothing special: show what exists, and the compose above is
           the invitation. */
        <div className="mt-8"><Muted>Nothing here yet.</Muted></div>
      )}
    </Page>
  );
}

function countdownTail(deadline: string | null): string {
  if (!deadline) return '.';
  const ms = new Date(deadline).getTime() - Date.now();
  if (ms <= 0) return '.';
  const hours = Math.round(ms / 3_600_000);
  if (hours < 1) return ' — closes within the hour.';
  if (hours < 48) return ` — closes in ${hours} ${hours === 1 ? 'hour' : 'hours'}.`;
  return ` — closes in ${Math.round(hours / 24)} days.`;
}

// ---------------------------------------------------------------------------
// Compose — one write carries everything; the shape decides the fields
// ---------------------------------------------------------------------------

function Compose({ seed, shape, done, myResponse, vocabulary, busy, onSubmit, onCancel }: {
  seed: Seed;
  shape: string;
  done: boolean;
  myResponse: GatherResponse | null;
  vocabulary: GatherVocabWord[] | null;
  busy: boolean;
  onSubmit: (body: {
    text?: string; audio?: ShareAudio | null;
    position?: { x: number; y?: number } | null; words?: string[] | null;
  }) => Promise<void>;
  onCancel: (() => void) | null;
}) {
  const cfg = seed.payload;
  const storyShape = shape === 'story' || shape === 'story-placement';
  const wantsPlacement = shape === 'placement' || shape === 'story-placement';
  const axes = cfg.axes ?? [];
  const twoAxes = axes.length === 2;

  // B5 — after the close only text moves; a held recording is fixed always.
  const textOnly = done && Boolean(myResponse);
  const audioHeld = Boolean(myResponse?.audio);

  const [text, setText] = useState(myResponse?.text ?? '');
  const [audio, setAudio] = useState<ShareAudio | null>(null);
  const [recordingUi, setRecordingUi] = useState(
    !textOnly && storyShape && cfg.telling !== 'text' && !audioHeld,
  );
  const [writing, setWriting] = useState(!storyShape || cfg.telling === 'text' || textOnly || audioHeld);
  const [position, setPosition] = useState<{ x: number; y?: number } | null>(
    myResponse?.position ? { x: myResponse.position.x, y: myResponse.position.y } : null,
  );
  const [picked, setPicked] = useState<string[]>(myResponse?.words.map(w => w.label) ?? []);
  const [coinEntry, setCoinEntry] = useState('');

  const told = Boolean(text.trim() || audio || audioHeld);
  const ready = (() => {
    if (textOnly) return storyShape ? told : true;
    if (shape === 'words') return picked.length > 0;
    if (wantsPlacement && !position) return false;
    if (storyShape && !told) return false;
    return true;
  })();

  const send = () => onSubmit({
    text,
    audio: textOnly ? undefined : audio,
    position: textOnly ? undefined : (wantsPlacement ? position : undefined),
    words: textOnly ? undefined : (shape === 'words' ? picked : undefined),
  });

  const pickMax = cfg.pickMax ?? 3;
  const coinMax = cfg.coinMax ?? 0;
  const vocab = vocabulary ?? [];
  const coinedByMe = vocab.filter(w => w.mine).length;
  const freshCoins = picked.filter(label =>
    !vocab.some(w => w.label.toLowerCase() === label.toLowerCase())).length;

  const toggleWord = (label: string) => {
    setPicked(cur => {
      const has = cur.some(l => l.toLowerCase() === label.toLowerCase());
      if (has) return cur.filter(l => l.toLowerCase() !== label.toLowerCase());
      if (cur.length >= pickMax) return cur;
      return [...cur, label];
    });
  };

  const coin = () => {
    const label = coinEntry.trim().replace(/\s+/g, ' ').slice(0, 24);
    setCoinEntry('');
    if (!label) return;
    if (vocab.some(w => w.label.toLowerCase() === label.toLowerCase())) { toggleWord(label); return; }
    if (coinedByMe + freshCoins >= coinMax) return;
    toggleWord(label);
  };

  return (
    <Card>
      <Band>
        {textOnly ? 'Your words, still yours'
          : myResponse ? 'Change your response'
          : done ? 'Yours can still join' : 'Your response'}
      </Band>

      {/* story: the telling ---------------------------------------------- */}
      {storyShape && (
        <div className="mb-4">
          {recordingUi && !audio ? (
            <Recorder
              seedId={seed.id}
              maxSeconds={cfg.secondsPerNote ?? 60}
              doneLabel="That’s the take"
              onDone={a => { setAudio(a); setRecordingUi(false); }}
              onCancel={() => { setRecordingUi(false); setWriting(true); }}
            />
          ) : audio ? (
            <div className="rounded-xl border border-[var(--rule)] p-4 text-center">
              <p className="text-sm text-ink-soft">Your recording is ready to send.</p>
              <audio controls src={audio.url} className="mt-3 w-full" />
              <button
                type="button"
                onClick={() => { setAudio(null); setRecordingUi(true); }}
                className="mt-3 cursor-pointer text-sm text-ink-soft underline underline-offset-4 hover:text-ink"
              >
                Record a different one
              </button>
            </div>
          ) : audioHeld ? (
            <p className="text-xs text-ink-faint">
              Your recording is in and stays as told — words below can still change.
            </p>
          ) : !recordingUi && !writing ? null : writing && !textOnly ? (
            <button
              type="button"
              onClick={() => setRecordingUi(true)}
              className="mb-1 w-full cursor-pointer rounded-xl border border-[var(--rule-strong)] px-4 py-3 text-[15px] text-ink-soft transition-colors hover:border-ink hover:text-ink"
            >
              Record it instead
            </button>
          ) : null}

          {(writing || audio) && (
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              maxLength={5000}
              rows={audio ? 3 : 6}
              placeholder={audio ? 'Anything to add in writing — optional' : 'Tell it the way you’d say it…'}
              className="mt-3 w-full resize-none rounded-lg border border-[var(--rule)] bg-ground/50 p-3 text-[15px] leading-relaxed outline-none focus:border-[var(--rule-strong)]"
            />
          )}
          {recordingUi && !audio && !writing && (
            <div className="mt-2 text-center">
              <Quiet onClick={() => { setRecordingUi(false); setWriting(true); }}>Write it instead</Quiet>
            </div>
          )}
        </div>
      )}

      {/* placement: the mark — unlocked after the telling on S4 ----------- */}
      {wantsPlacement && !textOnly && (
        <div
          className="mb-4 transition-opacity"
          style={shape === 'story-placement' && !told
            ? { opacity: 0.35, pointerEvents: 'none' } : undefined}
          aria-disabled={shape === 'story-placement' && !told}
        >
          {shape === 'story-placement' && (
            <p className="mb-1 text-sm text-ink-soft">{told ? 'Now place it' : 'Tell it first — then place it'}</p>
          )}
          {twoAxes
            ? <GridInput axes={axes} placing={cfg.placing ?? 'free'} value={position} onChange={setPosition} />
            : <LineInput axis={axes[0]} value={position} onChange={setPosition} />}
          {shape === 'placement' && (
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              maxLength={5000}
              rows={2}
              placeholder="A word about where you stand — optional"
              className="mt-3 w-full resize-none rounded-lg border border-[var(--rule)] bg-ground/50 p-3 text-[15px] outline-none focus:border-[var(--rule-strong)]"
            />
          )}
        </div>
      )}
      {wantsPlacement && textOnly && shape === 'placement' && (
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          maxLength={5000}
          rows={2}
          className="mb-4 w-full resize-none rounded-lg border border-[var(--rule)] bg-ground/50 p-3 text-[15px] outline-none focus:border-[var(--rule-strong)]"
        />
      )}

      {/* words: pick and coin --------------------------------------------- */}
      {shape === 'words' && !textOnly && (
        <div className="mb-4">
          <div className="flex flex-wrap gap-2">
            {vocab.map(w => (
              <button
                key={w.id}
                type="button"
                aria-pressed={picked.some(l => l.toLowerCase() === w.label.toLowerCase())}
                onClick={() => toggleWord(w.label)}
                className="rounded-full border px-3.5 py-1 text-[15px] transition-colors"
                style={{
                  fontFamily: 'var(--font-display)',
                  background: picked.some(l => l.toLowerCase() === w.label.toLowerCase()) ? 'var(--sky-soft)' : 'var(--ground)',
                  borderColor: picked.some(l => l.toLowerCase() === w.label.toLowerCase()) ? 'var(--sky)' : 'var(--rule-strong)',
                  borderStyle: w.origin === 'contributed' ? 'dashed' : 'solid',
                }}
              >
                {w.label}
              </button>
            ))}
            {picked.filter(l => !vocab.some(w => w.label.toLowerCase() === l.toLowerCase())).map(l => (
              <button
                key={l}
                type="button"
                aria-pressed
                onClick={() => toggleWord(l)}
                className="rounded-full border border-dashed px-3.5 py-1 text-[15px]"
                style={{ fontFamily: 'var(--font-display)', background: 'var(--sky-soft)', borderColor: 'var(--sky)' }}
              >
                {l}
              </button>
            ))}
          </div>
          {coinMax > 0 && coinedByMe + freshCoins < coinMax && (
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={coinEntry}
                maxLength={24}
                placeholder="A word of your own…"
                onChange={e => setCoinEntry(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); coin(); } }}
                className="w-full rounded-lg border border-[var(--rule)] bg-ground px-3 py-2 text-sm"
              />
              <button type="button" onClick={coin}
                className="rounded-full border border-[var(--rule-strong)] px-4 text-sm text-ink-soft">Add</button>
            </div>
          )}
          <div className="mt-2 flex justify-between text-xs text-ink-faint">
            <span>{picked.length} of {pickMax} picked</span>
            {coinMax > 0 && <span>{coinedByMe + freshCoins} of {coinMax} coined</span>}
          </div>
        </div>
      )}

      <div className="flex items-center gap-4 border-t border-[var(--rule)] pt-4">
        <Action onClick={send} disabled={busy || !ready}>
          {busy ? 'Sending…' : myResponse ? 'Keep the change' : 'Share it'}
        </Action>
        {onCancel && <Quiet onClick={onCancel}>Leave it</Quiet>}
      </div>
    </Card>
  );
}

// --- the two placement inputs (S2 five stops; S3 free or quadrants) --------

function LineInput({ axis, value, onChange }: {
  axis: { poleA: string; poleB: string };
  value: { x: number; y?: number } | null;
  onChange: (v: { x: number }) => void;
}) {
  const chosen = value ? stopOf(value.x) : null;
  return (
    <div>
      <div className="relative mx-2 mt-6 h-0.5 rounded" style={{ background: 'var(--rule-strong)' }}>
        {Array.from({ length: STOP_COUNT }, (_, i) => (
          <button
            key={i}
            type="button"
            aria-pressed={chosen === i}
            aria-label={`Stop ${i + 1} of ${STOP_COUNT}`}
            onClick={() => onChange({ x: stopX(i) })}
            className="absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full"
            style={{ left: `${(i / (STOP_COUNT - 1)) * 100}%` }}
          >
            <span
              className="absolute rounded-full border transition-all"
              style={chosen === i
                ? { inset: 3, background: 'var(--sky)', borderColor: 'var(--sky)' }
                : { inset: 6, background: 'var(--card)', borderColor: 'var(--rope)' }}
            />
          </button>
        ))}
      </div>
      <div className="mt-4 flex justify-between text-xs">
        <span style={{ color: 'var(--pole-a)' }}>{axis.poleA}</span>
        <span style={{ color: 'var(--pole-b)' }}>{axis.poleB}</span>
      </div>
    </div>
  );
}

function GridInput({ axes, placing, value, onChange }: {
  axes: { poleA: string; poleB: string }[];
  placing: 'free' | 'quadrants';
  value: { x: number; y?: number } | null;
  onChange: (v: { x: number; y: number }) => void;
}) {
  const [xAxis, yAxis] = axes;

  if (placing === 'quadrants') {
    // Four named answers; the mark lands at the quadrant's heart.
    const cells: { x: number; y: number; label: string }[] = [
      { x: 0.25, y: 0.75, label: `${xAxis.poleA} · ${yAxis.poleB}` },
      { x: 0.75, y: 0.75, label: `${xAxis.poleB} · ${yAxis.poleB}` },
      { x: 0.25, y: 0.25, label: `${xAxis.poleA} · ${yAxis.poleA}` },
      { x: 0.75, y: 0.25, label: `${xAxis.poleB} · ${yAxis.poleA}` },
    ];
    return (
      <div className="mx-2">
        <p className="mb-1 text-center text-xs" style={{ color: 'var(--pole-b)' }}>{yAxis.poleB}</p>
        <div className="grid aspect-square grid-cols-2 gap-2">
          {cells.map(c => {
            const on = value && stop2(value.x) === stop2(c.x) && stop2(value.y ?? 0.5) === stop2(c.y);
            return (
              <button
                key={c.label}
                type="button"
                aria-pressed={Boolean(on)}
                aria-label={c.label}
                onClick={() => onChange({ x: c.x, y: c.y })}
                className="rounded-xl border transition-colors"
                style={on
                  ? { borderColor: 'var(--sky)', background: 'var(--sky-soft)' }
                  : { borderColor: 'var(--rule)', background: 'var(--ground)' }}
              />
            );
          })}
        </div>
        <p className="mt-1 text-center text-xs" style={{ color: 'var(--pole-a)' }}>{yAxis.poleA}</p>
        <div className="mt-1 flex justify-between text-xs">
          <span style={{ color: 'var(--pole-a)' }}>{xAxis.poleA}</span>
          <span style={{ color: 'var(--pole-b)' }}>{xAxis.poleB}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-2">
      <p className="mb-1 text-center text-xs" style={{ color: 'var(--pole-b)' }}>{yAxis.poleB}</p>
      <div
        className="relative aspect-square cursor-crosshair rounded-xl border"
        style={{ borderColor: 'var(--rule)', background: 'var(--ground)' }}
        onClick={e => {
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
          const y = Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height));
          onChange({ x, y });
        }}
        role="application"
        aria-label="Tap to place your mark"
      >
        <div className="absolute bottom-0 left-1/2 top-0 border-l border-dashed" style={{ borderColor: 'var(--rule-strong)' }} />
        <div className="absolute left-0 right-0 top-1/2 border-t border-dashed" style={{ borderColor: 'var(--rule-strong)' }} />
        {value && (
          <div
            className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: `${value.x * 100}%`,
              top: `${(1 - (value.y ?? 0.5)) * 100}%`,
              background: 'var(--sky)',
              boxShadow: '0 0 0 2px var(--card), 0 0 0 3px var(--sky)',
            }}
          />
        )}
      </div>
      <p className="mt-1 text-center text-xs" style={{ color: 'var(--pole-a)' }}>{yAxis.poleA}</p>
      <div className="mt-1 flex justify-between text-xs">
        <span style={{ color: 'var(--pole-a)' }}>{xAxis.poleA}</span>
        <span style={{ color: 'var(--pole-b)' }}>{xAxis.poleB}</span>
      </div>
    </div>
  );
}

const stop2 = (v: number) => Math.round(v * 4);

// ---------------------------------------------------------------------------
// The artifact — what the circle made, per shape (S6–S11)
// ---------------------------------------------------------------------------

function Artifact({ shape, seed, circle, responses, extras, canReact, onReact, selectedUserId, onPickUser, activeWordId, onPickWord }: {
  shape: string;
  seed: Seed;
  circle: Circle;
  responses: GatherResponse[];
  extras: GatherExtras | null;
  canReact: boolean;
  onReact: (shareId: string) => void;
  selectedUserId: string | null;
  onPickUser: (userId: string) => void;
  activeWordId: string | null;
  onPickWord: (wordId: string) => void;
}) {
  const cfg = seed.payload;
  const axes = cfg.axes ?? [];
  const [chartOpen, setChartOpen] = useState(false);

  const selected = selectedUserId ? responses.find(r => r.userId === selectedUserId) ?? null : null;

  // S11 — a tapped word lights its pickers; everyone else fades.
  const dimmed = useMemo(() => {
    if (!activeWordId) return null;
    return new Set(
      responses.filter(r => !r.words.some(w => w.id === activeWordId)).map(r => r.userId),
    );
  }, [activeWordId, responses]);

  const portraitWords = extras?.aggregate?.words ?? [];
  const readable = (r: GatherResponse) => Boolean(r.text || r.audio || r.title);

  return (
    <section className="mt-8">
      <Band>{seed.phase === 'revealed' || seed.phase === 'skipped' ? 'Where the circle landed' : 'The wall so far'}</Band>

      {/* --- the ring, with the shape's own center (S6/S7/S8/S11) --------- */}
      {shape === 'story' && (
        <ResponseRing
          members={circle.members}
          responses={responses}
          selectedUserId={selectedUserId}
          onPickUser={onPickUser}
          center={
            <div>
              <p className="text-xs leading-snug text-ink-soft" style={{ textWrap: 'balance' }}>{cfg.prompt}</p>
              <p className="mt-1 text-xs text-ink-faint">
                {responses.length} {responses.length === 1 ? 'story' : 'stories'}
              </p>
            </div>
          }
        />
      )}

      {shape === 'words' && (
        <ResponseRing
          members={circle.members}
          responses={responses}
          selectedUserId={selectedUserId}
          dimmedUserIds={dimmed}
          onPickUser={onPickUser}
          center={<Portrait words={portraitWords} activeWordId={activeWordId} onPickWord={onPickWord} compact />}
        />
      )}

      {shape === 'placement' && (
        <>
          <ResponseRing
            members={circle.members}
            responses={responses}
            selectedUserId={selectedUserId}
            onPickUser={onPickUser}
            center={
              <button type="button" onClick={() => setChartOpen(v => !v)} aria-expanded={chartOpen}
                className="w-full cursor-pointer" aria-label="Open the full chart">
                {axes.length === 2
                  ? <DotMap responses={responses} axes={axes} compact />
                  : <StackChart responses={responses} axis={axes[0]} compact />}
              </button>
            }
          />
          {chartOpen && (
            <Card>
              {axes.length === 2
                ? <DotMap responses={responses} axes={axes} selectedUserId={selectedUserId}
                    onPickUser={ids => ids[0] && onPickUser(ids[0])} />
                : <StackChart responses={responses} axis={axes[0]} selectedUserId={selectedUserId}
                    onPickUser={onPickUser} />}
            </Card>
          )}
        </>
      )}

      {/* --- S9/S10: the chart is the index, stories read below ------------ */}
      {shape === 'story-placement' && (
        <Card>
          {axes.length === 2
            ? <DotMap responses={responses} axes={axes} selectedUserId={selectedUserId}
                onPickUser={ids => ids[0] && onPickUser(ids[0])} />
            : <StackChart responses={responses} axis={axes[0]} selectedUserId={selectedUserId}
                onPickUser={onPickUser} />}
        </Card>
      )}

      {/* --- the tapped one, up close -------------------------------------- */}
      {selected && (
        <div className="mt-4">
          <Card>
            <ResponseCard response={selected} canReact={canReact && readable(selected)} onReact={onReact} highlight />
          </Card>
        </div>
      )}

      {/* --- everything readable, listed ----------------------------------- */}
      {(shape === 'story' || shape === 'story-placement') && (
        <div className="mt-6 flex flex-col gap-1">
          {sortedForWall(shape, responses).map(r => (
            <div key={r.id} className="border-t border-[var(--rule)] pt-1">
              <ResponseCard
                response={r}
                canReact={canReact}
                onReact={onReact}
                highlight={r.userId === selectedUserId}
              />
            </div>
          ))}
        </div>
      )}
      {shape === 'placement' && responses.some(readable) && (
        <div className="mt-6 flex flex-col gap-1">
          {responses.filter(readable).map(r => (
            <div key={r.id} className="border-t border-[var(--rule)] pt-1">
              <ResponseCard response={r} canReact={false} highlight={r.userId === selectedUserId} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** R4 — stories along the spectrum read in line order; a plain wall reads in
 *  arrival order. */
function sortedForWall(shape: string, responses: GatherResponse[]): GatherResponse[] {
  if (shape !== 'story-placement') return responses;
  return [...responses].sort((a, b) => (a.position?.x ?? 0.5) - (b.position?.x ?? 0.5));
}
