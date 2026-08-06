import { Page, Title, Note, Undesigned } from '@/components/Scaffold';

// Post your topic + polarity. The seeding phase.
//
// The validation is already fixed server-side (utils/threshold.js#normalizeSeed):
// a topic up to 120 chars, two pole labels up to 40 each, and they may not be
// the same word — two identical ends give every ranker the same bucket twice,
// which makes agreement meaningless rather than merely uninteresting.
export default function SeedPage() {
  return (
    <Page>
      <Title>Post your topic</Title>
      <Note>A subject, and the two ends people will sort stories between.</Note>
      <Undesigned surface="The seed form" section="PLAN.md §9.1">
        Open alongside it: whether the seeding round needs any review at all (Q6). Twelve topics
        arrive at once with nothing filtering them, and one incoherent polarity burns a whole cycle.
      </Undesigned>
    </Page>
  );
}
