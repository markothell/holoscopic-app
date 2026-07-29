'use client';

import Link from 'next/link';

// The signed-out front door for synthesis.holoscopic.io. A scroll narrative in
// the app's own dusk theme — hand-styled Synthesis-native rather than a port of
// the holoscopic.io marketing CSS, the same way On a Spectrum built its own.
//
// It has one job: make "an idea is a thought space" land before anyone signs
// up, because that is the concept the whole app rests on and it is the one a
// visitor has no prior for. Everything else is downstream of it.
//
// COPY RULE (project-wide): every line says what a thing IS. No "not a…",
// no "instead of…", no defining by contrast.

// ── Beat marks ────────────────────────────────────────────────────────────
// Small inline SVGs reusing the map's own shape language, so the landing page
// and the app read as one system: hexagon = topic hub, chamfered card =
// thought, dashed = private, offset rings = notable, ∪ = the union.

const hex = (x: number, y: number, w: number, h: number) =>
  `M ${x + w * 0.25},${y} L ${x + w * 0.75},${y} L ${x + w},${y + h / 2} `
  + `L ${x + w * 0.75},${y + h} L ${x + w * 0.25},${y + h} L ${x},${y + h / 2} Z`;

const card = (x: number, y: number, w: number, h: number, c = 5) =>
  `M ${x + c},${y} L ${x + w - c},${y} L ${x + w},${y + c} L ${x + w},${y + h - c} `
  + `L ${x + w - c},${y + h} L ${x + c},${y + h} L ${x},${y + h - c} L ${x},${y + c} Z`;

function Mark({ children }: { children: React.ReactNode }) {
  return (
    <svg width="72" height="56" viewBox="0 0 72 56" fill="none" aria-hidden className="mt-0.5 shrink-0">
      {children}
    </svg>
  );
}

// 1 — a private map: one hub, two thoughts beneath it, dashed for private.
const MarkMap = (
  <Mark>
    <path d={hex(22, 6, 28, 15)} fill="none" stroke="var(--own)" strokeWidth="1.2" strokeDasharray="4 3" />
    <path d={card(3, 34, 26, 15)} fill="none" stroke="var(--own)" strokeWidth="1.2" />
    <path d={card(43, 34, 26, 15)} fill="none" stroke="var(--own)" strokeWidth="1.2" />
    <path d="M31,21 L20,34 M41,21 L52,34" stroke="var(--line-strong)" strokeWidth="1" />
  </Mark>
);

// 2 — a thought carried in from someone else: periwinkle, dashed cross-map link.
const MarkBorrow = (
  <Mark>
    <path d={card(2, 21, 26, 15)} fill="none" stroke="var(--own)" strokeWidth="1.2" />
    <path d={card(44, 21, 26, 15)} fill="none" stroke="var(--borrowed)" strokeWidth="1.2" />
    <path d="M28,28 L44,28" stroke="var(--borrowed)" strokeWidth="1.2" strokeDasharray="3 3" />
  </Mark>
);

// 3 — the union: many lines gathered into one mark.
const MarkUnion = (
  <Mark>
    {[8, 20, 32].map((y, i) => (
      <path
        key={i}
        d={`M4,${y + 6} C24,${y + 6} 28,28 44,28`}
        fill="none"
        stroke="var(--own)"
        strokeWidth="1"
        opacity={0.55}
      />
    ))}
    <text x="50" y="35" fontSize="20" fill="var(--borrowed)" fontFamily="var(--font-plex-mono), monospace">∪</text>
  </Mark>
);

// 4 — synthesis: the idea's hub double-ringed, exactly as the map draws it.
const MarkSynthesis = (
  <Mark>
    <path d={hex(26, 20, 22, 14)} fill="none" stroke="var(--synthesis)" strokeWidth="1.4" />
    <path d={hex(22, 16, 30, 22)} fill="none" stroke="var(--synthesis)" strokeWidth="1" opacity={0.8} />
    <path d={hex(18, 12, 38, 30)} fill="none" stroke="var(--synthesis)" strokeWidth="1" opacity={0.34} />
  </Mark>
);

function Beat({ mark, title, body }: { mark: React.ReactNode; title: string; body: string }) {
  return (
    <li className="flex items-start gap-4">
      {mark}
      <span>
        <span className="block text-sm text-mist">{title}</span>
        <span className="mt-1 block text-sm leading-relaxed text-mist-soft">{body}</span>
      </span>
    </li>
  );
}

function Section({ children, delay = '0s' }: { children: React.ReactNode; delay?: string }) {
  return (
    <section className="rise-in border-t pt-10" style={{ borderColor: 'var(--line)', animationDelay: delay }}>
      {children}
    </section>
  );
}

