'use client';

import { Page, Title, Note } from '@/components/Scaffold';

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <Page>
      <Title>That didn’t load</Title>
      <Note>Something went wrong on our side.</Note>
      <button onClick={reset} className="underline underline-offset-4">Try again</button>
    </Page>
  );
}
