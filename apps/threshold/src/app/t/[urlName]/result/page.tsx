import { Page, Title, Note, NotBuilt } from '@/components/Scaffold';

// The circle-final screen (PLAN.md §6.3, D25).
//
// Topic nodes on a graph — the circle of sharing, seen whole. Each node carries
// the topic name, how many people took part, the two pole names, and one
// minimal bar split three ways: pole A / threshold in grey / pole B.
//
// A RECORD OF A CONVERSATION, NOT A VERDICT. It is a sharing circle: no winner,
// no league table, no most-contested headline. (circleResult() computes a
// mostContested id; this screen deliberately does not use it, and it should
// come out when this is built.)
export default function ResultPage() {
  return (
    <Page>
      <Title>All of it together</Title>
      <Note>
        Every topic the circle shared, and how each one sat with the group.
      </Note>
      <NotBuilt surface="The circle-final graph" section="PLAN.md §6.3">
        Topic nodes, each with a three-part proportion bar in the same colours as the reveal, so
        the two screens read as one idea at two scales.
      </NotBuilt>
    </Page>
  );
}
