# interView — UX/UI Refinement Plan for Live Action

*Drafted June 2026. Scope: `apps/holoscopic-game`, centered on `/interview` and every surface a live player touches. Plan only — no code changes yet.*

---

## 1. Where the app is today

The bones are good. The hub (`/interview`) has a clear three-concept model (Topics / Frames / Patterns), a distinctive radial-graph canvas, a consistent warm-dark palette, and the holon economy is wired through. What's missing for live action falls into five buckets:

1. **Orientation** — a new player landing on `/interview` gets no explanation of what they're looking at, what the three tabs mean, what holons are, or what to do first. The only explanation lives on `/rules`, which is not linked from the hub at all.
2. **Flow gaps** — confirmed topics disappear from the hub, the browse↔drill transition is abrupt and partly broken, dead ends exist (empty drills, full activities), and the economy gating in the popup isn't actually wired.
3. **Legibility** — the type scale runs 0.45–0.6rem across the entire hub. It reads as texture, not text. This is the single biggest "pleasing to use" blocker.
4. **Identity inconsistency** — the app is called interView on the hub and Holoscopic everywhere else; the funnel alternates light-editorial and dark-game themes with no deliberate bridge; navigation differs on every page.
5. **Live-ops readiness** — no real-time updates on the hub, `alert()` for errors, no feedback when holons move, no legend, no mobile-safe popup.

---

## 2. North star

> A new player should get from "what is this?" to placing their first dot on a map in under three minutes, and at every step understand (a) where they are, (b) what it costs, and (c) what happens next.

The radial graph is the identity of the game — keep it as the centerpiece. Everything else (sidebar, popups, forms) should recede into a quiet instrument panel around it.

---

## 3. Information architecture & naming

### 3.1 One name, one nav
- **Decide the brand relationship**: recommended — *Holoscopic* is the project/studio, *interView* is the game. Home page and essays keep the editorial Holoscopic identity; everything inside the game (`/interview`, create flows, activity pages, rules, login when arriving from the game) carries the interView wordmark with a small "by Holoscopic" attribution.
- **Single game nav**: a persistent slim top strip (or sidebar header block) inside the game with: wordmark → `/interview`, **How to play** → `/rules`, holon balance, notifications, user menu. Today: the hub has no link to rules; rules has a legacy nav (Play/Topics/Rules → old `/topics` page); create/pattern uses the Holoscopic header. Unify all of them.
- **Retire legacy vocabulary in the UI**: `sequence` nodes are labeled "PATTERN" in the graph but link to `/sequence/...`; rules nav links to `/topics`; notifications deep-link to `/inquiry/...` (deprecated). Audit every user-visible string and link for the Topic/Frame/Pattern vocabulary (per the redesign decision: never "Algorithm", never "Inquiry").

### 3.2 Topic lifecycle must be visible
- The hub fetches only `status=nominated` topics, so **a topic that reaches quorum vanishes** from the place players were watching it. Show both states: group or badge the list ("Seeking support" / "Confirmed — open for maps"), and let confirmed topics be the natural place to find joinable activities.
- Add the time dimension: nominated topics expire — show a countdown ("expires in 14h") on list items and in the popup. Urgency is a core game mechanic and is currently invisible.

---

## 4. The hub: browse → drill → act

### 4.1 Clarify the two-mode model
The list and the graph currently do the same thing (click → drill), which makes the graph feel decorative. Give each a distinct job:

