import { Page, Title, Note, Undesigned } from '@/components/Scaffold';

// The circle-final graph. All N topics together — the payoff screen for
// Sharing Circle mode, and the reason the Circle layer exists at all.
export default function ResultPage() {
  return (
    <Page>
      <Title>All of it together</Title>
      <Note>Which topics this group reads the same way, and which one splits it.</Note>
      <Undesigned surface="The circle-final graph" section="PLAN.md §6.3, §13 Q1">
        Q8: whether a topic reduces to one number (meanCoherence, which makes a clean comparable
        chart) or keeps its whole gradient (truer, and at twelve topics risks twelve unreadable
        strips). Q9: whether the ending is about the group — “authority splits us more than money
        does” — or about the stories people actually made. Those are two different screens.
      </Undesigned>
    </Page>
  );
}
