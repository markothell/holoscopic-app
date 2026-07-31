const ABOUT_URL = process.env.NEXT_PUBLIC_ABOUT_URL || 'https://holoscopic.io/chorus';

// One line at the foot of a memorial, naming what this is.
//
// Before this there was NO outbound link from any memorial page — not from the
// wall, not from a memory, not from the layout. Someone who arrived from a text
// message, left a memory, and wondered what they had just used had exactly one
// move available: hand-editing the URL down to the bare domain. The root page's
// own comment says it was written for that person.
//
// Deliberately the quietest thing on the page. A memorial is somewhere people
// write about someone they have lost, and the platform's claim on that page
// should be a credit line — small, at the bottom, easy to ignore, and there
// when somebody goes looking for it.

export default function MemorialFooter() {
  return (
    <footer className="mt-16 border-t border-rule pt-6 pb-10 text-center">
      <p className="text-[0.8125rem] text-ink-faint">
        <a href={ABOUT_URL} className="underline decoration-rule underline-offset-4">
          Chorus
        </a>
        , an activity from Holoscopic
      </p>
    </footer>
  );
}
