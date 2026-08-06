import Link from 'next/link';
import { Page, Title, Note, Undesigned } from '@/components/Scaffold';

// The front door. Never shows a circle — a circle is /t/<urlName>, and there is
// no default one. Same posture as Chorus's root.
export default function Home() {
  return (
    <Page>
      <Title>Threshold</Title>
      <Note>
        A group finds out where its dividing line falls. Everyone tells a short story about a
        polarity, then the group sorts every story onto one side or the other. The stories you all
        read the same way sit at the ends; the ones you split on sit in the middle, and that middle
        is the line.
      </Note>

      <Undesigned surface="The front door" section="PLAN.md §9.1, §9.2">
        Create a circle, or join one from a link. Its shape follows the visual thesis (Q10).
      </Undesigned>

      <p className="mt-6 text-sm">
        <Link href="/me" className="underline underline-offset-4">Circles I’m in</Link>
      </p>
    </Page>
  );
}
