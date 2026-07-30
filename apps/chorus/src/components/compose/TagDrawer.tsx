'use client';

import { useMemo, useState } from 'react';
import Sheet from '@/components/ui/Sheet';
import type { Tag } from '@/lib/types';

// The drawer behind one blank in the prompt.
//
// The search field IS the "add your own" field. Typing filters the existing
// vocabulary and, when nothing matches what you typed, offers to coin it —
// one control, because a separate "add a custom tag" button turns a two-second
// action into a decision about which control to use.
//
// The server's caps are enforced here too, on purpose. resolveTagLabels
// silently drops labels past the coin cap, which is the right server behavior
// (never fail a memory over a tag) and the wrong client behavior — somebody
// would type three new words, submit, and find one missing with no explanation.

export const TAGS_PER_SLOT_MAX = 5;
export const NEW_TAGS_PER_SLOT_MAX = 2;
const LABEL_MAX = 24;

function normalize(label: string) {
  return label.trim().toLowerCase().replace(/\s+/g, ' ');
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** The question this blank is answering, in the sharer's own terms. */
  prompt: string;
  vocabulary: Tag[];
  selected: string[];
  onChange: (labels: string[]) => void;
  allowCustom: boolean;
}

export default function TagDrawer({
  open, onClose, prompt, vocabulary, selected, onChange, allowCustom,
}: Props) {
  const [query, setQuery] = useState('');

  const known = useMemo(
    () => new Set(vocabulary.map(t => normalize(t.label))),
    [vocabulary],
  );

  // Words this sharer typed that don't exist yet. They live only in the draft
  // until submit, so they have to be shown alongside the real vocabulary or
  // they'd vanish from view the moment the drawer re-renders.
  const coined = selected.filter(label => !known.has(normalize(label)));

  const options = useMemo(() => {
    const q = normalize(query);
    const all = [
      ...coined.map(label => ({ id: `coined:${label}`, label, useCount: 0 })),
      ...vocabulary.map(t => ({ id: t.id, label: t.label, useCount: t.useCount })),
    ];
    if (!q) return all;
    return all.filter(o => normalize(o.label).includes(q));
  }, [vocabulary, coined, query]);

  const isSelected = (label: string) =>
    selected.some(s => normalize(s) === normalize(label));

  const atSlotCap = selected.length >= TAGS_PER_SLOT_MAX;
  const atCoinCap = coined.length >= NEW_TAGS_PER_SLOT_MAX;

  const typed = query.trim().slice(0, LABEL_MAX);
  const canCoin =
    allowCustom &&
    typed.length > 1 &&
    !options.some(o => normalize(o.label) === normalize(typed));

  function toggle(label: string) {
    if (isSelected(label)) {
      onChange(selected.filter(s => normalize(s) !== normalize(label)));
    } else if (!atSlotCap) {
      onChange([...selected, label]);
    }
  }

  function coin() {
    if (!canCoin || atSlotCap || atCoinCap) return;
    onChange([...selected, typed]);
    setQuery('');
  }

  return (
    <Sheet open={open} onClose={onClose} label={prompt} height="tall" z={50}>
      <div className="flex items-baseline justify-between px-5 pt-2 pb-3">
        <h2 className="voice text-[1.25rem] text-ink">{prompt}</h2>
        <button
          type="button"
          onClick={onClose}
          className="-mr-2 px-2 py-1 text-[0.9375rem] font-medium text-dial"
        >
          Done
        </button>
      </div>

      <div className="px-5 pb-3">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value.slice(0, LABEL_MAX))}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); coin(); }
          }}
          placeholder="Search, or type your own"
          enterKeyHint="done"
          autoCapitalize="none"
          className="w-full rounded-[3px] border border-[var(--rule-strong)] bg-card-raised
                     px-3.5 py-2.5 text-[1rem] text-ink outline-none
                     placeholder:text-ink-faint focus:border-dial"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
        {canCoin && (
          <button
            type="button"
            onClick={coin}
            disabled={atSlotCap || atCoinCap}
            className="mb-3 w-full rounded-[3px] border border-dashed border-dial px-3.5 py-2.5
                       text-left text-[0.9375rem] text-ink disabled:opacity-45"
          >
            <span className="text-dial">＋</span> Add “{typed}”
            {atCoinCap && (
              <span className="block text-[0.8125rem] text-ink-faint">
                You&apos;ve added {NEW_TAGS_PER_SLOT_MAX} new words here already — pick from the
                list, or swap one out.
              </span>
            )}
          </button>
        )}

        <div className="flex flex-wrap gap-2">
          {options.map(o => {
            const on = isSelected(o.label);
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => toggle(o.label)}
                aria-pressed={on}
                disabled={!on && atSlotCap}
                className={`rounded-full px-3.5 py-2 text-[0.9375rem] transition-colors
                            disabled:opacity-35
                            ${on
                              ? 'bg-dial text-card-raised'
                              : 'bg-card-raised text-ink border border-[var(--rule)]'}`}
              >
                {o.label}
              </button>
            );
          })}
        </div>

        {options.length === 0 && !canCoin && (
          <p className="py-8 text-center text-[0.9375rem] text-ink-faint">
            {allowCustom ? 'Type a word to add it.' : 'Nothing matches that.'}
          </p>
        )}
      </div>

      <div className="border-t border-rule px-5 py-3">
        <p className="text-[0.8125rem] text-ink-faint">
          {atSlotCap
            ? `That's ${TAGS_PER_SLOT_MAX} — remove one to choose another.`
            : 'Choose as many as fit. Or none.'}
        </p>
      </div>
    </Sheet>
  );
}
