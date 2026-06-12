# interView — UX/UI Refinement Plan for Live Action (v3)

*Revised June 2026 after feedback review. Scope: `apps/holoscopic-game`, centered on the interView game. Plan only — implementation follows the phasing in §13.*

**Context locked in:**
- **Holoscopic** = the company/platform — the broader voice on social technologies, mapping activities, and collective knowledge generation. The project homepage stays Holoscopic.
- **interView** = a short-run game built on Holoscopic's mapping tools, adding the holon economy. Designed in part for a Mozilla Festival application — live multi-day mapping games run on this code. A first edition runs on the site as a long-term active demo space.
- Multiple games are expected long-term, each with its own language, generated on top of the universal Holoscopic platform.

---

## 1. North star

> A new player should get from "what is this?" to placing their first dot on a map in under three minutes, and at every step understand (a) where they are, (b) what it costs, and (c) what happens next.

The radial graph is the identity of the game — the centerpiece. Everything else (index list, popups, forms) recedes into a quiet instrument panel around it.

**Second principle: simple and fast beats fancy and lagging.** Practical rules for every item in this plan:
- Hover/focus/transition effects are CSS-only — no JS animation loops, no choreographed node glides. Mode changes get a single ~200ms fade, nothing more.
- The browse graph stays capped at 20 nodes (paging keeps render cost bounded); node components memoized so the canvas only rebuilds on mode/data change.
- Polling pauses when the tab is hidden; refetch-on-focus does most of the work.
- No decorative animation (already decided: no pulsing). The grain texture, if kept on game pages, is one static overlay.
- When a fancy version and a plain version are both on the table, ship the plain version and revisit only if the live game proves the need.

---

## 2. Site-wide light theme unification ★ NEW DIRECTION

The dark hub theme is retired. The warm-light editorial style of the homepage / dashboard / create panels (`--warm-bg #F7F4EF`, `--warm-ink`, grain texture, Cormorant + DM Mono pairing) becomes the system for the whole site, including:

- The interView landing page, hub/graph pages, and create flows
- **The activity pages** (`ActivityPageModal`, `PreambleModal`, `EntryModal`, results views) — these get a dedicated visual pass into the same schema
- Login/signup already match — keep
- UserMenu/notifications dropdown already light — now it will finally sit on a matching surface

Work items:
1. Define the full light token set in `globals.css` (`--bg`, `--surface`, `--ink`, `--ink-light`, `--rule`, accent unchanged `#C83B50`) and a type-scale token set (§10). Deprecate the dark tokens once all surfaces migrate.
2. Re-derive graph styling for light ground: node fills become paper-card surfaces with colored borders/accents; edges in warm gray (`#D9D4CC`-family); the dot-grid background in low-contrast warm ink. Node category colors (topic red, frame gold, pattern blue) need darkened variants for contrast on cream.
3. ReactFlow controls override in globals.css already targets light — verify it works once the canvas flips.
4. Sweep the shared `@hs/activities` components (MappingGrid, CommentSection, ResultsView) for hard-coded dark hex values.

---

## 3. Information architecture & URLs

### 3.1 The interView landing page ★ NEW
A new landing page — where people arrive when they click the interView concept from the Holoscopic homepage:

- **Title** (interView wordmark) + **descriptive headline** (one sentence: what the game is)
- **Big stacked vertical links**: Topics · Frames · Patterns · Rules
- Each big link leads to its map view (the hub opened to that tab); Rules leads to the how-to-play page
- The **first and prominent Rules link lives here** and at the top of each map view — not buried

The Holoscopic homepage gets a short section making the differentiation clear: interView is a distinct interactive game space (live, join now), versus the essays/manifesto/platform material.

### 3.2 Game-numbered URL structure ★ NEW
Editions are preserved as stable spaces. Proposed structure:

```
/interview                     → landing page (current edition)
/interview/g1/topics           → edition 1, topics map
/interview/g1/frames           → edition 1, frames map
/interview/g1/patterns         → edition 1, patterns map
/interview/g1/rules            → edition 1 rules (config values frozen per edition)
```

- `gameNumber` already exists on the Instance model — the route segment binds to it.
- **Build only the URL structure now** (a route segment is cheap and keeps future links stable). The read-only archive machinery — edition lists, frozen rules pages, archive mode — is deferred until a second edition actually exists. Don't build platform features ahead of validation.
- `/interview` always points at the current/active edition.

