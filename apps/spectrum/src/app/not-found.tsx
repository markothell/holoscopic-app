import Link from 'next/link';

// Unmatched routes. Without this file Next rendered its own unstyled 404, off
// the paper and out of the game's type. Game links travel by message, so a
// truncated one landing here is ordinary.
export default function NotFound() {
  return (
    <main className="flex min-h-dvh bg-paper text-ink">
      <div className="mx-auto flex max-w-md flex-col justify-center px-6">
        <p className="eyebrow">On a Spectrum</p>
        <h1 className="mt-2 font-display text-5xl font-bold uppercase leading-[0.95]">
          Nothing here
        </h1>
        <p className="mt-5 font-story text-xl leading-relaxed text-ink-soft">
          That address doesn&rsquo;t lead to a game you can open. If someone sent
          you the link, ask them to send it again.
        </p>
        <Link
          href="/"
          className="mt-8 font-mono-ui text-sm uppercase tracking-[0.12em] text-ay underline underline-offset-4"
        >
          Spectrum home
        </Link>
      </div>
    </main>
  );
}
