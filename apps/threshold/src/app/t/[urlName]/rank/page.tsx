import { Page, Title, Note, NotBuilt } from '@/components/Scaffold';

// The ranking space (PLAN.md §6.2, D21/D22). The single most-used surface in
// the app: a QUEUE, not a board. One story at a time, full width, playing, with
// two big targets — hear it, choose a side, it advances. Drag between columns
// was the obvious answer and is the wrong one on a phone, and it implies an
// ordering that carries no meaning (D11).
//
// The queue is followed by a REVIEW SCREEN, which restores the whole set and
// owns submit. Unfinished reads as the stories still queued up — never a count,
// never a dead button. Your own story arrives pre-placed on the pole you chose
// when you told it, and you can move it (D22).
export default function RankPage() {
  return (
    <Page>
      <Title>Sort the stories</Title>
      <Note>
        Every story goes on one side or the other. You hear them one at a time and
        choose as you listen, then review the whole set before you submit.
      </Note>
      <NotBuilt surface="The ranking space" section="PLAN.md §6.2">
        A queue with two buttons, then a review screen that owns submit. The pole labels are the
        seed’s own words throughout — nothing here says “A” or “B”.
      </NotBuilt>
    </Page>
  );
}