### 3.3 One unified game nav
A persistent slim header inside the game: interView wordmark → landing, tab links (Topics / Frames / Patterns), **How to play**, holon balance, notifications, user menu. Replaces the three different headers currently in play (hub sidebar header, rules' legacy Play/Topics/Rules nav, create/pattern's Holoscopic header).

### 3.4 Vocabulary: one constants file, not a platform system
Decision: **Sequence** stays as the platform-level concept; **Pattern** is interView's word for it. The generalized per-`gameType` lexicon system is **deferred** — it's platform prep ahead of validation.

The minimal version costs nothing and gives 90% of the benefit: a single `strings.ts` constants module in the game app (`PATTERN = 'Pattern'`, `HOLON_SYMBOL = '◈'`, etc.) that UI text draws from. It's actually *simpler* than today's scattered hardcoded strings — one place to change a word — and if a second game ever ships, it's the obvious seam to generalize at. No new abstraction, no indirection in routes or models.

**Legacy pages: delete, don't reroute.** The game has never run, so there's nothing to preserve. Remove the old `/topics`, `/inquiry`, `/algorithms` tab pages and their redirects outright; fix the handful of internal references (rules nav, notification deep-links, "algorithm" strings) to point at the new structure. Less code, less to test.

### 3.5 Topic lifecycle visibility
- Hub currently fetches only `status=nominated` — **confirmed topics vanish on quorum**. Fetch both; differentiate visually: "Seeking support" (with supporter progress, e.g., 3/5) vs "Confirmed — open for maps" (badge, slightly stronger node treatment).
- Expiry countdown on nominated topics ("expires in 14h") in list items and popups — urgency is a core mechanic and currently invisible.

---

## 4. The hub: browse → drill → act

### 4.1 Interaction model — one click to info
- **List = index**: scan, search, sort. Clicking a list item selects + pans to its node (does not tear down the graph).
- **Graph = territory**: in browse mode, a **single click on any node opens its popup immediately** (info, stats, cost-labeled actions, and an **Explore →** button). Explore enters drill mode. This *removes* the current laborious path (click → drill → click center → popup); nothing requires two clicks anymore.
- **Drill mode**: breadcrumb at top-left of canvas (`Topics ▸ "How do we decide together?"`) replaces the bottom-center pill; breadcrumb root click returns to browse. In drill, clicking child nodes opens their popups (unchanged).
- Camera: `fitView` only on mode change, never on data refresh — don't yank the view.

### 4.2 Sort vs. graph layout — intentional, decoupled
Decision: sorting reorders the **list only**. The graph keeps one canonical, *stated* layout so it reads as structured rather than randomly ordered:

- Canonical placement rule: newest at 12 o'clock, clockwise by age (a clock the player can learn).
- Signal carried by **size, not position**: node radius scales with supporter count / pool / member count (§4.3).
- A small caption chip on the canvas states the rule: `20 of 34 · newest from top, sized by support` — the order is legible instead of hidden.
- If a chosen sort would surface items outside the visible 20, the list paging (§4.3) is how you reach them.

### 4.3 Graph readability
- **Legend chip row** (bottom-left, dismissible): topic ● red · frame ● gold · pattern ● blue · map ● accent — doubles as a filter later.
- **See-all + paging** ★: browse caps at 20 nodes with no indication today. Add: (a) the caption chip with true counts, (b) a "＋14 more" outer node / control that pages the graph to the next ring of 20, (c) "See all" affordance that focuses the full list in the index panel. List itself gets pagination or infinite scroll if instances grow.
- **Node sizing by signal**: implement — topics by supporters/pool, frames by usage count, patterns by members.
- **Open-slots chip on map (activity) nodes**: *clarification — this is activity capacity, not quorum.* Each map has 2 or 4 participant slots (`maxEntries`); the node shows `3/4` directly so players can spot joinable maps from the territory view without opening popups. Full maps show `4/4` in muted style — still clickable to view the finished conversation.
- Edge opacity up (~0.25) with slight curvature.
- Hover states: slight scale + border brighten + connected-edge highlight. (No ambient pulsing — decided against.)
- **Frame focus = grid preview** ★: when a frame is centered in drill mode, the center node renders as a mini 2D grid with the axes labeled (poles at the edges) instead of a text circle — the frame *is* its geometry, show it.

