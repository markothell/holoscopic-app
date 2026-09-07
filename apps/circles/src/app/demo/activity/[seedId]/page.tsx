'use client';

// One ask of the sample circle. Same surface a member reads — GatherSurface
// itself, not a copy of it — handed a written fixture instead of a fetch, and
// held read-only so nothing offers to take an answer it would then drop.
//
// Ask 4 is the sealed one still running, and it renders as a sealed ask
// renders: the state line and nothing under it. That is not a hole in the
// fixture, it is the mechanic — until the eighth person answers, nobody sees
// anybody. The note under the prompt says so out loud.

import { use } from 'react';
import Link from 'next/link';
import { Page, Muted, Action, Quiet } from '@/components/Shell';
import { GatherSurface } from '@/components/GatherSurface';
import { DEMO_BASE, DEMO_CIRCLE, DEMO_EXTRAS, DEMO_NOTES, DEMO_SEED_IDS, demoSeed } from '@/lib/demo';
import { DemoNotice } from '../../DemoNotice';

const noop = async () => {};

export default function DemoActivityPage({ params }: { params: Promise<{ seedId: string }> }) {
  const { seedId } = use(params);
  const seed = demoSeed(seedId);

  if (!seed) {
    return (
      <Page>
        <Muted>Nothing here by that name.</Muted>
        <div className="mt-4"><Action href={DEMO_BASE}>To the demo circle</Action></div>
      </Page>
    );
  }

  // Reachable from the map: the ochre spur off Owen's seat is this ask, and it
  // has not started. The real surface guards the same way before it renders
  // anything (app/c/[urlName]/activity/[seedId]/page.tsx) — a queued ask has
  // no responses to show and no compose to offer.
  const queued = seed.phase === 'pending' || seed.phase === 'nominated';

  const header = (
    <div className="pt-2">
      <DemoNotice compact />
      <Quiet href={DEMO_BASE}>{DEMO_CIRCLE.title}</Quiet>
      <h1 className="mt-1 text-2xl leading-snug" style={{ textWrap: 'balance' }}>
        {seed.payload.prompt}
      </h1>
      {seed.payload.context && <Muted>{seed.payload.context}</Muted>}
      {DEMO_NOTES[seed.id] && (
        <p className="mt-3 text-sm leading-relaxed text-ink-faint">{DEMO_NOTES[seed.id]}</p>
      )}
      {/* A sealed ask that is still running shows nothing, correctly — so the
          two surfaces with nothing under them say where the reveals are
          rather than leaving a reader on an empty page. */}
      {(seed.id === DEMO_SEED_IDS.changed || seed.id === DEMO_SEED_IDS.next) && (
        <p className="mt-2 text-sm leading-relaxed text-ink-faint">
          The finished ones are where the reveals are:{' '}
          <Link href={`${DEMO_BASE}/activity/${DEMO_SEED_IDS.month}`} className="underline underline-offset-4 hover:text-ink">the wall of stories</Link>,{' '}
          <Link href={`${DEMO_BASE}/activity/${DEMO_SEED_IDS.gives}`} className="underline underline-offset-4 hover:text-ink">the word portrait</Link>,{' '}
          <Link href={`${DEMO_BASE}/activity/${DEMO_SEED_IDS.work}`} className="underline underline-offset-4 hover:text-ink">the quadrant map</Link>.
        </p>
      )}
    </div>
  );

  if (queued) {
    return (
      <Page>
        {header}
        <div className="mt-6">
          <Muted>Approved — waiting for a slot.</Muted>
        </div>
      </Page>
    );
  }

  return (
    <GatherSurface
      circle={DEMO_CIRCLE}
      seed={seed}
      extras={DEMO_EXTRAS[seed.id] ?? null}
      // Nobody: no response reads as mine, no seat is marked, and readOnly
      // means this id is never sent anywhere because nothing is sent anywhere.
      userId="demo-visitor"
      header={header}
      onChanged={noop}
      pageError={null}
      readOnly
    />
  );
}
