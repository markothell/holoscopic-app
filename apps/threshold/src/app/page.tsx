'use client';

import { useSession } from 'next-auth/react';
import { Page, Band, Action, Quiet, Muted } from '@/components/Shell';
import { TideLine } from '@/components/TideLine';

// The front door. It never shows a circle — a circle is /t/<urlName> and there
// is no default one, the same posture as Chorus's root.
//
// It has two jobs and they belong to different people. Somebody following an
// invitation arrives here having been told nothing, so the page has to say what
// the thing is before it asks for an account. Somebody who already has circles
// arrives here by typing the address, and wants the way in.
//
// The copy is MO's, from PLATFORM.md §8, where the blurb was written for the
// homepage card that links here. One edit: it said "everyone records a story",
// and typing is first-class in this app rather than a fallback (Q3), so the
// sentence names both. Every other surface offering the recorder offers the
// textarea in the same breath; the front door should not promise otherwise.

export default function Home() {
  const { data: session, status } = useSession();
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
          specific stories that fell across it. The circle keeps what it made, and a group that
          gathers again has a history.
        </Muted>
      </div>

      {/* One action, chosen by who is reading. Signed in, the only thing this
          page can offer that no other page does is a new circle; signed out,
          the account is the whole of the way in (D6). */}
      <section className="mt-10">
        {status === 'loading' ? (
          <Muted>…</Muted>
        ) : userId ? (
          <>
            <Action href="/new">Start a circle</Action>
            <p className="mt-4">
              <Quiet href="/me">Circles you&rsquo;re in</Quiet>
            </p>
          </>
        ) : (
          <>
            <Action href="/login">Sign in</Action>
            <p className="mt-4">
              <Quiet href="/signup">Make an account</Quiet>
            </p>
            <p className="mt-6 text-sm leading-relaxed text-ink-faint">
              A circle runs over days and tells you by email when it is your turn, so it needs an
              account to reach you by.
            </p>
          </>
        )}
      </section>

      <section className="mt-12">
        <Band>Joining one</Band>
        <Muted>
          A circle reaches you by its own link, or by an invitation to the address you signed up
          with. Open the link and it will say what you are joining.
        </Muted>
      </section>
    </Page>
  );
}
