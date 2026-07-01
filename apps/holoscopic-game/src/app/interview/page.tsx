import { redirect } from 'next/navigation';

// /interview → redirect to the default session.
// When multiple sessions exist, this becomes a session-listing page.
export default function InterViewIndexPage() {
  redirect('/interview/interview');
}
