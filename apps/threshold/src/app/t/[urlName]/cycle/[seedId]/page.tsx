import { Page, Title, Note, NotBuilt } from '@/components/Scaffold';

// One cycle's reveal (PLAN.md §6.3, D23/D24).
//
// THREE GROUPS — two poles and the threshold — with no position inside a group.
// The threshold band's POPULATION is the finding: sparse means the group knows
// where its line falls, crowded means the line is where the argument is.
//
// A story is a dot with a short preview, expanding on tap; playback lives
// inside the expanded state, never on every dot.
//
// Where the line sits is a READER'S CONTROL, defaulting to three in four, with
// "more than half" and "all of them". This is what D15 bought: nothing is
// stored, so moving that line is a re-render and never a migration.
//
// THE THRESHOLD APPEARS ONCE THREE PEOPLE HAVE SUBMITTED. Below that this page
// still renders — the stories are here and attributed — and simply says nothing
// about a group's line. The gate is on rankings submitted, never on membership,
// so a twelve-person circle that drew three rankings behaves the same as a
// three-person one and D4 stays intact.
export default function CyclePage() {
  return (
    <Page>
      <Title>Where the line fell</Title>
      <Note>
        Two ends and the threshold between them. What sits in the middle is what the
        group did not agree about.
      </Note>
      <NotBuilt surface="The per-cycle reveal" section="PLAN.md §6.3">
        Dots in three groups, expanding on tap. The cutoff is a control — three in four by
        default — so a reader can watch the threshold widen and narrow.
      </NotBuilt>
    </Page>
  );
}
