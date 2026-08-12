'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { Page, Band, Card, Action, Quiet, Muted } from '@/components/Shell';
import { TideLine, Polarity } from '@/components/TideLine';

// The front door. It never shows a circle — a circle is /t/<urlName> and there
// is no default one, the same posture as Chorus's root.
//
// It has three jobs, and they belong to three different people.
//
// 1. Say what the thing is. Somebody following an invitation arrives here
//    having been told nothing, so the page says it before it asks for anything.
// 2. Offer a way in that costs nothing: an open session on a standing topic,
//    joined with an address. This sits ABOVE the account ask on purpose — a
//    stranger meets the offer before the sign-up. It is the only thing on this
//    page that works signed out, so it posts to the global, unauthenticated
//    POST /api/signup with a plain fetch. Routing it through services/api.ts
//    would mint a game token and 401 for exactly the person it is for.
// 3. Hand a returning host the way in. Signed in, the one thing this page
//    offers that no other page does is a new session.
//
// The copy is MO's, from PLATFORM.md §8, where the blurb was written for the
// homepage card that links here. One edit: it said "everyone records a story",
// and typing is first-class in this app rather than a fallback (Q3), so the
// sentence names both. Every other surface offering the recorder offers the
// textarea in the same breath; the front door should not promise otherwise.
//
// The word "session" throughout the offer, never "circle" (PLATFORM.md P15):
// a one-off is a session, and "circle" belongs to a group with continuity.

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001/api';

/** The standing topics an open session runs on. `key` is the second half of the
 *  `Signup` row's source, so these strings are the shape of the stored data. */
const TOPICS = [
  { key: 'prosperity', name: 'Prosperity', poleA: 'earned', poleB: 'given' },
  { key: 'family', name: 'Family', poleA: 'born into', poleB: 'chosen' },
  { key: 'technology', name: 'Technology', poleA: 'connecting', poleB: 'isolating' },
] as const;

export default function Home() {
  const { data: session } = useSession();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

  return (
    <Page>
      <header className="mb-8">
        <h1 className="font-[family-name:var(--font-source-serif)] text-4xl leading-tight">
          Threshold
        </h1>
        <p className="mt-1 mb-4 text-sm text-ink-faint">
          Where a group&rsquo;s dividing line falls.
        </p>
        <TideLine />
      </header>

      <div className="space-y-4">
        <Muted>
          Threshold puts the voices in a circle. The group takes a charged word and its two poles —
          <em> Authority: liberating / constricting</em> — everyone tells a story, recorded or
          typed, then everyone sorts everyone&rsquo;s stories.
        </Muted>
        <Muted>
          The stories the group splits on are its threshold: the actual dividing line, made of the
          specific stories that fell across it. Everyone keeps what the group made.
        </Muted>
      </div>

      <OpenSessions />

      {/* One action, chosen by who is reading. Signed in, the only thing this
          page can offer that no other page does is a new session; signed out,
          the account is the whole of the way in (D6). */}
      {/* While the session is still resolving, this shows the way IN rather
          than a spinner. It is the difference between a stranger's first
          screen offering something and offering "…", and it is what the
          server renders too — every other page here can wait for a session
          because you had to be signed in to be looking at it. A signed-in
          visitor sees this swap once, on the one page they came to leave. */}
      <section className="mt-12">
        {userId ? (
          <>
            <Action href="/new">Start a session</Action>
            <p className="mt-4">
              <Quiet href="/me">What you&rsquo;re in</Quiet>
            </p>
          </>
        ) : (
          <>
            <Action href="/login">Sign in</Action>
            <p className="mt-4">
              <Quiet href="/signup">Make an account</Quiet>
            </p>
            <p className="mt-6 text-sm leading-relaxed text-ink-faint">
              A session runs over days and tells you by email when it is your turn, so it needs an
              account to reach you by.
            </p>
          </>
        )}
      </section>

      <section className="mt-12">
        <Band>Joining one</Band>
        <Muted>
          A session reaches you by its own link, or by an invitation to the address you signed up
          with. Open the link and it will say what you are joining.
        </Muted>
      </section>
    </Page>
  );
}

/**
 * The offer a stranger can take. Pick a standing topic, leave an address, and
 * the room fills without an account ever being asked for.
 *
 * POST /api/signup is global, unauthenticated and rate-limited, and it upserts
 * on (email, source) — so a second submission of the same address on the same
 * topic is a person tapping twice, and answers `{ success: true }` exactly like
 * the first. That is why the success state here is unconditional: there is no
 * "already signed up" to report, and nothing is created twice.
 */
function OpenSessions() {
  const [topic, setTopic] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || sent) return;
    if (!topic) {
      setMessage('Pick a topic first.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`${API_BASE}/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), source: `activity-${topic}` }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data?.error || 'Something went wrong. Please try again.');
        setBusy(false);
        return;
      }
      setSent(true);
      setMessage("Seat saved. We'll email you when the room fills.");
    } catch {
      setMessage('Something went wrong. Please try again.');
    }
    setBusy(false);
  };

  return (
    <section className="mt-12">
      <Band>Open sessions</Band>
      <Muted>
        A session is one topic, run once. Pick one and leave your address; when the room fills, it
        begins — email carries you through telling, sorting, and the reveal.
      </Muted>

      <Card className="mt-4">
        <div className="grid gap-3" role="radiogroup" aria-label="Open sessions">
          {TOPICS.map(t => (
            <button
              key={t.key}
              type="button"
              role="radio"
              aria-checked={topic === t.key}
              disabled={sent}
              onClick={() => setTopic(t.key)}
              className="rounded-xl border p-4 text-left transition-colors disabled:opacity-60"
              style={{
                borderColor: topic === t.key ? 'var(--ink)' : 'var(--rule)',
                background: topic === t.key ? 'var(--ground-deep)' : 'transparent',
              }}
            >
              <span className="text-[15px] font-medium">{t.name}</span>
              <Polarity className="mt-2" poleA={t.poleA} poleB={t.poleB} />
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="mt-5">
          <input
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            disabled={sent}
            placeholder="you@example.com"
            aria-label="Your email address"
            className="w-full rounded-lg border border-[var(--rule)] bg-ground/40 p-3 text-[15px] outline-none focus:border-[var(--rule-strong)] disabled:opacity-60"
          />
          <div className="mt-3">
            <Action type="submit" disabled={busy || sent}>
              {busy ? 'Saving…' : 'Save my seat'}
            </Action>
          </div>
        </form>

        {/* Always mounted, so a message that appears later is announced —
            a live region inserted at the same moment as its text is not. */}
        <p role="status" className={`text-sm leading-relaxed text-ink-soft ${message ? 'mt-3' : ''}`}>
          {message}
        </p>
      </Card>

      <p className="mt-3 text-sm leading-relaxed text-ink-faint">
        Rooms hold ten. When yours fills, the session begins.
      </p>
    </section>
  );
}
