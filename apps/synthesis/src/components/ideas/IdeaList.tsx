'use client';

import { useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { SynthesisService } from '@/services/synthesisService';
import type { Idea, MyIdea } from '@/lib/types';

// The app's home surface (D15): the summary of an account's work. Ideas it
// drafted and ideas it joined, each with the stats that say where the idea
// stands — how many collaborators, public or private, and whether the group
// reached Synthesis. Picking one opens its map.
//
// This is a LIST, not a card grid, on purpose: the row's job is to be
// scannable down a column of a dozen ideas, and the stat line carries more
// information per pixel than a card ever would. The idea's title is the same
// string that labels the home hub at the centre of its map.
//
// It also absorbs the entry points — draft, join by code, and browse the
// public directory — because an account with no ideas yet lands here too.

type Panel = 'none' | 'draft' | 'join' | 'browse';

function Stat({ children, tone }: { children: React.ReactNode; tone?: string }) {
  return (
    <span className="eyebrow !text-[0.6rem]" style={{ color: tone ?? 'var(--mist-faint)' }}>
      {children}
    </span>
  );
}

function IdeaRow({ idea, onOpen }: { idea: MyIdea; onOpen: (code: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(idea.code)}
      className="w-full rounded-2xl border border-line-strong px-4 py-3.5 text-left transition-colors hover:border-own"
      style={{ background: 'var(--dusk-raised)' }}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="block text-sm leading-snug text-mist">{idea.title}</span>
        {idea.synthesisReached && (
          <span
            className="eyebrow shrink-0 rounded-full border px-2 py-0.5 !text-[0.55rem]"
            style={{ borderColor: 'var(--join)', color: 'var(--join)' }}
            title="This group reached Synthesis"
          >
            ∪ synthesis
          </span>
        )}
      </span>
      <span className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <Stat>
          {idea.collaboratorCount} {idea.collaboratorCount === 1 ? 'collaborator' : 'collaborators'}
        </Stat>
        <Stat tone="var(--line-strong)">·</Stat>
        <Stat tone={idea.visibility === 'public' ? 'var(--borrowed)' : undefined}>
          {idea.visibility}
        </Stat>
        <Stat tone="var(--line-strong)">·</Stat>
        <Stat>as {idea.membership.handle}</Stat>
      </span>
    </button>
  );
}

function Group({
  label,
  ideas,
  onOpen,
}: {
  label: string;
  ideas: MyIdea[];
  onOpen: (code: string) => void;
}) {
  if (ideas.length === 0) return null;
  return (
    <section className="mt-7">
      <p className="eyebrow mb-2.5" style={{ color: 'var(--mist-faint)' }}>{label}</p>
      <div className="flex flex-col gap-2">
        {ideas.map(i => <IdeaRow key={i.code} idea={i} onOpen={onOpen} />)}
      </div>
    </section>
  );
}

// The public directory (D13). Loaded on demand rather than with the page —
// most sessions open an idea the account is already in.
function BrowsePanel({ userId, onJoin }: { userId: string; onJoin: (code: string) => void }) {
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    SynthesisService.publicIdeas(userId)
      .then(({ ideas: list }) => { if (!cancelled) setIdeas(list); })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load public ideas');
      });
    return () => { cancelled = true; };
  }, [userId]);

  if (error) return <p className="text-sm" style={{ color: 'var(--live)' }}>{error}</p>;
  if (!ideas) return <p className="eyebrow text-mist-faint">Loading…</p>;
  if (ideas.length === 0) {
    return <p className="text-sm text-mist-soft">Public ideas will show up here as people open them up.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {ideas.map(i => (
        <button
          key={i.code}
          type="button"
          onClick={() => onJoin(i.code)}
          className="flex items-center justify-between rounded-2xl border border-line-strong px-4 py-3 text-left transition-colors hover:border-own"
          style={{ background: 'var(--dusk-raised)' }}
        >
          <span>
            <span className="block text-sm text-mist">{i.title}</span>
            <span className="eyebrow !text-[0.6rem] !text-mist-faint">
              {i.collaboratorCount ?? 0} collaborating
              {i.synthesisReached && ' · reached synthesis'}
            </span>
          </span>
          <span className="eyebrow shrink-0" style={{ color: 'var(--own)' }}>join →</span>
        </button>
      ))}
    </div>
  );
}

