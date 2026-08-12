'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { thresholdApi, ApiError } from '@/services/api';
import { Page, Band, Card, Action, Quiet, Muted } from '@/components/Shell';
import { TideLine, Polarity } from '@/components/TideLine';

// Starting a session: one topic, told and sorted once. Until this existed,
// every circle on production was made by running the funnel from a laptop — so
// the app could be used by anybody invited to one and by nobody else.
//
// A session is what this app offers publicly, so the page no longer asks which
// kind to make: it always sends `mode: 'single'`. Ongoing circles are real and
// still run, and they are started by an operator from the platform admin —
// continuity is a commitment somebody makes on purpose, not a radio button a
// stranger meets on their first screen.
//
// That decision makes the topic required rather than an offer: a one-off is a
// circle with a single seed by definition (D1) and has nothing to run without
// one. (D27/D29's "open with no topic and go idle" is the ongoing shape, and
// belongs to the surface that starts those.)

/** The address a title will take. The server slugs it too, and identically —
 *  this is shown so nobody discovers their circle's URL after the fact. */
function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
}

export default function NewCirclePage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;
  const email = (session?.user as { email?: string } | undefined)?.email ?? '';

  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [poleA, setPoleA] = useState('');
  const [poleB, setPoleB] = useState('');
  const [openToLink, setOpenToLink] = useState(true);
  const [invites, setInvites] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const urlName = slugify(title);
  const topicReady = Boolean(topic.trim() && poleA.trim() && poleB.trim());
  const ready = Boolean(urlName) && topicReady;

  if (status === 'loading') return <Page><Muted>…</Muted></Page>;

  if (!userId) {
    return (
      <Page>
        <h1 className="mb-2 font-[family-name:var(--font-source-serif)] text-3xl">Sign in</h1>
        <Muted>A session belongs to the account that starts it.</Muted>
        <div className="mt-5"><Action href="/login">Sign in</Action></div>
      </Page>
    );
  }

  const create = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { circle } = await thresholdApi.createCircle(
        {
          title: title.trim(),
          urlName,
          mode: 'single',
          // Puts the starter's own address on their membership, which is what
          // every later transition mails.
          email,
          seed: { topic: topic.trim(), poleA: poleA.trim(), poleB: poleB.trim() },
          requireInvitation: !openToLink,
          invitedEmails: openToLink
            ? []
            : invites.split(/[\s,]+/).map(s => s.trim().toLowerCase()).filter(Boolean),
        },
        userId,
      );
      // A new circle is a draft, and the circle page is where its host opens
      // it — so this hands over to the page they will return to from now on
      // rather than inventing a second place to press start.
      router.push(`/t/${circle.urlName}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That did not work');
      setBusy(false);
    }
  };

  return (
    <Page>
      <header className="mb-8">
        <Quiet href="/">Threshold</Quiet>
        <h1 className="mt-2 font-[family-name:var(--font-source-serif)] text-3xl leading-tight">
          Start a session
        </h1>
        <p className="mt-1 mb-4 text-sm text-ink-faint">
          One topic, told and sorted once. You host it: you decide when a round moves on.
        </p>
        <TideLine />
      </header>

      {error && <p className="mb-6 text-sm text-pole-b">{error}</p>}

      <Card className="mb-6">
        <Band>What to call it</Band>
        <input
          autoFocus
          value={title}
          onChange={e => setTitle(e.target.value)}
          maxLength={80}
          placeholder="Thursday, being needed"
          className="w-full rounded-lg border border-[var(--rule)] bg-ground/40 p-3 text-[15px] outline-none focus:border-[var(--rule-strong)]"
        />
        {urlName && (
          <p className="mt-2 text-xs text-ink-faint">
            Its link will be threshold.holoscopic.io/t/{urlName}
          </p>
        )}
      </Card>

      <Card className="mb-6">
        <Band>The topic</Band>
        <Muted>A charged word, and the two things it can be.</Muted>
        <input
          value={topic}
          onChange={e => setTopic(e.target.value)}
          maxLength={120}
          placeholder="Being needed"
          className="mt-3 w-full rounded-lg border border-[var(--rule)] bg-ground/40 p-3 text-[15px] outline-none focus:border-[var(--rule-strong)]"
        />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <input
            value={poleA}
            onChange={e => setPoleA(e.target.value)}
            maxLength={40}
            placeholder="Nourishing"
            className="w-full rounded-lg border p-3 text-[15px] outline-none"
            style={{ borderColor: 'var(--pole-a)', color: 'var(--pole-a)' }}
          />
          <input
            value={poleB}
            onChange={e => setPoleB(e.target.value)}
            maxLength={40}
            placeholder="Draining"
            className="w-full rounded-lg border p-3 text-[15px] outline-none"
            style={{ borderColor: 'var(--pole-b)', color: 'var(--pole-b)' }}
          />
        </div>
        {topicReady && (
          <div className="mt-4">
            <Polarity poleA={poleA.trim()} poleB={poleB.trim()} />
          </div>
        )}
        {!topicReady && (
          <p className="mt-3 text-sm text-ink-faint">
            A topic needs both of its ends before it can run.
          </p>
        )}
      </Card>

      <Card className="mb-8">
        <Band>Who can join</Band>
        <div className="grid gap-3 sm:grid-cols-2">
          <Choice
            selected={openToLink}
            onSelect={() => setOpenToLink(true)}
            title="Anyone with the link"
            note="You send the link to whoever you want in it."
          />
          <Choice
            selected={!openToLink}
            onSelect={() => setOpenToLink(false)}
            title="People I name"
            note="Only these addresses can join, and only once they have an account on them."
          />
        </div>
        {!openToLink && (
          <textarea
            value={invites}
            onChange={e => setInvites(e.target.value)}
            rows={3}
            placeholder="one@example.com, another@example.com"
            className="mt-3 w-full resize-none rounded-lg border border-[var(--rule)] bg-ground/40 p-3 text-[15px] outline-none focus:border-[var(--rule-strong)]"
          />
        )}
      </Card>

      <Action disabled={!ready || busy} onClick={create}>
        {busy ? 'Starting…' : 'Start it'}
      </Action>
      <p className="mt-3 text-sm text-ink-faint">
        It opens when you say so, and the next screen is where you do that.
      </p>
    </Page>
  );
}

/** One of two ways to answer a question, as a target rather than a radio. */
function Choice({ selected, onSelect, title, note }: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  note: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className="rounded-xl border p-4 text-left transition-colors"
      style={{
        borderColor: selected ? 'var(--ink)' : 'var(--rule)',
        background: selected ? 'var(--ground-deep)' : 'transparent',
      }}
    >
      <span className="text-[15px] font-medium">{title}</span>
      <span className="mt-1 block text-sm leading-relaxed text-ink-soft">{note}</span>
    </button>
  );
}
