import { Page, Title, Note, NotBuilt } from '@/components/Scaffold';

// Post your topic + polarity. The seeding phase.
//
// The validation is already fixed server-side (utils/threshold.js#normalizeSeed):
// a topic up to 120 chars, two pole labels up to 40 each, and they may not be
// the same word — two identical ends give every ranker the same bucket twice,
// which makes agreement meaningless rather than merely uninteresting.
//
// The pole COLOURS are not chosen here and never will be: they are the app's
// identity, fixed once so neither end of anybody's polarity looks like the
// right answer (D26).
export default function SeedPage() {
  return (
    <Page>
      <Title>Post your topic</Title>
      <Note>
        A subject, and the two ends people will sort stories between.
      </Note>
      <NotBuilt surface="The seed form" section="PLAN.md §9.1">
        Still open alongside it: whether the seeding round needs any review at all (§13 Q5).
        Twelve topics arrive at once with nothing filtering them, and one incoherent polarity
        burns a whole cycle.
      </NotBuilt>
    </Page>
  );
}
