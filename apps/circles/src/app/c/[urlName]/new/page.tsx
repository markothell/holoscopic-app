'use client';

// Start an activity — the builder's creator flow (PRIMITIVES.md §9, the
// S-decisions): the + on circle home lands here, primitives and templates on
// separate tabs, then four connected dots — shape, prompt, reveal, launch —
// each its own view, fill marks the present step. The staged payload lives in
// local state and goes to the server as ONE postSeed at launch, the same
// stage-everything-send-once move Tell makes with its two poles.

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Page, Band, Card, Muted, Action, Quiet } from '@/components/Shell';
import { circlesApi, ApiError } from '@/services/api';
import type { Circle, GatherShape, GatherAxis } from '@/lib/types';

type Step = 'shape' | 'prompt' | 'reveal' | 'launch';
const STEPS: Step[] = ['shape', 'prompt', 'reveal', 'launch'];
const STEP_LABEL: Record<Step, string> = {
  shape: 'Shape', prompt: 'Prompt', reveal: 'Reveal', launch: 'Launch',
};

// What the builder stages. Mirrors utils/gather.js#normalizeSeed's inputs.
interface Draft {
  shape: GatherShape;
  prompt: string;
  context: string;
  axes: GatherAxis[];
  telling: 'voice' | 'text';
  placing: 'free' | 'quadrants';
  words: string[];
  pickMax: number;
  coinMax: number;
  reveal: 'open' | 'sealed';
  reactions: boolean;
  editAfterClose: boolean;
  respondHours: number | null;
  secondsPerNote: number;
}

function blankDraft(shape: GatherShape): Draft {
  return {
    shape,
    prompt: '',
    context: '',
    axes: shape === 'placement' || shape === 'story-placement' ? [{ poleA: '', poleB: '' }] : [],
    telling: 'voice',
    placing: 'free',
    words: [],
    pickMax: 3,
    coinMax: 2,
    reveal: 'sealed',
    reactions: true,
    editAfterClose: true,
    respondHours: null,
    secondsPerNote: 60,
  };
}

const SHAPES: { shape: GatherShape; name: string; blurb: string }[] = [
  { shape: 'story', name: 'Stories', blurb: 'Everyone answers in voice or words' },
  { shape: 'placement', name: 'Places', blurb: 'Everyone marks where they stand' },
  { shape: 'story-placement', name: 'Stories on a line', blurb: 'Tell it, then place it' },
  { shape: 'words', name: 'Words', blurb: 'Pick from a shared list, coin your own' },
];

// Presets are hard-coded first — code, not config (the M5 TOPICS precedent).
// A template is a pre-filled draft the creator still walks and may edit.
const TEMPLATES: { name: string; blurb: string; draft: Partial<Draft> & { shape: GatherShape } }[] = [
  {
    name: 'Check-in',
    blurb: 'One word for how you arrive · words',
    draft: {
      shape: 'words', prompt: 'One word for how you arrive today',
      words: ['grounded', 'scattered', 'hopeful', 'tired', 'curious', 'heavy'],
      pickMax: 2, coinMax: 2, reveal: 'open',
    },
  },
  {
    name: 'Where we stand',
    blurb: 'A polarity before the conversation · places',
    draft: {
      shape: 'placement', prompt: 'Where do you stand going in?',
      axes: [{ poleA: 'hopeful', poleB: 'wary' }], reveal: 'sealed',
    },
  },
  {
    name: 'First jobs',
    blurb: 'A story wall to warm a new circle · stories',
    draft: { shape: 'story', prompt: 'Tell us about a first job', reveal: 'open' },
  },
  {
    name: 'It showed up for me',
    blurb: 'A story, placed on how much it changed · stories on a line',
    draft: {
      shape: 'story-placement', prompt: 'A time this circle showed up for you',
      axes: [{ poleA: 'small kindness', poleB: 'changed things' }], reveal: 'sealed',
    },
  },
];

const isStoryShape = (s: GatherShape) => s === 'story' || s === 'story-placement';
const isAxisShape = (s: GatherShape) => s === 'placement' || s === 'story-placement';