### 4.4 Popup card → action panel
- One consistent anatomy for all node types: type label · title · 1–2 line description · stats row · cost-labeled actions · Explore/Enter.
- **Status: economy gating is now wired** (verified: popup receives `holonBalance` + instance holon config; `AuthContext` pushes live `holon_update` over its socket). Remaining polish: costs printed on the buttons themselves (`Support · ◈5`), and disabled states that say why ("Need ◈5 — you have ◈3") instead of opacity + a hover tooltip.
- Replace `alert(e.message)` with inline error text in the card + a global toast system. (*This refers to the current behavior where a failed action — e.g., insufficient holons — triggers a browser `alert()` dialog box. It becomes a styled inline message.*)
- **Empty drill states** (*clarification: a "drill" is the focused view of one item; "empty" means it has no children yet — e.g., a topic with no maps started, a frame nobody has used, a pattern with no activities*). Instead of a lone center node, show a ghost node CTA on the canvas: "＋ Start the first map (◈5)".
- **Full activities** (*clarification: a map whose participant slots are all taken*). Not a dead end — the popup shows who's in it, links to view the finished/ongoing conversation, and offers "New map from this" so past conversations visibly seed new ones.
- Mobile: popup becomes a bottom sheet.

---

## 5. Onboarding & first-run

1. **First-visit overlay** (3 short skippable panels, localStorage-gated): the map metaphor → the three tabs → "you have ◈100, spend to signal, earn by contributing" → *Find a map to join*.
2. **Signed-out CTA**: "Sign in to play — start with ◈100" in the hub.
3. **Empty-instance seeding + demo items**: new editions seed 2–3 starter frames and an example topic so the graph shows players what they'll be creating; empty states are themselves CTAs ("Nominate the first topic — ◈10").
4. **Rules → "How to play"**: engaging and very simple, on the landing page and per-edition. Ordered by what players do: ① join a map, ② support/nominate topics, ③ frames, ④ patterns; economy table last as reference. (User will revisit content; make the structural change first.)
5. **Glossary affordance**: dotted-underline terms (holon, frame, stake, quorum) with tap/hover tooltips, shared across hub, popups, and forms.
6. **Guidance every step of the way**: each panel/form/popup carries one line of "what this is / what it costs / what happens next," so the game is playable without ever reading the rules in full.

---

## 6. Make the economy legible

- Costs on buttons, always: `Support · ◈5`, `Nominate · ◈10`, `Start a map · ◈5 stake`.
- Disabled states say why: "Need ◈5 — you have ◈3."
- **Transaction feedback**: toast on every earn/spend ("◈5 staked on *Trust under pressure* — returned or attributed at close") + animated balance counter. The live socket push (`holon_update`) already exists — the toast layer hooks into it.
- Balance in the persistent header, click-through to transaction history.
- Stake explanation at the moment of joining a map (in the preamble): "Joining stakes ◈5 — you direct it by voting; the rest returns when the map closes."

---

## 7. Create flows

### 7.1 Topic nomination (sidebar form)
Show the ◈10 cost and quorum rule inline ("needs 5 supporters in 24h, or your ◈10 returns"). After creation, the new node appears highlighted in the graph.

### 7.2 New Map — frames become visual and searchable ★
- **Frame picker with type-ahead**: as you type axis labels, search existing frames (`/frame-refs` search) and offer click-to-apply. Using an existing frame pre-fills the axes, links `frameId`, and routes the `frame_use_reward` to its creator — discovery and royalties in one gesture.
- **Live axis grid preview**: a small labeled 2D grid next to the form that updates as labels/poles are typed (same component as the frame-focus preview in §4.3 — build once, use in graph, create flow, and preamble).
- Explain the jargon: one-liners under the Dissolve/Resolve toggle; "Participant slots" labeled as "how many people can join this map"; "Creating costs ◈5 stake" by the submit button.

### 7.3 Frame creation (sidebar)
Keep the quick-add. One line of purpose: "A reusable pair of axes — earn ◈5 each time someone maps with it."

### 7.4 Pattern builder — visual-first redesign ★ NEW (own workstream)
Replace the text form + sequence dropdown with a **directed-graph canvas as the center of the build experience**:

