// Scaffolding chrome. Everything in this file is placeholder — it exists so
// the route skeleton is walkable while §6.2, §6.3 and §9.2 are being designed,
// and it should be deleted rather than restyled when they are.

export function Page({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-md px-5 py-10">{children}</main>;
}

export function Title({ children }: { children: React.ReactNode }) {
  return <h1 className="font-[family-name:var(--font-source-serif)] text-2xl mb-1">{children}</h1>;
}

export function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-[15px] leading-relaxed text-ink-soft mb-4">{children}</p>;
}

/**
 * A surface that is specified but not built. Names the section of PLAN.md that
 * specifies it, so the next person builds what was decided rather than
 * redesigning it from the placeholder.
 */
export function NotBuilt({ surface, section, children }: {
  surface: string;
  section: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-[var(--rule-strong)] p-5">
      <p className="text-xs uppercase tracking-wider text-ink-faint mb-2">Designed, not built</p>
      <p className="font-[family-name:var(--font-source-serif)] text-lg mb-2">{surface}</p>
      <p className="text-sm leading-relaxed text-ink-soft">
        Specified in <code className="text-ink">{section}</code>. Build that, rather than
        designing from this placeholder.
      </p>
      {children ? <div className="mt-3 text-sm text-ink-soft">{children}</div> : null}
    </div>
  );
}