export default function NewActivityPage({ params }: { params: Promise<{ urlName: string }> }) {
  const { urlName } = use(params);
  const router = useRouter();
  const { data: session, status } = useSession();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;
  const base = `/c/${urlName}`;

  const [circle, setCircle] = useState<Circle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('shape');
  const [tab, setTab] = useState<'primitives' | 'templates'>('primitives');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      const { circle } = await circlesApi.getCircle(urlName, userId);
      setCircle(circle);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load this circle');
    }
  }, [urlName, userId]);

  useEffect(() => {
    if (status === 'loading') return;
    void load();
  }, [status, load]);

  const set = (patch: Partial<Draft>) => setDraft(d => (d ? { ...d, ...patch } : d));

  const pick = (partial: Partial<Draft> & { shape: GatherShape }) => {
    setDraft({ ...blankDraft(partial.shape), ...partial });
    setStep('prompt');
  };

  // What blocks the walk forward, said as a sentence (empty = fine).
  const promptGap = useMemo(() => {
    if (!draft) return 'Pick a shape first';
    if (!draft.prompt.trim()) return 'The ask needs a question';
    if (isAxisShape(draft.shape) && draft.axes.some(a => !a.poleA.trim() || !a.poleB.trim())) {
      return 'Both ends of every axis need a name';
    }
    if (draft.shape === 'words' && draft.words.length === 0) return 'A words ask needs seed words';
    return '';
  }, [draft]);

  async function launch() {
    if (!circle || !userId || !draft) return;
    setSending(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        prompt: draft.prompt.trim(),
        context: draft.context.trim(),
        shape: draft.shape,
        reveal: draft.reveal,
        editAfterClose: draft.editAfterClose,
        respondHours: draft.respondHours,
      };
      if (isAxisShape(draft.shape)) {
        payload.axes = draft.axes;
        if (draft.axes.length === 2) payload.placing = draft.placing;
      }
      if (isStoryShape(draft.shape)) {
        payload.telling = draft.telling;
        payload.secondsPerNote = draft.secondsPerNote;
        payload.reactions = draft.reactions; // S18: the toggle exists here only
      } else {
        payload.reactions = false; // S15/S16 — nothing reactable on these shapes
      }
      if (draft.shape === 'words') {
        payload.words = draft.words;
        payload.pickMax = draft.pickMax;
        payload.coinMax = draft.coinMax;
      }
      await circlesApi.postSeed(circle.id, userId, payload, 'gather');
      router.push(base);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That did not go through — try again');
      setSending(false);
    }
  }

  // --- guards, in the house order -----------------------------------------

  if (status === 'loading' || (!circle && !error)) {
    return <Page><Muted>…</Muted></Page>;
  }
  if (!userId) {
    return (
      <Page>
        <Card>
          <Muted>Starting an activity needs an account.</Muted>
          <div className="mt-4">
            <Action href={`/login?callbackUrl=${encodeURIComponent(`${base}/new`)}`}>Sign in</Action>
          </div>
        </Card>
      </Page>
    );
  }
  if (!circle) {
    return <Page><p className="text-ochre">{error}</p></Page>;
  }
  if (!circle.isMember) {
    return (
      <Page>
        <Muted>Only members start activities here.</Muted>
        <div className="mt-4"><Action href={base}>To the circle</Action></div>
      </Page>
    );
  }

  const stepIndex = STEPS.indexOf(step);

  return (
    <Page>
      <div className="pt-2">
        <Quiet href={base}>{circle.title}</Quiet>
        <h1 className="mt-1 text-2xl">Start an activity</h1>
      </div>

      {/* The four connected dots — fill marks the present step. Past steps are
          walkable; the future is reached by finishing the present. */}
      <div className="mt-4 flex items-center" role="list" aria-label="Steps">
        {STEPS.map((s, i) => (
          <span key={s} className="flex items-center">
            {i > 0 && <span className="h-px w-8" style={{ background: 'var(--rule-strong)' }} />}
            <button
              type="button"
              role="listitem"
              aria-label={STEP_LABEL[s]}
              aria-current={s === step ? 'step' : undefined}
              disabled={i > stepIndex}
              onClick={() => i < stepIndex && setStep(s)}
              className="h-3 w-3 rounded-full border transition-colors disabled:cursor-default"
              style={{
                background: s === step ? 'var(--sky)' : i < stepIndex ? 'var(--rope)' : 'var(--card)',
                borderColor: s === step ? 'var(--sky)' : 'var(--rope)',
              }}
            />
          </span>
        ))}
        <span className="ml-3 text-xs text-ink-faint">{STEP_LABEL[step]}</span>
      </div>

      {error && <p className="mt-3 text-sm text-pole-b">{error}</p>}

      {/* ------------------------------------------------ step 1 · shape --- */}
      {step === 'shape' && (
        <section className="mt-6">
          <div className="flex gap-6 border-b border-[var(--rule)]" role="tablist">
            {(['primitives', 'templates'] as const).map(t => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`-mb-px border-b-2 pb-2 text-sm capitalize ${
                  tab === t ? 'border-ink text-ink' : 'border-transparent text-ink-faint'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {tab === 'primitives' && (
            <div className="mt-2">
              {SHAPES.map(s => (
                <button
                  key={s.shape}
                  type="button"
                  onClick={() => pick({ shape: s.shape })}
                  className="flex w-full items-baseline justify-between gap-4 border-b border-[var(--rule)] py-4 text-left last:border-b-0"
                >
                  <span>
                    <span className="block font-[family-name:var(--font-display)] text-lg">{s.name}</span>
                    <span className="text-sm text-ink-soft">{s.blurb}</span>
                  </span>
                  <span aria-hidden className="text-ink-faint">→</span>
                </button>
              ))}
            </div>
          )}

          {tab === 'templates' && (
            <div className="mt-2">
              {TEMPLATES.map(t => (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => pick(t.draft)}
                  className="flex w-full items-baseline justify-between gap-4 border-b border-[var(--rule)] py-4 text-left last:border-b-0"
                >
                  <span>
                    <span className="block font-[family-name:var(--font-display)] text-lg">{t.name}</span>
                    <span className="text-sm text-ink-soft">{t.blurb}</span>
                  </span>
                  <span aria-hidden className="text-ink-faint">→</span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ----------------------------------------------- step 2 · prompt --- */}
      {step === 'prompt' && draft && (
        <section className="mt-6 flex flex-col gap-5">
          <label className="block">
            <span className="text-sm text-ink-soft">What do you want to ask?</span>
            <input
              type="text"
              value={draft.prompt}
              maxLength={200}
              onChange={e => set({ prompt: e.target.value })}
              placeholder="The question, as you'd say it to the circle"
              className="mt-1 w-full rounded-lg border border-[var(--rule)] bg-ground px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="text-sm text-ink-soft">A line of context — optional</span>
            <input
              type="text"
              value={draft.context}
              maxLength={1000}
              onChange={e => set({ context: e.target.value })}
              className="mt-1 w-full rounded-lg border border-[var(--rule)] bg-ground px-3 py-2"
            />
          </label>

          {isStoryShape(draft.shape) && (
            <Toggle
              label="Replies lead with"
              value={draft.telling}
              options={[['voice', 'Speaking'], ['text', 'Writing']]}
              onPick={v => set({ telling: v as Draft['telling'] })}
              hint={draft.telling === 'voice'
                ? `The recorder comes first — up to ${draft.secondsPerNote}s; writing stays available`
                : 'The text box comes first — a recording stays available'}
            />
          )}

          {isAxisShape(draft.shape) && (
            <div>
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-ink-soft">
                  {draft.axes.length === 1 ? 'The axis' : 'The two axes'}
                </span>
                <button
                  type="button"
                  className="text-sm text-ink-soft underline underline-offset-4"
                  onClick={() => set({
                    axes: draft.axes.length === 1
                      ? [...draft.axes, { poleA: '', poleB: '' }]
                      : draft.axes.slice(0, 1),
                  })}
                >
                  {draft.axes.length === 1 ? '+ second axis' : 'one axis only'}
                </button>
              </div>
              {draft.axes.map((axis, i) => (
                <div key={i} className="mt-2 flex items-center gap-2">
                  <input
                    type="text" value={axis.poleA} maxLength={40} placeholder={i === 0 ? 'left end' : 'bottom end'}
                    onChange={e => set({ axes: draft.axes.map((a, j) => (j === i ? { ...a, poleA: e.target.value } : a)) })}
                    className="w-full rounded-lg border border-[var(--rule)] bg-ground px-3 py-2 text-sm"
                    style={{ color: 'var(--pole-a)' }}
                  />
                  <span className="text-ink-faint">↔</span>
                  <input
                    type="text" value={axis.poleB} maxLength={40} placeholder={i === 0 ? 'right end' : 'top end'}
                    onChange={e => set({ axes: draft.axes.map((a, j) => (j === i ? { ...a, poleB: e.target.value } : a)) })}
                    className="w-full rounded-lg border border-[var(--rule)] bg-ground px-3 py-2 text-sm"
                    style={{ color: 'var(--pole-b)' }}
                  />
                </div>
              ))}
              {draft.axes.length === 2 && (
                <div className="mt-3">
                  <Toggle
                    label="Placing"
                    value={draft.placing}
                    options={[['free', 'Anywhere on the grid'], ['quadrants', 'One of four quadrants']]}
                    onPick={v => set({ placing: v as Draft['placing'] })}
                  />
                </div>
              )}
            </div>
          )}

          {draft.shape === 'words' && (
            <WordListEditor draft={draft} set={set} />
          )}

          <StepFoot
            gap={promptGap}
            onNext={() => setStep('reveal')}
            onBack={() => setStep('shape')}
          />
        </section>
      )}

      {/* ----------------------------------------------- step 3 · reveal --- */}
      {step === 'reveal' && draft && (
        <section className="mt-6 flex flex-col gap-5">
          <Toggle
            label="How it comes back"
            value={draft.reveal}
            options={[['sealed', 'Sealed, then revealed'], ['open', 'Open wall']]}
            onPick={v => set({ reveal: v as Draft['reveal'] })}
            hint={draft.reveal === 'sealed'
              ? 'Each member sees only their own until the close — then everything, named'
              : 'Everything is visible as it arrives, named from the start'}
          />

          {/* S18 — the toggle exists only where something is reactable. */}
          {isStoryShape(draft.shape) && (
            <Toggle
              label="Reactions"
              value={draft.reactions ? 'on' : 'off'}
              options={[['on', 'On'], ['off', 'Off']]}
              onPick={v => set({ reactions: v === 'on' })}
              hint={draft.reveal === 'open' ? 'Live on the wall' : 'They open at the reveal'}
            />
          )}

          <Toggle
            label="After the close, text edits"
            value={draft.editAfterClose ? 'on' : 'off'}
            options={[['on', 'Stay open'], ['off', 'Freeze']]}
            onPick={v => set({ editAfterClose: v === 'on' })}
            hint="Positions and recordings fix at the close either way"
          />

          <div>
            <span className="text-sm text-ink-soft">The clock</span>
            <div className="mt-1 flex flex-wrap gap-2">
              {([[null, 'No timer'], [24, '1 day'], [72, '3 days'], [168, 'A week']] as const).map(([h, label]) => (
                <button
                  key={label}
                  type="button"
                  aria-pressed={draft.respondHours === h}
                  onClick={() => set({ respondHours: h })}
                  className={`rounded-full border px-4 py-1.5 text-sm ${
                    draft.respondHours === h
                      ? 'border-ink bg-ink text-card'
                      : 'border-[var(--rule-strong)] text-ink-soft'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-ink-faint">
              It closes when everyone has answered{draft.respondHours ? ' or when the timer ends' : ''} —
              whichever comes first. You can always reveal by hand.
            </p>
          </div>

          <StepFoot gap="" onNext={() => setStep('launch')} onBack={() => setStep('prompt')} />
        </section>
      )}

      {/* ----------------------------------------------- step 4 · launch --- */}
      {step === 'launch' && draft && (
        <section className="mt-6">
          <Band>Seen as the circle will see it</Band>
          <Card>
            <h2 className="text-xl">{draft.prompt}</h2>
            {draft.context && <Muted>{draft.context}</Muted>}
            <p className="mt-3 text-sm text-ink-soft">
              {draft.shape === 'story' && (draft.telling === 'voice'
                ? `A spoken story, up to ${draft.secondsPerNote} seconds — or written.`
                : 'A written story — or spoken.')}
              {draft.shape === 'placement' && (draft.axes.length === 1
                ? `A mark between “${draft.axes[0].poleA}” and “${draft.axes[0].poleB}”, with an optional note.`
                : 'A mark on the grid, with an optional note.')}
              {draft.shape === 'story-placement' && 'A story, then a place for it on the line.'}
              {draft.shape === 'words' && `Pick up to ${draft.pickMax} words${draft.coinMax > 0 ? `, coin up to ${draft.coinMax} of your own` : ''}.`}
            </p>
            <p className="mt-2 text-xs text-ink-faint">
              {draft.reveal === 'sealed' ? 'Sealed until the close.' : 'An open wall.'}
              {draft.respondHours ? ` Closes in ${draft.respondHours >= 48 ? `${Math.round(draft.respondHours / 24)} days` : `${draft.respondHours} hours`} at the latest.` : ''}
            </p>
          </Card>
          <p className="mt-4 text-sm text-ink-soft">
            Launching mails the circle: “{firstName(session)} asks: {draft.prompt || '…'}”
          </p>
          <div className="mt-5 flex items-center gap-5">
            <Action onClick={launch} disabled={sending}>
              {sending ? 'Asking…' : 'Ask the circle'}
            </Action>
            <Quiet onClick={() => setStep('reveal')}>Back</Quiet>
          </div>
        </section>
      )}
    </Page>
  );
}

function firstName(session: ReturnType<typeof useSession>['data']): string {
  const name = (session?.user as { name?: string } | undefined)?.name || '';
  return name.split(' ')[0] || 'A member';
}

/** A two-way (or few-way) choice as pills — the app has no select styling. */
function Toggle({ label, value, options, onPick, hint }: {
  label: string;
  value: string;
  options: [string, string][];
  onPick: (v: string) => void;
  hint?: string;
}) {
  return (
    <div>
      <span className="text-sm text-ink-soft">{label}</span>
      <div className="mt-1 flex flex-wrap gap-2">
        {options.map(([v, text]) => (
          <button
            key={v}
            type="button"
            aria-pressed={value === v}
            onClick={() => onPick(v)}
            className={`rounded-full border px-4 py-1.5 text-sm ${
              value === v ? 'border-ink bg-ink text-card' : 'border-[var(--rule-strong)] text-ink-soft'
            }`}
          >
            {text}
          </button>
        ))}
      </div>
      {hint && <p className="mt-1.5 text-xs text-ink-faint">{hint}</p>}
    </div>
  );
}

function WordListEditor({ draft, set }: {
  draft: Draft;
  set: (patch: Partial<Draft>) => void;
}) {
  const [entry, setEntry] = useState('');

  const add = () => {
    const label = entry.trim().replace(/\s+/g, ' ').slice(0, 24);
    if (!label) return;
    const key = label.toLowerCase();
    if (draft.words.some(w => w.toLowerCase() === key)) { setEntry(''); return; }
    if (draft.words.length >= 40) return;
    set({ words: [...draft.words, label] });
    setEntry('');
  };

  return (
    <div>
      <span className="text-sm text-ink-soft">The word list — in the order the circle will see it</span>
      {draft.words.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {draft.words.map(w => (
            <button
              key={w}
              type="button"
              onClick={() => set({ words: draft.words.filter(x => x !== w) })}
              title="Remove"
              className="rounded-full border border-[var(--rule-strong)] bg-ground px-3.5 py-1 font-[family-name:var(--font-display)] text-[15px]"
            >
              {w} <span aria-hidden className="text-ink-faint">×</span>
            </button>
          ))}
        </div>
      )}
      <div className="mt-2 flex gap-2">
        <input
          type="text"
          value={entry}
          maxLength={24}
          placeholder="Add a word…"
          onChange={e => setEntry(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          className="w-full rounded-lg border border-[var(--rule)] bg-ground px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={add}
          className="rounded-full border border-[var(--rule-strong)] px-4 text-sm text-ink-soft"
        >
          Add
        </button>
      </div>
      <div className="mt-3 flex gap-6">
        <NumberPick label="Each member picks up to" value={draft.pickMax} min={1} max={10}
          onChange={v => set({ pickMax: v })} />
        <NumberPick label="May coin up to" value={draft.coinMax} min={0} max={5}
          onChange={v => set({ coinMax: v })} />
      </div>
    </div>
  );
}

function NumberPick({ label, value, min, max, onChange }: {
  label: string; value: number; min: number; max: number; onChange: (v: number) => void;
}) {
  return (
    <label className="block text-sm text-ink-soft">
      {label}
      <span className="mt-1 flex items-center gap-2">
        <button type="button" aria-label="Fewer" onClick={() => onChange(Math.max(min, value - 1))}
          className="h-7 w-7 rounded-full border border-[var(--rule-strong)]">−</button>
        <span className="w-5 text-center text-ink" style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</span>
        <button type="button" aria-label="More" onClick={() => onChange(Math.min(max, value + 1))}
          className="h-7 w-7 rounded-full border border-[var(--rule-strong)]">+</button>
      </span>
    </label>
  );
}

function StepFoot({ gap, onNext, onBack }: { gap: string; onNext: () => void; onBack: () => void }) {
  return (
    <div className="mt-2 border-t border-[var(--rule)] pt-5">
      {gap && <p className="mb-3 text-xs text-ink-faint">{gap}</p>}
      <div className="flex items-center gap-5">
        <Action onClick={onNext} disabled={Boolean(gap)}>Continue</Action>
        <Quiet onClick={onBack}>Back</Quiet>
      </div>
    </div>
  );
}
