import type { Metadata } from 'next';
import { Page, Band, Card, Action, Muted } from '@/components/Shell';
import { Polarity } from '@/components/TideLine';
import { CircleMap } from '@/components/CircleMap';
import { DEMO_BASE, DEMO_CIRCLE, DEMO_MEMBERS, DEMO_RESULT, DEMO_SEED_ID, DEMO_VIEWER_ID } from '@/lib/demo';
import { DemoNotice } from './DemoNotice';

// The sample circle's home — one Threshold cycle that has already run, drawn
// from a written fixture (`lib/demo.ts`) and nothing else. No session, no
// request, no backend: the circle read paths are member-gated server-side on
// purpose and this page does not ask them for anything.
//
// The map is the app's real `CircleMap`, handed `basePath` so its links stay
// inside the sample. Nothing here is a control that would write — no support
// button, no facilitator row, no way to tell or sort — because on a sample
// those are absent rather than disabled.
//
// One topic, so there is no circle-final record to link: a graph of one node is
// not a graph (D33), and the reveal is the payoff anyway.

export const metadata: Metadata = {
  title: 'A finished session · Threshold',
  description: 'Eight people on Belonging, and where their line fell.',
};

export default function DemoCirclePage() {
  const circle = DEMO_CIRCLE;
  const seed = circle.seeds[0];

  return (
    <Page>
      <DemoNotice />

      <header className="mb-8">
        <h1 className="font-[family-name:var(--font-source-serif)] text-3xl leading-tight">
          {circle.title}
        </h1>
        <p className="mt-1 mb-4 text-sm text-ink-faint">
          {circle.memberCount} people · one topic, shared and sorted
        </p>
        {/* userId is null on purpose: the reader of a sample is nobody in it,
            so no seat is marked "you". */}
        <CircleMap circle={circle} userId={DEMO_VIEWER_ID} basePath={DEMO_BASE} />
      </header>

      <p className="-mt-1 mb-10 text-center text-xs text-ink-faint">
        Everyone on the ring, and in the middle the one thing they explored
        together — sized by how much of the circle told a story on it.
      </p>

      <section className="mb-10">
        <Band>Who is here</Band>
        <p className="text-[15px] leading-relaxed text-ink-soft">
          {DEMO_MEMBERS.map(m => m.username).join(' · ')}
        </p>
      </section>

      <Card>
        <Band>What they ran</Band>
        <h2 className="mb-3 font-[family-name:var(--font-source-serif)] text-2xl leading-snug">
          {seed.payload.topic}
        </h2>
        <Polarity poleA={seed.payload.poleA} poleB={seed.payload.poleB} className="mb-4" />
        <Muted>
          Each of the eight told a short story about a time belonging was one of
          those two things. Then six of them sorted every story onto one side or
          the other — including, unavoidably, stories they disagreed with.
        </Muted>
        <div className="mt-4">
          <Action href={`${DEMO_BASE}/cycle/${DEMO_SEED_ID}`}>See where the line fell</Action>
        </div>
      </Card>

      <p className="mt-3 text-sm leading-relaxed text-ink-faint">
        {DEMO_RESULT.shares.length} stories, {DEMO_RESULT.rankers} sorters. The
        ones everybody read the same way sit at the ends; the ones the group
        split on sit in the middle, and that middle is the threshold.
      </p>

      <section className="mt-12 border-t border-[var(--rule)] pt-6">
        <Muted>
          A session of your own runs the same way, over days, carried by email.
        </Muted>
        <div className="mt-4">
          <Action href="/">Start one of your own</Action>
        </div>
      </section>
    </Page>
  );
}
