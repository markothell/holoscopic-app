import type { Metadata } from 'next';

// The front door of the Chorus deployment.
//
// It is not a memorial and it never shows one. Every memorial lives at
// /c/<slug>, and the only way to reach one is the link you were sent — which
// is the point: a memorial is for the people who knew the person, not for
// anyone who happened to find the domain.
//
// The story of what Chorus is lives on holoscopic.io/chorus, where the rest of
// the games are introduced. This page exists so that someone who trims a link
// back to the domain lands somewhere deliberate rather than on a 404.

export const metadata: Metadata = {
  title: 'Chorus',
  description: 'Connecting stories and voices about one person, gathered from anyone with the link.',
};

const ABOUT_URL = process.env.NEXT_PUBLIC_ABOUT_URL || 'https://holoscopic.io/chorus';

export default function ChorusIndex() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <p className="eyebrow">Chorus</p>
      <h1 className="voice mt-2 text-[2.25rem] leading-[1.15] text-ink">
        Connecting Stories and&nbsp;Voices
      </h1>
      <p className="voice mt-5 text-[1.125rem] leading-[1.6] text-ink-soft">
        Every memorial here has its own link. If someone sent you one, open it — that link is the
        way in, and it is the only way in.
      </p>
      <p className="mt-8 text-[0.9375rem] text-ink-faint">
        <a
          href={ABOUT_URL}
          className="text-dial underline decoration-rule underline-offset-4"
        >
          What Chorus is
        </a>
      </p>
    </main>
  );
}
