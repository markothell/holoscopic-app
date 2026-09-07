import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CycleReveal } from '@/components/CycleReveal';
import { DEMO_BASE, DEMO_RESULT, DEMO_SHARES, demoSeed } from '@/lib/demo';
import { DemoNotice } from '../../DemoNotice';

// The sample's reveal — the payoff, and the reason the demo exists.
//
// This is the SAME surface a member reads: `components/CycleReveal.tsx` itself,
// not a copy of it, handed the written fixture instead of a fetch. The cutoff
// control works, the dots expand, the attribution is there. There is nothing to
// hold read-only, because a reveal has no controls that write.

export const metadata: Metadata = {
  title: 'Belonging · Threshold',
  description: 'Eight stories about belonging, sorted by six people, and the line that fell out of it.',
};

export default async function DemoCyclePage({ params }: { params: Promise<{ seedId: string }> }) {
  const { seedId } = await params;
  const seed = demoSeed(seedId);
  if (!seed) notFound();

  return (
    <CycleReveal
      seed={seed}
      shares={DEMO_SHARES}
      result={DEMO_RESULT}
      base={DEMO_BASE}
      intro={<DemoNotice />}
    />
  );
}
