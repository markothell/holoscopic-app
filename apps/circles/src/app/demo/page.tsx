'use client';

// The sample circle's home — the product's hero surface, rendered from a
// written fixture (lib/demo.ts) and nothing else. No session, no request, no
// backend: the circle read paths are member-gated server-side on purpose and
// this page does not ask them for anything.
//
// Every band below is the SAME component the real circle home renders
// (components/circleHome.tsx, components/CircleMap.tsx). The only differences
// are `basePath`, which keeps the sample's links inside the sample, and
// `readOnly`, which withholds the controls that would write.

import Link from 'next/link';
import { Page, Band, Muted } from '@/components/Shell';
import { CircleMap } from '@/components/CircleMap';
import { CircleHeader, LiveSeedCard, NominationsBand, RecordBand } from '@/components/circleHome';
import {
  DEMO_BASE, DEMO_CIRCLE, DEMO_LIVE_ANSWERED, DEMO_MEMBERS, DEMO_NOTES, DEMO_SEED_IDS,
  DEMO_VIEWER_ID,
} from '@/lib/demo';
import { DemoNotice } from './DemoNotice';

const noop = async () => {};

export default function DemoCirclePage() {
  const circle = DEMO_CIRCLE;
  const live = circle.seeds.find(s => s.id === circle.liveSeedId) ?? null;

  return (
    <Page>
      <DemoNotice />

      <CircleHeader circle={circle} />

      {/* userId is null on purpose: the reader of a sample is nobody in it.
          No seat is marked "you", no answer reads as yours. */}
      <CircleMap circle={circle} userId={DEMO_VIEWER_ID} basePath={DEMO_BASE} />

      <p className="-mt-1 text-center text-xs text-ink-faint">
        Each big circle in the middle is something the group finished, sized by
        how many took part; the one wearing blue is running now. The short
        ochre line off Owen’s seat is an ask nobody has answered yet.
      </p>

      <section className="mt-8">
        <Band>Who is here</Band>
        <p className="text-[15px] leading-relaxed text-ink-soft">
          {DEMO_MEMBERS.map(m => m.username).join(' · ')}
        </p>
      </section>

      {live && <LiveSeedCard circle={circle} live={live} basePath={DEMO_BASE} readOnly />}
      {live && (
        <p className="mt-2 text-sm leading-relaxed text-ink-faint">
          {DEMO_NOTES[live.id]}{' '}
          <span className="text-ink-soft">
            ({DEMO_LIVE_ANSWERED} of {circle.memberCount} in, which the circle
            itself is not told either.)
          </span>
        </p>
      )}

      <NominationsBand circle={circle} userId={null} onChanged={noop} readOnly />
      <p className="mt-2 text-sm leading-relaxed text-ink-faint">
        Owen put this one to the circle; June and Priya backed it. Three of
        eight is the threshold this circle derives, so it is approved and
        waiting — one activity runs at a time here.
      </p>

      <RecordBand circle={circle} basePath={DEMO_BASE} />
      <p className="mt-2 text-sm leading-relaxed text-ink-faint">
        Three finished asks, and the reveals are the point — open one.
      </p>

      <section className="mt-12">
        <Band>Where to look</Band>
        <ul className="space-y-2">
          <li>
            <Link href={`${DEMO_BASE}/activity/${DEMO_SEED_IDS.month}`} className="text-[15px] underline underline-offset-4 hover:text-ink">
              The wall of stories
            </Link>
            <span className="ml-2 text-sm text-ink-faint">eight answers, named as they arrived</span>
          </li>
          <li>
            <Link href={`${DEMO_BASE}/activity/${DEMO_SEED_IDS.gives}`} className="text-[15px] underline underline-offset-4 hover:text-ink">
              The word portrait
            </Link>
            <span className="ml-2 text-sm text-ink-faint">a word one member coined, and another took up</span>
          </li>
          <li>
            <Link href={`${DEMO_BASE}/activity/${DEMO_SEED_IDS.work}`} className="text-[15px] underline underline-offset-4 hover:text-ink">
              The quadrant map
            </Link>
            <span className="ml-2 text-sm text-ink-faint">where eight people actually stand</span>
          </li>
        </ul>
      </section>

      <div className="mt-12">
        <Muted>
          A circle of your own starts with an account.{' '}
          <Link href="/signup" className="underline underline-offset-4 hover:text-ink">Make one</Link>, or{' '}
          <Link href="/login" className="underline underline-offset-4 hover:text-ink">sign in</Link>.
        </Muted>
      </div>
    </Page>
  );
}
