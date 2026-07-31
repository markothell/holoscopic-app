'use client';

import { useState } from 'react';
import TagDrawer, { TAGS_PER_SLOT_MAX } from './TagDrawer';
import type { Tag } from '@/lib/types';

// One question at the top of the compose sheet, answered by tapping words.
//
// This replaces the fill-in-the-blank sentence that used to BE the form. The
// sentence itself survives — it is still how a finished memory reads on its
// own page and on a wall card — but as an input it asked somebody to parse
// three clauses and a bare "＋" before they understood there was anything to
// do. Two direct questions, each with the words people actually used already
// sitting under it, skip all of that: the first thing you see is a question
// and some answers.
//
// The vocabulary arrives sorted by useCount (memories.js#listTags), so the few
// shown here are the most-used ones. That makes the form self-documenting —
// you can see what everyone else reached for without opening anything.

// Enough to show the shape of an answer and still fit two rows on a phone.
const SHOWN = 6;

const norm = (label: string) => label.trim().toLowerCase();

interface Props {
  /** The question, phrased directly — this is the heading, not a hint. */
  question: string;
  /** Most-used first. */
  vocabulary: Tag[];
  /** Selected LABELS, not ids — see memorialApiFor(…).create. */
  selected: string[];
  onChange: (labels: string[]) => void;
  allowCustom: boolean;
}

export default function TagQuestion({
  question, vocabulary, selected, onChange, allowCustom,
}: Props) {
  const [open, setOpen] = useState(false);

  // The top few, then anything already chosen from outside them. Appending
  // rather than sorting by selection keeps a chip where your thumb left it.
  const top = vocabulary.slice(0, SHOWN).map(t => t.label);
  const chips = [...top, ...selected.filter(l => !top.some(t => norm(t) === norm(l)))];

  const isSelected = (label: string) => selected.some(s => norm(s) === norm(label));
  const atCap = selected.length >= TAGS_PER_SLOT_MAX;

  function toggle(label: string) {
    if (isSelected(label)) onChange(selected.filter(s => norm(s) !== norm(label)));
    else if (!atCap) onChange([...selected, label]);
  }

  return (
    <div>
      <p className="voice text-[1.25rem] leading-snug text-ink">{question}</p>
      <p className="mt-1 text-[0.8125rem] text-ink-faint">
        {atCap
          ? `That's ${TAGS_PER_SLOT_MAX} — remove one to choose another.`
          : 'Choose as many as fit. Or none.'}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {chips.map(label => {
          const on = isSelected(label);
          return (
            <button
              key={label}
              type="button"
              onClick={() => toggle(label)}
              aria-pressed={on}
              disabled={!on && atCap}
              className={`rounded-full px-3.5 py-2 text-[0.9375rem] transition-colors
                          disabled:opacity-35
                          ${on
                            ? 'bg-dial text-card-raised'
                            : 'bg-card-raised text-ink border border-[var(--rule)]'}`}
            >
              {label}
            </button>
          );
        })}

        {/* Says what it opens. The old bare ＋ sat inside a sentence and read
            as punctuation — nobody could tell a list was behind it. */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-full border border-dashed border-dial px-3.5 py-2
                     text-[0.9375rem] text-dial"
        >
          ＋ {allowCustom ? 'More, or your own' : 'More words'}
        </button>
      </div>

      {open && (
        <TagDrawer
          open
          onClose={() => setOpen(false)}
          prompt={question}
          vocabulary={vocabulary}
          selected={selected}
          onChange={onChange}
          allowCustom={allowCustom}
        />
      )}
    </div>
  );
}
