# Threshold — the design conversation

Three surfaces were deliberately left undesigned in `PLAN.md` (§6.2, §6.3, §9.2). They are the
genuinely new mechanics, and specifying them inline would have been guessing. This is the
groundwork for that conversation: what is already decided and therefore constrains the design, then
the open questions, with my own position where I have one — so you can disagree with something
specific rather than start from nothing.

Nothing here is settled. The backend is built and none of it depends on how these look.

---

## Surface 1 — The ranking space

**Where it sits.** The rank phase. Everyone has shared; you have up to ~24 stories (12 people × 2
poles) and you must put every one on one side or the other, then submit once.

**Already fixed** (D11, D17, §6.2), so not up for discussion unless we reopen the decision:

- Two buckets, the seed's own pole words. No neutral, no skip.
- No ordering within a bucket. Position within a side carries no meaning.
- Sorting happens *while listening*, not from memory afterwards.
- Rearranging is free until an explicit final submit; an unplaced story blocks it.
- One thumb, on a phone.

### Q1. What is the primary gesture?

The obvious answer is drag-and-drop between two columns. I am suspicious of it: dragging 24 cards
on a phone while audio plays is fiddly, drag has poor accessibility, and it implies ordering matters
when it explicitly does not.

The alternatives worth weighing:

- **A queue with two buttons.** One story at a time, full width, playing. Two big targets: *this
  side* / *that side*. It advances. This is a card-sorting task, not a layout task — and it makes
  "sort while listening" literal rather than aspirational. Weakness: you lose the sense of the
  whole set, and revisiting means going back.
- **Two columns you tap into.** Tap a story, tap a side. Less fluid than drag, far more robust.
- **A slider per story.** Rejected — it reintroduces degrees, and the point is that the *group's*
  disagreement produces the gradient, not any individual's hedging.

**My lean: the queue, with a review screen before submit.** The queue does the sorting; the review
screen restores the whole-set view and is where rearranging actually happens. That maps exactly onto
the draft-then-submit model already in the data.

### Q2. How does "I have not finished" read?

The submit is deliberate and complete-or-nothing, so the surface must make an unfinished state
legible without nagging. A disabled button that never explains itself is the failure mode. Does the
review screen show gaps as *empty slots*, or as a count, or as the remaining stories queued up?

### Q3. Do you hear your own story in the queue?

You placed it by writing it. It is in the ranking (§5.2 — excluding it would make each ranker's
denominator different), but forcing someone to listen to themselves is odd. Skip it to the end?
Pre-place it on the side its author chose, and let them move it?

---

## Surface 2 — The per-cycle reveal

**Where it sits.** After everyone ranks. This is the payoff for one topic.

**Already fixed** (D15, §6.1): every share carries `agreement` (0–1) and `coherence`. No band
classification is stored. Any grouping is a render-time choice, so this design can change without a
migration.

### Q4. Is it a spectrum, or three groups?

Your instinct was gradation, and the data supports it — a continuous axis from one pole to the
other, every story placed by `agreement`, the contested ones falling in the middle by construction.

The tension: a pure gradient is beautiful and slightly unreadable. "Which stories split us?" is the
question the activity asks, and a gradient answers it only if you squint. Three visually distinct
zones answer it immediately but throw away the difference between 12/12 and 9/12 — which is exactly
what you said you wanted to see.

**My lean: a continuous axis with soft zone shading behind it.** Position is exact and continuous;
the shading is a reading aid, not a classification. The 100%-agreement stories sit hard at the ends
and that is visible without a label.

### Q5. What does one story look like at rest?

Every story is a card you can play. But 24 cards is a long page, and the shape of the whole
distribution is the point. Does the reveal open as *marks* (dots/bars positioned by agreement) that
expand into playable cards on tap? Or as a list, ordered by agreement, where position is conveyed by
a bar rather than by layout?

The first shows the distribution. The second shows the stories. I do not think you can have both at
full strength on a phone, and choosing which one leads is the real decision here.

### Q6. How is the threshold itself named?

The contested middle is the product. Does it get a label, a boundary line, a count ("4 of 11 stories
split the group")? Naming it makes it legible; drawing a hard line around it contradicts D15's
whole reason for existing.

Note the copy constraint: user-facing copy says what a thing **is**, never "not a…". So the middle
band cannot be described as "stories with no agreement" — it is where the group's line falls.

### Q7. What happens with a tiny group?

`rankers: 1` makes every story unanimous by construction, and the reveal should suppress the
coherence framing entirely (§6.1). What does it show instead — just the sort? And at 2–3 rankers,
`agreement` only takes 3–4 distinct values, so a continuous axis will look banded whether or not we
intend it.

---

## Surface 3 — The circle-final graph

**Where it sits.** The end of a Sharing Circle. All N topics together. This is the payoff screen for
the whole layer.

`circleResult()` currently hands the client, per topic: the topic and its two poles, `rankers`,
`shareCount`, `unanimous`, `meanCoherence`, and which topic was `mostContested`.

### Q8. Does a topic reduce to one number, or keep its shape?

One number per topic (`meanCoherence`) makes a clean comparable chart — twelve topics ranked by how
much they split the group. Keeping each topic's gradient is truer but risks twelve small
unreadable strips.

This is Q1 from `PLAN.md` §13, and it is the last thing that needs deciding before the final screen
can be built.

### Q9. Is the final screen about the group, or about the topics?

"Authority splits us more than money does" is a fact about the group. "Here are 36 stories" is an
archive. Both are legitimate endings, and they are different screens. The Sharing Circle's premise
suggests the first, but the stories are what people actually made.

---

## Surface 4 — Visual language

Threshold gets its own hand-styled system, like Chorus, Synthesis and On a Spectrum (§9.2). Nothing
is decided.

### Q10. What is the visual thesis?

Chorus is "eau de nil & dial light" — mid-century domestic paintwork, amber as the glow of a radio
dial, which is also literally what a recorded memory is. On a Spectrum is paper/ink editorial. Each
has one sentence that decides everything downstream.

Threshold's subject is a **dividing line that turns out to be a blurred band**. Some starting
directions:

- **Survey/instrument** — the line as something measured. Rules, ticks, careful type. Risks feeling
  clinical about people's stories.
- **Tide line** — the mark left where two things meet and neither wins. Softer, and honest that the
  boundary moves.
- **Two lights** — the poles as sources, each story lit more by one than the other, the contested
  ones caught between. Ties directly to the gradient.

### Q11. How do the two poles get their identity?

Every seed names its own poles ("Liberating / Constricting"). They need to be visually distinct and
*symmetrical* — neither can look like the good one. That rules out the obvious warm/cool or
green/red pairings, which carry a verdict. Two colours of equal weight and opposite hue, decided
once and reused for every topic in a circle?

---

## The one thing I would decide first

**Q1 (the ranking gesture)**, because it is the surface people spend the most time in, and because
the reveal is a picture of what the ranking produced — if the ranking task changes shape, the reveal
does too. Everything else can follow from it.
