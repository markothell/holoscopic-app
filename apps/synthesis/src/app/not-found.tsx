import Link from 'next/link';

// Unmatched routes. Without this file Next rendered its own black-and-white
// 404, the one screen in the app off the dusk ground.
export default function NotFound() {
  return (
    <main className="flex min-h-dvh bg-dusk text-mist">
      <div className="mx-auto flex max-w-md flex-col justify-center px-6">
        <p className="font-mono-ui text-xs uppercase tracking-[0.18em] text-mist-faint">Synthesis</p>
        <h1 className="mt-2 font-display text-4xl leading-tight">Nothing here</h1>
        <p className="mt-5 font-ui text-lg leading-relaxed text-mist-soft">
          That address doesn&rsquo;t lead to a map you can open. If someone sent
          you the link, ask them to send it again.
        </p>
        <Link href="/" className="mt-8 font-ui text-own underline underline-offset-4">
          Synthesis home
        </Link>
      </div>
    </main>
  );
}
