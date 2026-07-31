import type { Tag } from '@/lib/types';

// The signature element. A memory reads as a sentence with its answers set ON
// ruled amber lines rather than inside pills — so a finished memory still
// reads as something somebody wrote, which is the whole product bet (PLAN §1).
// Pills would have made it a tag UI.
//
// READ-ONLY. Composing used to happen inside this sentence, with each blank a
// button; it is two direct questions now (see compose/TagQuestion.tsx). The
// sentence is what a memory IS, not how one is entered.
//
// Two densities, because the same sentence does two jobs:
//
//   "full"    — on a memory's own page. The complete sentence, large. This is
//               the thing people screenshot and send on, so it gets room.
//   "compact" — on a wall card. The boilerplate is dropped and only the
//               grammar survives, because twenty cards each repeating "This is
//               a story where … having an experience of …" is noise, not
//               rhythm.
//
// EVERY CLAUSE IS OPTIONAL. "I was ___" is no longer collected at all, so most
// memories have two of the three and older ones have all three; a slot with
// nothing in it drops its clause rather than rendering an empty rule.

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

interface Props {
  subjectName: string;
  subjectTags: Tag[];
  selfTags: Tag[];
  experienceTags: Tag[];
  density?: Density;
}

export default function PromptSentence({
  subjectName,
  subjectTags,
  selfTags,
  experienceTags,
  density = 'full',
}: Props) {
  // Screen readers get the sentence as prose; the ruled lines are decoration
  // and the ampersands between multiple answers read as "and".
  const spoken = [
    subjectTags.length ? `${subjectName} was ${labelsOf(subjectTags)}` : '',
    selfTags.length ? `I was ${labelsOf(selfTags)}` : '',
    experienceTags.length ? `an experience of ${labelsOf(experienceTags)}` : '',
  ].filter(Boolean).join('; ');

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

  // "This is a story where Ellen was stubborn and I was young having an
  // experience of being seen." — with the two "was" clauses joined by "and",
  // and the experience clause hanging off whatever came before it.
  const who: React.ReactNode[] = [];
  if (subjectTags.length) {
    who.push(
      <span key="subject">
        <span className="blank">{subjectName}</span>
        <span className="connective"> was </span>
        <Answers tags={subjectTags} />
      </span>,
    );
  }
  if (selfTags.length) {
    who.push(
      <span key="self">
        <span className="connective">I was </span>
        <Answers tags={selfTags} />
      </span>,
    );
  }

  // Nothing answered at all — a memory that is purely a story. The rules would
  // be the only thing on the page, so there is no sentence to render.
  if (!who.length && !experienceTags.length) return null;

  const sentence = (
    <>
      {/* With no "was" clause the "where" has nothing to land on, so the lead
          changes rather than the grammar breaking. */}
      <span className="connective">
        {who.length ? 'This is a story where ' : 'This is a story about '}
      </span>
      {who.map((clause, i) => (
        <span key={i}>
          {i > 0 && <span className="connective"> and </span>}
          {clause}
        </span>
      ))}
      {experienceTags.length > 0 && (
        <>
          <span className="connective">
            {who.length ? ' having an experience of ' : 'an experience of '}
          </span>
          <Answers tags={experienceTags} />
        </>
      )}
      <span className="connective">.</span>
    </>
  );

  return (
    <p
      className="voice text-[1.375rem] leading-[1.75] text-ink"
      aria-label={spoken}
    >
      <span aria-hidden>{sentence}</span>
    </p>
  );
}