export default function IdeaList({
  userId,
  ideas,
  onOpen,
  onDraft,
  onJoin,
  loading,
  error,
  clearError,
}: {
  userId: string;
  ideas: MyIdea[];
  onOpen: (code: string) => void;
  onDraft: (title: string, visibility: 'public' | 'private') => Promise<unknown>;
  onJoin: (code: string) => Promise<unknown>;
  loading: boolean;
  error: string | null;
  clearError: () => void;
}) {
  const [panel, setPanel] = useState<Panel>('none');
  const [title, setTitle] = useState('');
  const [code, setCode] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('private');

  const drafted = ideas.filter(i => i.draftedByMe);
  const joined = ideas.filter(i => !i.draftedByMe);
  const hasIdeas = ideas.length > 0;

  function openPanel(next: Panel) {
    clearError();
    setPanel(p => (p === next ? 'none' : next));
  }

  async function submitDraft() {
    clearError();
    if (!title.trim()) return;
    await onDraft(title.trim(), visibility).catch(() => {});
  }

  async function submitJoin(withCode = code) {
    clearError();
    if (!withCode.trim()) return;
    await onJoin(withCode.trim()).catch(() => {});
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-16 pt-[max(3rem,env(safe-area-inset-top))]">
      <header className="rise-in">
        <p className="eyebrow" style={{ color: 'var(--own)' }}>Synthesis</p>
        <h1 className="display mt-3 text-5xl leading-[0.95]">
          Your<br /><span style={{ color: 'var(--own)' }}>ideas</span>
        </h1>
        <p className="mt-3 text-sm text-mist-soft">
          {hasIdeas
            ? 'An idea is a thought space. Open one to work in its map.'
            : 'An idea is a thought space you draft and invite people into. Start one, or join with a code.'}
        </p>
      </header>

      <Group label="Drafted by me" ideas={drafted} onOpen={onOpen} />
      <Group label="Joined" ideas={joined} onOpen={onOpen} />

      <section className="rise-in mt-9" style={{ animationDelay: '0.1s' }}>
        <div className="flex gap-2">
          {([
            ['draft', 'Draft an idea'],
            ['join', 'Join with a code'],
            ['browse', 'Browse'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => openPanel(key)}
              className="eyebrow flex-1 rounded-full border px-3 py-2.5 !text-[0.6rem]"
              style={{
                borderColor: panel === key ? 'var(--own)' : 'var(--line-strong)',
                color: panel === key ? 'var(--own)' : 'var(--mist-faint)',
                background: panel === key ? 'var(--own-soft)' : 'transparent',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {panel === 'draft' && (
          <div className="tone-in mt-5">
            <label className="eyebrow mb-2 block">What is the idea?</label>
            <TextField
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="What makes a ritual"
            />
            <p className="mt-1.5 text-[0.7rem] text-mist-faint">
              This becomes the centre of everyone&rsquo;s map.
            </p>

            <label className="eyebrow mb-2 mt-4 block">Who can find it</label>
            <div className="flex gap-2">
              {(['private', 'public'] as const).map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVisibility(v)}
                  className="eyebrow flex-1 rounded-full border px-3 py-2 !text-[0.6rem]"
                  style={{
                    borderColor: visibility === v ? 'var(--own)' : 'var(--line-strong)',
                    color: visibility === v ? 'var(--own)' : 'var(--mist-faint)',
                    background: visibility === v ? 'var(--own-soft)' : 'transparent',
                  }}
                >
                  {v === 'private' ? 'Invite only' : 'Anyone can find it'}
                </button>
              ))}
            </div>

            <Button variant="own" className="mt-5" onClick={submitDraft} disabled={loading}>
              {loading ? 'Working…' : 'Draft it'}
            </Button>
          </div>
        )}

        {panel === 'join' && (
          <div className="tone-in mt-5">
            <label className="eyebrow mb-2 block">Invite code</label>
            <TextField
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="DEMO"
              autoCapitalize="characters"
              onKeyDown={e => { if (e.key === 'Enter') submitJoin(); }}
            />
            <Button variant="own" className="mt-5" onClick={() => submitJoin()} disabled={loading}>
              {loading ? 'Working…' : 'Join it'}
            </Button>
          </div>
        )}

        {panel === 'browse' && (
          <div className="tone-in mt-5">
            <BrowsePanel userId={userId} onJoin={c => submitJoin(c)} />
          </div>
        )}

        {error && <p className="mt-3 text-sm" style={{ color: 'var(--live)' }}>{error}</p>}
      </section>
    </main>
  );
}
