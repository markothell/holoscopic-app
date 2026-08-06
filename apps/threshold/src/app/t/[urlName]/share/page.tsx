import { Page, Title, Note, Undesigned } from '@/components/Scaffold';

// Record or type a story, and pick the pole it is about. The share phase.
//
// This is the surface M3b builds: the recorder driving @hs/audio's useRecorder,
// with the seed's secondsPerNote as a hard cap and a visible countdown. The
// hook already auto-stops; the countdown and Threshold's own words for the
// three failure codes (denied | failed | empty) are what is new.
//
// One story per pole, at most two per member (D10). Re-submitting a pole
// replaces it rather than adding a second.
export default function SharePage() {
  return (
    <Page>
      <Title>Tell your story</Title>
      <Note>
        A time it was one of these two things. You see only your own stories until everyone has
        told theirs (D17) — reading the others first would anchor the group on whoever posted first.
      </Note>
      <Undesigned surface="The compose surface" section="PLAN.md §9.1, M3b">
        It should say plainly that a voice recording identifies its speaker in a small circle,
        whatever the payload strips — before anyone records, rather than implying an anonymity the
        medium cannot provide (§8.1).
      </Undesigned>
    </Page>
  );
}