- **List = index.** Scan, search, sort. Clicking a list item selects it (highlights its node and pans to it) — it should not instantly tear down the whole graph.
- **Graph = territory.** Browse mode shows the constellation; clicking a node opens its **popup card first** (info + actions + "Explore →"), and *Explore* enters drill mode. Today a browse-click drills immediately, so players can never read about an item without losing the overview.
- **Drill mode** keeps a visible breadcrumb: `Topics ▸ "How do we decide together?"` at top-left of the canvas, replacing the easy-to-miss pill at bottom-center. The pill also competes for space with the popup on mobile.
- Fix the broken seams found in code review (during implementation):
  - `drill-hub` back-node is referenced in the click handler but never created (dead code — either add the back-node or remove the branch).
  - Changing **Sort** reorders the list but never rebuilds the browse graph (effect doesn't depend on `sortOrder`).
  - `PopupCard` declares `holonBalance`/`holonsConfig` props but the call site never passes them — so affordability gating silently always passes. Wire it to `useInstance().config.holons` and `useAuth().holonBalance`.

### 4.2 Motion: make transitions legible
- Animate browse→drill: the clicked node should glide to center while siblings fade out and children fade/spiral in (ReactFlow supports animated position updates). The current teardown-and-refit reads as a page reload, not navigation.
- Hover states on nodes (slight scale + border brighten + edge highlight). Today nodes give zero hover feedback.
- Hub/center nodes: a slow ambient pulse on the glow sells "alive system" cheaply.
- Keep `fitView` only on mode change, not on every data refresh — don't yank the camera away from where the player panned.

### 4.3 Graph readability
- **Legend / color key**: topic = red, frame = gold, pattern = blue, sequence = green is good color language but never stated. Add a small dismissible legend chip row at bottom-left of the canvas (also doubles as a filter later).
- Raise browse edge opacity (0.12 → ~0.25) and consider very slight curvature; currently the constellation barely reads as connected.
- **Truncation honesty**: browse shows only the top 20 (`BROWSE_MAX`) with no indication. Add an outer "+N more" node or ring label that focuses the sidebar list.
- Node sizing by signal: scale topic nodes subtly with supporter count / pool size — makes the map mean something at a glance.
- Show open-slots state directly on activity nodes (small `2/4` chip), not only in the popup.

### 4.4 Popup card → action panel
- One consistent anatomy for all node types: type label · title · 1–2 line description · stats row · **cost-labeled actions** (see §6) · Explore/Enter.
- Replace `alert(e.message)` with inline error text in the card and a global toast system.
- Empty drill states need CTAs *on the canvas*: a topic with no maps should show a ghost node "＋ Start the first map (◈5)" instead of a lonely center dot. Same for frames with no usage and patterns with no activities.
- Full activities: popup shows "Full" + "New map" — good instinct; also show *who's in it* (avatars/initials) and whether results are viewable, so "Full" isn't a dead end.
- Mobile: popup becomes a **bottom sheet** (fixed 290px right-anchored card will overflow narrow screens and collides with the drill pill).

---

## 5. Onboarding & first-run

This is the largest gap for live action. Proposed, in order of impact:

1. **First-visit overlay on `/interview`** (3 short panels, skippable, stored in localStorage):
   - "This is a map of what this group is exploring" (the graph)
   - "Topics → Frames → Patterns" (the three tabs, one line each)
   - "You have ◈100 holons — spend them to signal, earn them by contributing" → CTA: *Find a map to join*.
2. **Signed-out state**: the hub works logged out but offers no path in. Add a sidebar-footer CTA: "Sign in to play — start with ◈100". The login/signup pages should match the game theme when arriving from the game (`callbackUrl`-aware, or just restyle to dark) — today a player goes dark → bright cream → dark, which feels like leaving the app.
3. **Empty-instance defaults**: a brand-new instance shows "No topics yet" with nothing to do. Seed every instance with 2–3 starter frames and one example topic, and make the empty state itself a CTA ("Nominate the first topic — ◈10").
4. **`/rules` becomes "How to play"** — linked from the hub header, restructured top-down: ① join a map (the 80% case), ② support/nominate topics, ③ frames, ④ patterns, with the economy table last as reference. Current page leads with economy mechanics before a player has ever seen a map.
5. **Glossary affordance**: dotted-underline terms (holon, frame, stake, quorum) with tap/hover tooltips, reused across hub, popups, and create forms.

---

## 6. Make the economy legible

The holon economy is the game's engine but is currently almost invisible:

- **Costs on buttons, always**: `Support · ◈5`, `Nominate · ◈10`, `Start a map · ◈5 stake`. Disabled states say why: "Need ◈5 — you have ◈3" (not just a 45%-opacity button with a title-attribute tooltip nobody finds).
- **Transaction feedback**: every earn/spend fires a toast ("◈5 staked on *Trust under pressure* — returned or attributed when it closes") and the balance counter animates. Silent `refreshBalance()` means players never form a model of the economy.
- **Balance placement**: move from the tiny sidebar footer into the persistent header, with a click-through to a transaction history (dashboard already exists as a home for this).
- **Stake mental model at the moment of join**: the activity preamble modal should say "Joining stakes ◈5 — you direct it by voting; the rest returns when the map closes." Currently the stake happens with zero explanation at the point it happens.

---

## 7. Create flows

- **Topic nomination (sidebar form)**: show the ◈10 cost and the quorum rule inline ("needs 5 supporters in 24h, or your ◈10 returns"). After creation, the new node should appear highlighted/pulsing in the graph — right now the form just closes and the player has to find it.
- **New Map (`/create/activity`)**: solid form, three fixes:
  - "Dissolve / Resolve" are unexplained jargon — add a one-line description under the toggle (e.g., *Dissolve: each axis is its own question — map the tension. Resolve: one question, find the center.*) and a tiny axis-preview that updates live as labels are typed (reuse the preamble-modal axis visual).
  - "Participant slots: 2 / 4" — say what it means ("how many people can join this map").
  - Show "Creating costs ◈5 stake" near the submit button.
- **Frame creation (sidebar form)**: fine as a quick-add; add one line of purpose ("A reusable pair of axes — earn ◈5 each time someone maps with it") so creating a frame feels like a move in the game rather than data entry.
- **Publish Pattern**: works but is the old Holoscopic-header world, depends on pre-existing sequences via a separate admin-ish page, and costs ◈150 with the cost buried in small print. Acceptable to leave rough for launch (it's an advanced/late-game action) but restyle the header and surface the cost prominently. Fix typo "to publish an pattern".

---

## 8. The map itself (activity page)

The gameplay surface (`/[activityName]`, `ActivityPageModal`, `PreambleModal`, `EntryModal`) is the payoff of every funnel — a focused pass:

- **Preamble modal**: visually heavier/different typography (Barlow uppercase, Tailwind utility styling) than the hub's instrument-panel language — harmonize fonts and surface styles with the hub tokens. Add the stake explanation (§6) and a "back to interView" escape hatch.
- **Anonymous flow**: anonymous visitors get auto-generated `User1234` identities and can interact — decide deliberately for live action whether anon play is allowed; if yes, label it and prompt account-claim after first entry; if no, gate with the sign-in CTA.
- After submitting an entry, the moment of *seeing yourself appear on the shared map* is the core delight — make sure it's celebrated (brief highlight ring on your dot) rather than a silent reload.
- Verify the return path: map page → back to hub drill view of its topic (breadcrumb), so the world model stays continuous.

---

## 9. Visual system

### 9.1 Type scale (the big one)
Establish a real scale and apply it everywhere in the game. Current hub text is 0.45–0.75rem; WCAG and plain comfort want body ≥ 0.8rem.

| Role | Now | Proposed |
|---|---|---|
| Micro-labels (eyebrows, type tags) | 0.45–0.52rem | 0.65rem, mono, tracked |
| List items / node titles | 0.6–0.75rem | 0.8–0.85rem |
| Body / descriptions | 0.75rem | 0.9rem |
| Card titles | 0.9rem | 1rem |

Define these as CSS vars (`--text-xs` … `--text-lg`) in `globals.css` next to the color tokens so every page draws from one scale.

### 9.2 Tokens & components
- Promote the inline-style patterns that repeat across pages (btn fill/outline, input, label, card, popup) into a small shared component set — the hub, create pages, and rules each re-declare them with drift.
- Add the node colors to tokens (`--node-frame: #C0A45E`, `--node-pattern: #5E90C0`, `--node-sequence`) instead of hard-coded hex in three files.
- Fix off-theme stragglers: notifications dropdown is light-cream on the dark hub; ReactFlow controls CSS override targets a light theme; home-page SVGs use the old navy `#1A1F2E` panel color.
- Focus states and keyboard access: visible focus rings on list items/buttons, Esc closes popup/forms, aria-labels on icon buttons. Status conveyed by color (emerald/red) needs a text or shape companion.

### 9.3 Microcopy voice
Pick one register — the mono-caps instrument voice is distinctive; pair it with warm sentence-case body copy. Sweep for placeholder-grade strings ("No topics yet", "loading…", "mapping…" is good — keep that one).

---

## 10. Mobile

- Sidebar overlay works; add swipe-to-close and make the hamburger a labeled "Index" button.
- Popup → bottom sheet (§4.4); drill breadcrumb to top so nothing collides.
- Graph touch: verify pinch-zoom and tap targets (130px nodes are fine; the 20px "+" create button is too small).
- Creation forms in a 272px sidebar on mobile are cramped — open them as full-screen sheets.
- Test the entry modal (slider + comment) at 320–375px; it's the most important mobile surface in live play.

## 11. Live-ops readiness

- **Real-time hub**: the hub is poll-on-action only — during a live session, supporter counts, new topics, and slots filling won't appear until manual refresh. Subscribe the hub to socket events (or a cheap 30s poll for launch) so the constellation visibly *moves* while the group plays. This is also the demo magic.
- **Connection status**: surface the existing `ConnectionStatus` component on game surfaces.
- **Error & loading**: toast system (replaces `alert`), skeleton nodes/list rows instead of bare "loading…", and a friendly failure state if the API is down ("the field is unreachable — retrying").
- **Facilitator checklist** (pre-launch QA pass, not features): seed content per instance, confirm quorum/expiry timings for a session-length game, verify holon config values on the instance, test the full loop with 4 real accounts on phones.

---

## 12. Suggested phasing

**Phase 1 — Legibility & wiring (foundation)**
Type scale + tokens; unified game header/nav with rules link and balance; fix hub seams (sort↔graph, popup props, dead drill-hub code, confirmed-topics visibility); costs on buttons; toast system replacing alert.

**Phase 2 — Flow & orientation**
Browse-click → popup-first; drill breadcrumb + animated transition; empty-state CTAs on canvas; first-visit overlay; signed-out CTA; rules page restructure; topic countdowns.

**Phase 3 — Polish & live feel**
Real-time hub updates; node hover/pulse motion; legend; node sizing by signal; mobile bottom sheet + form sheets; entry-celebration moment; preamble/entry modal restyle; login/signup theming.

**Phase 4 — Later / post-launch**
Search in lists; transaction history view; pattern flow rework; "+N more" overflow ring; anonymous-play decision implementation; graph filters from legend.

Phases 1–2 are the bar for a comfortable live session; Phase 3 is what makes it *pleasing*.
