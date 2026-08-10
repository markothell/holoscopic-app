import Link from 'next/link';

// What /c says when the address names nothing — no such memorial, or no such
// memory inside one.
//
// RENDERED, NOT THROWN, and that is a deliberate trade.
//
// The obvious way to write this is notFound(), and that is what the code did.
// It produced a correct 404 and a COMPLETELY BLANK PAGE: a <title> and no
// words. Verified on production — chorus.holoscopic.io/c/<anything-wrong>
// answers 404 with an empty body today. Next 16 registers exactly one
// not-found route (`/_not-found`, visible in the build output) and it catches
// unmatched URLs only; a notFound() raised inside /c/[slug] reaches no
// boundary at all. Placing not-found.tsx at /c, at /c/[slug], self-contained
// and re-exported, changes nothing — none of them are registered.
//
// So this is a component the route renders itself, which costs the 404 status
// and buys the words. That is the right way round here. A blank page is a
// total failure to communicate with someone who is holding a phone and a text
// message about a person who died, and this deployment is noindex plus
// robots-disallow throughout, so nothing downstream reads the status.
//
// The copy is careful about one thing, the same care app/not-found.tsx takes.
// A slug that never existed and a memorial that has since closed both arrive
// here, deliberately indistinguishable so that a closed memorial cannot be
// confirmed from outside. So this page cannot say "that memorial has closed".
// It can only say the link did not open, and point at the person who sent it.

const ABOUT_URL = process.env.NEXT_PUBLIC_ABOUT_URL || 'https://holoscopic.io/chorus';

export default function MemorialNotFound() {
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
