import { Page, Title, Note, NotBuilt } from '@/components/Scaffold';

// Post your topic + polarity. Any member, any time — the queue never closes
// (D27), and a topic posted into an idle circle starts running immediately.
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
        It posts into the queue rather than into a round: support is what decides which topic
        runs next, and that is the review the seeding round never had (D27).
      </NotBuilt>
    </Page>
  );
}