export default function LoggedOutLanding({ onTryDemo }: { onTryDemo: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-10 px-6 pb-16 pt-[max(3.5rem,env(safe-area-inset-top))]">

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <header className="rise-in">
        <p className="eyebrow" style={{ color: 'var(--own)' }}>Synthesis</p>
        <h1 className="display mt-3 text-6xl leading-[0.95]">
          Find the words<br />
          <span style={{ color: 'var(--synthesis)' }}>a group shares</span>
        </h1>
        <p className="mt-5 text-sm leading-relaxed text-mist-soft">
          A group thinks together on one idea, out in the open, and works toward
          a single statement all of them stand behind.
        </p>
        <div className="mt-7 flex flex-col gap-3">
          <Link
            href="/signup"
            className="w-full rounded-full px-6 py-4 text-center text-base font-semibold"
            style={{ background: 'var(--own)', color: 'var(--dusk-deep)' }}
          >
            Start an idea
          </Link>
          <Link
            href="/login"
            className="w-full rounded-full border px-6 py-3.5 text-center text-sm"
            style={{ borderColor: 'var(--line-strong)', color: 'var(--mist-soft)' }}
          >
            Sign in
          </Link>
        </div>
      </header>

      {/* ── What an idea is ────────────────────────────────────────────── */}
      <Section>
        <p className="eyebrow" style={{ color: 'var(--own)' }}>An idea</p>
        <h2 className="display mt-2.5 text-3xl leading-tight">
          A thought space you draft<br />and invite people into.
        </h2>
        <p className="mt-4 text-sm leading-relaxed text-mist-soft">
          It starts as a title — a question worth a group&rsquo;s attention. That
          title sits at the centre of everyone&rsquo;s map, and the idea becomes
          whatever its collaborators put underneath it. Up to fifty people, each
          under a handle that means something here.
        </p>
      </Section>

      {/* ── How it works ───────────────────────────────────────────────── */}
      <Section delay="0.05s">
        <p className="eyebrow" style={{ color: 'var(--own)' }}>How it works</p>
        <ul className="mt-6 flex flex-col gap-7">
          <Beat
            mark={MarkMap}
            title="Think privately first"
            body="Grow your own map of the idea — hubs, thoughts, the context behind each one. It stays yours until you publish it."
          />
          <Beat
            mark={MarkBorrow}
            title="Respond, and carry it home"
            body="Answering someone's published thought places your stance on their post and drops a linked copy onto your own map. Add your own thinking to it and it becomes yours."
          />
          <Beat
            mark={MarkUnion}
            title="Take the union"
            body="One read of everything the group has published, cited back to who said what. Edit it into words you would stand behind, and put those to the group."
          />
          <Beat
            mark={MarkSynthesis}
            title="Find synthesis"
            body="Everyone holds three slots, shared between writing statements and backing them. When two thirds of the group stands behind one, the idea is in synthesis."
          />
        </ul>
      </Section>

      {/* ── Synthesis is living ────────────────────────────────────────── */}
      <Section delay="0.1s">
        <p className="eyebrow" style={{ color: 'var(--synthesis)' }}>Synthesis</p>
        <h2 className="display mt-2.5 text-3xl leading-tight">
          A measure the group holds,<br />
          <span style={{ color: 'var(--synthesis)' }}>for as long as it holds it.</span>
        </h2>
        <p className="mt-4 text-sm leading-relaxed text-mist-soft">
          Synthesis stays live. Backing moves, better words arrive, new people
          join — and the measure follows. Anyone who reads where the group landed
          and sees it differently can put up their own words and move it. Getting
          there is the group&rsquo;s achievement, and so is finding better.
        </p>
      </Section>

      {/* ── CTA ────────────────────────────────────────────────────────── */}
      <Section delay="0.15s">
        <Link
          href="/signup"
          className="block w-full rounded-full px-6 py-4 text-center text-base font-semibold"
          style={{ background: 'var(--own)', color: 'var(--dusk-deep)' }}
        >
          Start an idea
        </Link>
        <p className="mt-3 text-center text-sm text-mist-soft">
          Have an invite code?{' '}
          <Link className="underline" style={{ color: 'var(--own)' }} href="/login">
            Sign in to use it
          </Link>
        </p>
        <button
          type="button"
          onClick={onTryDemo}
          className="eyebrow mt-6 w-full text-center !text-[0.6rem] text-mist-faint underline"
        >
          Look around a sample idea &rarr;
        </button>
      </Section>

      <footer className="border-t pt-6" style={{ borderColor: 'var(--line)' }}>
        <p className="eyebrow !text-[0.6rem]" style={{ color: 'var(--mist-faint)' }}>
          <a href="https://holoscopic.io" className="underline">holoscopic.io</a>
          {' · '}experiments in collective intelligence
        </p>
      </footer>
    </main>
  );
}
