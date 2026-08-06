import Link from 'next/link';
import { Page, Title, Note } from '@/components/Scaffold';

// The backend 404s an absent circle and one you are not a member of
// identically, on purpose — from outside, a private circle and a nonexistent
// one look the same. So this page cannot say which it was.
export default function NotFound() {
  return (
    <Page>
      <Title>Nothing here</Title>
      <Note>That address doesn’t lead to a circle you can open.</Note>
      <Link href="/" className="underline underline-offset-4">Start over</Link>
    </Page>
  );
}
