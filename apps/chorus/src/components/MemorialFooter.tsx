// The credit line points at the platform, not at the product page: someone who
// reaches the foot of a memorial and wonders what carried it is asking who runs
// this, and holoscopic.io answers that with everything else it makes.
const HOLOSCOPIC_URL = process.env.NEXT_PUBLIC_HOLOSCOPIC_URL || 'https://holoscopic.io';
// A way to reach a person. The curator setting a memorial up and the
// contributor whose recording failed have the same question and, until now,
// the same answer: nothing on the page. The form at the other end is read by
// hand and answered the same day.
const CONTACT_URL = process.env.NEXT_PUBLIC_CONTACT_URL || 'https://holoscopic.io/contact';

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
        Chorus, an activity from{' '}
        <a href={HOLOSCOPIC_URL} className="underline decoration-rule underline-offset-4">
          Holoscopic
        </a>
        .{' '}
        <a href={CONTACT_URL} className="underline decoration-rule underline-offset-4">
          Contact
        </a>
      </p>
    </footer>
  );
}
