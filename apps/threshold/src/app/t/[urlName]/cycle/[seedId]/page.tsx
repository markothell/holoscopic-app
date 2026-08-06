import { Page, Title, Note, Undesigned } from '@/components/Scaffold';

// One cycle's reveal. The payoff for a single topic.
//
// The data is already continuous and already stored (D15): every share carries
// an `agreement` from 0 to 1, and NO band classification is saved. Any grouping
// this screen draws is a render-time choice, so it can be redesigned without a
// migration — which is exactly why it was safe to leave undesigned.
export default function CyclePage() {
  return (
    <Page>
      <Title>Where the line fell</Title>
      <Note>
        Every story laid out by how much of the group agreed about it. The ones you all read the
        same way sit at the ends; the ones you split on sit in the middle.
      </Note>
      <Undesigned surface="The per-cycle reveal" section="PLAN.md §6.3">
        Q4: a continuous axis, or three zones. Q5: whether a story opens as a positioned mark that
        expands, or as a list ordered by agreement — the first shows the distribution, the second
        shows the stories, and on a phone one of them has to lead. Q7: at one ranker every story is
        unanimous by construction, so the coherence framing has to be suppressed rather than
        reported.
      </Undesigned>
    </Page>
  );
}
