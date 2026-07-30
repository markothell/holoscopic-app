import type { Tag } from '@/lib/types';

// The signature element. The prompt is a sentence with three blanks, and the
// answers are set ON ruled amber lines rather than inside pills — so a filled
// memory still reads as a sentence somebody wrote, which is the whole product
// bet (PLAN §1). Pills would have made it a tag UI.
//
// Three densities, because the same sentence does three jobs:
//
//   "full"    — on a memory's own page. The complete sentence, large. This is
//               the thing people screenshot and send on, so it gets room.
//   "compact" — on a wall card. The boilerplate is dropped and only the
//               grammar survives, because twenty cards each repeating "This is
//               a story where … having an experience of …" is noise, not
//               rhythm.
//   interactive (pass onSlotTap) — in the compose sheet. Same sentence, blanks
//               are buttons. Filling the form and reading the result are the
//               same object, which is why the form doesn't feel like a form.

export type Slot = 'subject' | 'self' | 'experience';

type Density = 'full' | 'compact';

function labelsOf(tags: Tag[]) {
  return tags.map(t => t.label).join(' and ');
}

// Each answer sits on its OWN ruled line — the "&" joining two answers falls
// between the rules, not on one. Two words written on two lines, which is what
// picking two tags actually was.
function Answers({ tags }: { tags: Tag[] }) {
  return (
    <>
      {tags.map((t, i) => (
        <span key={t.id}>
          {i > 0 && <span className="connective"> &amp; </span>}
          <span className="blank">{t.label}</span>
        </span>
      ))}
    </>
  );
}

function Blank({
  tags,
  slot,
  onSlotTap,
  ariaLabel,
}: {
  tags: Tag[];
  slot: Slot;
  onSlotTap?: (slot: Slot) => void;
  ariaLabel?: string;
}) {
  if (!onSlotTap) {
    if (!tags.length) return <span className="blank-empty" aria-hidden />;
    return <Answers tags={tags} />;
  }

  return (
    <button
      type="button"
      onClick={() => onSlotTap(slot)}
      aria-label={ariaLabel}
      className="rounded-[2px] text-left align-baseline"
    >
      {tags.length
        ? <Answers tags={tags} />
        : <span className="blank-empty text-center text-dial">＋</span>}
    </button>
  );
}

interface Props {
  subjectName: string;
  subjectTags: Tag[];
  selfTags: Tag[];
  experienceTags: Tag[];
  density?: Density;
  /** Makes the blanks buttons. Compose only. */
  onSlotTap?: (slot: Slot) => void;
}

export default function PromptSentence({
  subjectName,
  subjectTags,
  selfTags,
  experienceTags,
  density = 'full',
  onSlotTap,
}: Props) {
  // Screen readers get the sentence as prose; the ruled lines are decoration
  // and the ampersands between multiple answers read as "and".
  const spoken = [
    subjectTags.length ? `${subjectName} was ${labelsOf(subjectTags)}` : '',
    selfTags.length ? `I was ${labelsOf(selfTags)}` : '',
    experienceTags.length ? `an experience of ${labelsOf(experienceTags)}` : '',
  ].filter(Boolean).join('; ');

  const blankLabel = (lead: string, tags: Tag[]) =>
    tags.length ? `${lead}: ${labelsOf(tags)}. Change.` : `${lead}: choose.`;

  if (density === 'compact') {
    // Only the parts that were actually answered, so a sparse memory doesn't
    // render a row of empty rules.
    const parts: Array<{ lead: string; tags: Tag[] }> = [
      { lead: `${subjectName} was`, tags: subjectTags },
      { lead: 'I was', tags: selfTags },
      { lead: 'an experience of', tags: experienceTags },
    ].filter(p => p.tags.length);

    if (!parts.length) return null;

    return (
      <p className="text-[0.9375rem] leading-[1.9]" aria-label={spoken}>
        {parts.map((p, i) => (
          <span key={p.lead} aria-hidden>
            {i > 0 && <span className="text-ink-faint px-1.5">·</span>}
            <span className="connective">{p.lead} </span>
            <Answers tags={p.tags} />
          </span>
        ))}
      </p>
    );
  }

  const sentence = (
    <>
      <span className="connective">This is a story where </span>
      <span className="blank">{subjectName}</span>
      <span className="connective"> was </span>
      <Blank
        slot="subject" tags={subjectTags} onSlotTap={onSlotTap}
        ariaLabel={blankLabel(`${subjectName} was`, subjectTags)}
      />
      <span className="connective"> and I was </span>
      <Blank
        slot="self" tags={selfTags} onSlotTap={onSlotTap}
        ariaLabel={blankLabel('I was', selfTags)}
      />
      <span className="connective"> having an experience of </span>
      <Blank
        slot="experience" tags={experienceTags} onSlotTap={onSlotTap}
        ariaLabel={blankLabel('An experience of', experienceTags)}
      />
      <span className="connective">.</span>
    </>
  );

  // When the blanks are buttons they have to stay reachable, so the sentence
  // can't be hidden behind a summary label the way the read-only version is.
  if (onSlotTap) {
    return (
      <p className="voice text-[1.375rem] leading-[2] text-ink">{sentence}</p>
    );
  }

  return (
    <p
      className="voice text-[1.375rem] leading-[1.75] text-ink"
      aria-label={spoken || 'No details given'}
    >
      <span aria-hidden>{sentence}</span>
    </p>
  );
}
