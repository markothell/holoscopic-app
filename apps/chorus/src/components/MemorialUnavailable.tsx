// What a memorial says when it cannot show itself.
//
// This exists because the alternative was worse than a bad page. Every read
// failure used to collapse into one of two wrong answers: the layout caught
// everything and called notFound(), so a rate limit, an Atlas failover or a
// deploy restart rendered as "this memorial does not exist" — to somebody who
// was texted a link about a person who died. The wall page had the right idea
// already; it just had no way to say WHICH thing had happened.
//
// So there are two reasons, and they are genuinely different news:
//
//   busy         Everyone arrived at once. The memorial is fine, the server is
//                keeping up with somebody else this second. This is the good
//                kind of problem and the copy should sound like it — a person
//                who has just been sent a link to a wake does not need to be
//                told the internet is broken when the truth is that forty
//                people opened it in the same minute.
//   unreachable  Something at our end. Rarer, and the one where the only thing
//                that matters is that nothing they wrote has gone anywhere.
//
// The retry is a plain <a> to this same URL, not a button: this is a Server
// Component and the thing that failed was a server fetch, so a full request is
// exactly what has to happen again. It also means recovery works with no
// JavaScript at all — which is the state a phone on one bar is closest to.

const COPY = {
  busy: {
    lead: 'So many people are here at once.',
    reassure: 'Everything is safe. Give it a moment.',
  },
  unreachable: {
    lead: 'These memories can’t be reached right now.',
    reassure: 'Nothing has been lost.',
  },
} as const;

export type UnavailableReason = keyof typeof COPY;

export default function MemorialUnavailable({
  reason,
  href,
}: {
  reason: UnavailableReason;
  /** Where "Try again" goes — this memorial's own path, so a retry stays here. */
  href: string;
}) {
  const { lead, reassure } = COPY[reason];

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 text-center">
      <p className="voice text-[1.25rem] text-ink-soft">{lead}</p>
      <p className="mt-2 text-[0.9375rem] text-ink-faint">{reassure}</p>
      <a
        href={href}
        className="mt-7 w-full rounded-[3px] bg-dial px-5 py-3.5 text-[1rem] font-medium
                   text-card-raised"
      >
        Try again
      </a>
    </main>
  );
}
