import { Page, Title, Note, Undesigned } from '@/components/Scaffold';

// The ranking space. The single most-used surface in the app, and the one
// DESIGN-QUESTIONS.md says to decide first — the reveal is a picture of
// whatever this produces, so if this changes shape, that does too.
//
// The MECHANIC is settled (D11) and constrains whatever gets built here:
// two buckets carrying the seed's own pole words, no neutral and no skip, no
// ordering within a bucket, placements drafting as you listen, and one explicit
// final submit that is complete or nothing.
export default function RankPage() {
  return (
    <Page>
      <Title>Sort the stories</Title>
      <Note>
        Every story goes on one side or the other. You sort while you listen, rearrange as much as
        you like, and submit once.
      </Note>
      <Undesigned surface="The ranking space" section="PLAN.md §6.2">
        Q1 is the primary gesture — a queue with two buttons, two columns you tap into, or drag.
        The live lean is the queue plus a review screen: the queue makes “sort while listening”
        literal, and the review screen restores the whole-set view, which maps onto the
        draft-then-submit shape the data already has.
      </Undesigned>
    </Page>
  );
}