- **Pick activities visually**: add an activity and it appears as a node in the flow preview; drag/connect to order the sequence.
- **Search the existing map**: find mapping activities used elsewhere in the game and select them — this **clones** the activity into your pattern build (lineage preserved → fork royalties flow to original creators automatically). This makes forking the easy default path for newcomers, not an advanced feature.
- **Attach frames by clicking**: select a frame and the node picks up its axes detail; the grid preview component (§7.2) renders inside/beside the node.
- **Edit in place**: click a node → side panel for finer details (questions, slots), return to the graph.
- Text fields (title, thesis, description) come after the visual structure, not before. Publish cost (◈150) stated prominently.
- Fix en route: "an pattern" typo; Holoscopic header → unified game nav.

---

## 8. The map itself (activity pages)

- Bring `PreambleModal` / `EntryModal` / activity layout into the unified light theme and type scale (§2, §10) — included in the same visual schema as everything else.
- Add the stake explanation to the preamble (§6) and a "back to interView" escape route (breadcrumb to the topic's drill view so the world model stays continuous).
- **Anonymous flow — decided**: anonymous visitors can *browse everything* (maps, graphs, conversations — exploration is the funnel), but **participation requires an account**. The economy is meaningless without continuity for individuals. Remove the auto-generated `User1234` participation path; any join/entry/vote/support action by a signed-out visitor prompts sign-in ("Sign in to play — start with ◈100") and returns them to where they were.
- Celebrate the entry moment: a brief highlight ring on your dot when it lands on the shared map, instead of a silent reload.
- **Deduplicate the join language** (noted June 12): the hub popup now says "Open map →" and only the activity page invites joining — but the preamble modal's join flow itself should be reviewed in this pass so the stake moment, the join button, and the entry modal read as one continuous gesture rather than two separate invitations.

---

## 9. Live updates

- **Already live**: holon balance and notifications push over the per-user socket (`holon_update`, `notification_new`).
- **Hub data** (supporter counts, new topics, slots filling): recommended for launch — **refetch on window focus + a 30–60s interval poll** while the hub is visible. Payloads are small (the same three list calls); pause the timer when the tab is hidden. This keeps it smooth and cheap with zero new backend work.
- Later, if live sessions want sub-30s feel: broadcast lightweight `topic_updated` / `activity_updated` events to an instance-wide room and patch state in place — incremental upgrade, same UI.
- **Connection status: dropped.** It's an async game; no indicator needed.
- Error & loading: toast system replaces `alert()`; skeleton rows/nodes instead of bare "loading…"; friendly retry state if the API is unreachable.

---

## 10. Visual system

### 10.1 Type scale
| Role | Now | Proposed |
|---|---|---|
| Micro-labels (eyebrows, type tags) | 0.45–0.52rem | 0.65rem mono, tracked |
| List items / node titles | 0.6–0.75rem | 0.8–0.85rem |
| Body / descriptions | 0.75rem | 0.9rem |
| Card titles | 0.9rem | 1rem |

Defined as CSS vars next to the color tokens; every surface draws from the one scale.

### 10.2 Tokens & components
- Promote repeated inline-style patterns (btn fill/outline, input, label, card, popup, sheet) into a small shared component set — hub, create pages, and rules each re-declare them with drift.
- Node category colors as tokens with light-theme variants.
- Focus states, Esc-to-close, aria-labels on icon buttons; status conveyed by color gets a text/shape companion.
- Microcopy voice: mono-caps instrument labels + warm sentence-case body, swept consistently.

---

## 11. Live-action essentials (gaps outside the UX discussion)

Things that aren't visual/flow work but must be true before real people play with a real economy:

1. **Identity spoofing — the big one.** The backend trusts the `x-user-id` header with no verification on regular endpoints (only admin routes check the database). With a live economy, anyone with curl can spend another player's holons, vote as them, or drain stakes. Before live action, spend/earn/vote routes must verify the NextAuth session server-side (validate the JWT and derive the userId from it, not from a client-supplied header). This is the highest-priority non-UX item in the plan.
2. **Map close & settlement — the designed rule.** Modeled on Stack Overflow, whose **bounty system** is the closest live analogue to the interView stake: escrowed points, a fixed window, votes direct the award, automatic settlement at expiry with a fallback. (SO's *continuous* reputation transfer doesn't fit — interView intentionally allows free cast/retract until close, and instant transfer would require clawbacks. Escrow + window is right.)

   **The rule — one structure, two parameterizations.** A map settles at the *earliest* of:
   1. **Complete** — all slots filled AND every participant has entered and voted. Nothing left to wait for; settle immediately. (Fast tables reward themselves.)
   2. **Window expiry** — `activityWindowHours` after creation (*decided: timer starts at creation, not at fill*). Bounds every map's lifetime; no zombie maps holding escrow forever. A participant who never voted simply gets their full stake back — neutral, no penalty.
   3. **Edition end** — everything force-settles.

   Settlement itself stays as designed (voted portions flow to comment authors, unvoted returns), but becomes a **visible event**: notification + toast with the breakdown ("Map closed — ◈7 received from 3 votes, ◈2 returned").

   **Festival (3-day) parameterization:** `activityWindowHours: 24` — a daily market-close rhythm. Maps born in the morning settle by evening; each festival day ends with settlements landing and the leaderboard moving. That cadence makes the economy legible as a shared moment, not a background process. Topic quorum windows compress to match (already per-instance config).

   **Ongoing async parameterization:** `activityWindowHours: 168` (7 days — SO's bounty window). Slow tables still resolve weekly; complete tables settle the moment they finish.

   Both live in the existing per-instance config — no new machinery, just one new config key plus the rule. Implementation note: the backend has no background jobs by design — follow the established quorum pattern and sweep expired maps on read. Countdown chips on map nodes/pages ("settles in 6h") pair with the topic countdowns.

   **SO's deeper lesson — reputation ≠ currency.** Rank players by **lifetime holons earned through attribution** (a sum over the existing `HolonTransaction` log — no new model), not by current balance. Balance is the spendable currency; *earned* is the reputation. Otherwise spending — i.e., participating more — pushes you down the leaderboard, which punishes exactly the behavior the game wants. Like SO rep, earned-total only goes up.

3. **Edition end state.** Instances have start/end dates, but nothing defines what players see when the edition ends. Decided: a **persistent visual status indicator** for the edition (live / final day / ended) plus a popup at end-state communicating what happened, both linking to the **leaderboard** (ranked by lifetime earned, per §11.2). The leaderboard is itself a new small page — and worth having *during* the game, not just at the end, since it's the festival scoreboard.
4. **Moderation tools.** A public festival game will collect junk. Admin needs delete/hide for topics, maps, and comments, plus a basic rate limit on nominations. Verify what the existing `/admin` panel covers.
5. **Password reset.** (Verified: no reset flow exists.)
   - **Minimum for now:** facilitator manual reset — an admin-panel action that sets a temporary password on a user (one small endpoint behind `requireAdmin` + one admin UI field). Covers a live festival where the facilitator is in the room.
   - **To automate it like a normal app** (the upgrade path, ~half a day once prerequisites exist):
     1. A transactional email provider — **Resend** is the low-friction pick for a Next.js stack (free tier ~3k emails/month); Postmark/SES equivalent.
     2. Verified sending domain — DNS records (SPF + DKIM) on the holoscopic domain.
     3. Backend: a reset-token store (hashed token, ~1h expiry, single-use), `POST /auth/forgot` (always returns 200 so attackers can't enumerate emails) and `POST /auth/reset`; rate-limit the forgot endpoint.
     4. Frontend: `/forgot-password` and `/reset-password` pages in the existing auth style.
     The same email plumbing then gives signup verification and game notifications for free later.
6. **Render cold starts.** Free-tier spin-down means 30s+ first loads and (per the route-loading pattern) no API routes until Mongo connects. During game days, keep the service warm (paid instance or a pinger) — this is the single biggest *perceived performance* risk, bigger than anything in the frontend.
7. **Backups during the live run.** A scheduled Mongo dump (or Atlas backup verification) before and during multi-day sessions, so a bad deploy or bug can't erase the group's map.

## 12. Testing & facilitator readiness (run after the draft build)

A full test run, organized for a live multi-day game:

**Core loop (multi-account)**
- 4 real accounts on phones + laptop: nominate → support → quorum fires → create map (frame picked from library) → all join → place entries → comment → vote → close → stakes settle correctly.
- Ledger integrity: after a full cycle, sum of all balance changes per activity = 0 (zero-sum check); frame creator received `frame_use_reward`; pattern owner rewards fire.
- Quorum/expiry timing: topic confirms at threshold; expires + refunds after window; countdown displays match server behavior (remember sweeps run on read).

**Concurrency & realtime**
- Two users joining the last slot of a map simultaneously; concurrent entry submissions (WebSocket + REST paths) don't corrupt ratings.
- Balance/notification push arrives on a second device; hub poll picks up another player's nomination within the interval; refetch-on-focus works.

**Instance & edition isolation**
- Two instances side by side: topics/frames/balances don't bleed; per-edition config (holons/quorum) differs and is respected; editing config mid-game in admin takes effect sanely.
- Archived edition URLs render read-only; current-edition redirect correct.

**Flows & states**
- Signed-out browsing → sign-in CTA → signup → land back where you were (callbackUrl), starting stake granted once.
- Anonymous activity path (per §8 decision) behaves as designed.
- Insufficient-holons paths on every spend action show the explanatory disabled state.
- Empty states: fresh edition (seeded), empty drill CTAs, full maps, expired topics.
- First-visit overlay shows once; glossary tooltips on touch devices.
- Legacy link audit: /topics, /inquiry, /algorithms, /play, old notification links all land somewhere sensible.

**Devices, performance, resilience**
- Mobile pass at 320/375/414px: bottom sheets, entry modal slider, graph pinch-zoom, tap targets, sidebar sheet.
- Browsers: Safari iOS, Chrome Android, desktop Safari/Chrome/Firefox.
- Graph with 100+ items: paging, pan/zoom smoothness, memory.
- Slow network (throttled 3G): loading skeletons, no double-submits on slow POSTs.
- API down / Mongo cold-start on Render: friendly failure + recovery (routes load only after Mongo connects).
- Deploy config: CORS `CLIENT_URL` includes the live domain; `NEXT_PUBLIC_SERVER_URL` set; socket connect limit (`MAX_CONNECTIONS`) sized for expected players.

**Facilitator checklist (pre-session)**
- Edition instance created with gameNumber; config values reviewed in admin; starter content seeded; admin account verified; a dry-run topic exercised end-to-end; clock/window settings match session length.

**Content-domain designation (decided June 12, not yet built):** there is currently *no* marker separating platform content (Activities/Sequences made via `/create`, dashboard, profile — the studio world) from game content. Topics/Frames/Patterns are instance-scoped, but Activities and Sequences are global; game-created maps carry `topicId`/`frameId` only. Proposed fix: add a nullable `instanceId` to `Activity` and `Sequence` — set automatically when created through a game flow (topic/frame context present), null for studio content. This makes "everything in this game" queryable, keeps the patterns-tab leak fixed at the root, and gives the pattern builder a clean search scope. Schedule with Phase 2/3 backend work.

**Admin note (verified):** per-instance config already works — every Instance document carries its own `holons` + `quorum` config, editable in the platform admin's Config tab (`apps/platform` → instance → Config), persisted via `PUT /api/instances/:id`. Optional addition: surface the same config editor inside the game's own `/admin` panel scoped to its instance, so edition admins don't need the platform app.

---

## 13. Phasing

**Phase 1 — Foundation: theme, IA, identity**
Light-theme token system + type scale; interView landing page (title, headline, big stacked links, rules link); game-numbered URL segment (no archive machinery); unified game nav; `strings.ts` constants + legacy page deletion; confirmed-topic visibility + countdowns; **auth hardening (§11.1 — session-verified spend/earn/vote routes)**.

**Phase 2 — The hub experience**
One-click popup model + Explore; breadcrumb drill (simple fade on mode change); canonical graph layout with caption chip; node sizing by signal; slots chips; see-all/paging; legend; frame-focus grid preview; empty-drill CTAs; full-map linkage; keep-camera fix; costs-on-buttons + toast system + inline errors; anonymous gating (browse free, participate = sign in).

**Phase 3 — Flows & gameplay surfaces**
Frame type-ahead picker + live axis preview in New Map; topic form costs + post-create highlight; activity pages restyled into the unified schema + stake explanation + entry celebration; **close/settlement rule + countdowns + visible payout (§11.2)**; **leaderboard page (lifetime earned) + edition status indicator (§11.3)**; first-visit overlay; glossary; rules restructure; seeding/demo items; hub polling + refetch-on-focus; mobile bottom sheets and form sheets; admin manual password reset; moderation basics.

**Phase 4 — Pattern builder & hardening**
Visual-first pattern builder with search-and-clone forking; edition end popup/closing screen; automated email password reset (Resend + domain DNS); in-game admin config editor (optional); Render keep-warm + backup routine; full §12 test run + facilitator checklist.

Phases 1–3 are the bar for the live first edition; Phase 4's builder can land during the demo period.

**Deferred until the first edition validates the game:** per-`gameType` lexicon system, edition archive mode and editions list, instance-room socket push (poll is enough), graph filters from the legend.
