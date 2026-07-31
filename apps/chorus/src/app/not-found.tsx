import Link from 'next/link';

// The page a wrong link lands on.
//
// Every memorial reaches people by being forwarded — texted, pasted, read aloud
// over the phone — so a link that arrives mistyped, truncated by a mail client,
// or pointing at a memorial that has since closed is a LIKELY first contact,
// not an edge case. It was landing on Next's stock black-and-white 404: no
// name, no explanation, and nothing to click.
//
// The copy is careful about one thing. `layout.tsx` calls notFound() both for a
// slug that never existed and for one that is no longer available, and it does
// that deliberately so a closed memorial and an imaginary one look identical
// from outside. So this page cannot say "that memorial has closed" — it can
// only say the link did not open, and point at the person who sent it.

const ABOUT_URL = process.env.NEXT_PUBLIC_ABOUT_URL || 'https://holoscopic.io/chorus';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <p className="eyebrow">Chorus</p>
      <h1 className="voice mt-2 text-[2.25rem] leading-[1.15] text-ink">
        This link didn&rsquo;t open
      </h1>
      <p className="voice mt-5 text-[1.125rem] leading-[1.6] text-ink-soft">
        Memorial links are long and easy to break in half when they travel. Check
        the message it came in for the whole address, or ask whoever sent it to
        send it again.
      </p>
      <p className="mt-8 flex flex-col gap-3 text-[0.9375rem] text-ink-faint">
        <Link href="/" className="text-dial underline decoration-rule underline-offset-4">
          Chorus home
        </Link>
        <a href={ABOUT_URL} className="text-dial underline decoration-rule underline-offset-4">
          What Chorus is
        </a>
      </p>
    </main>
  );
}
