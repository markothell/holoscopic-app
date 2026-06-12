# Holon Economy — Balance Sheet

*Every faucet, sink, and escrow loop in the system, with its config knob. All knobs live in per-instance config (platform admin → instance → Config). Updated June 12, 2026.*

## The three kinds of money movement

- **Mint (faucet)** — holons created from nothing. Inflationary by design.
- **Burn (sink)** — holons destroyed (or parked in a pool nothing pays out yet).
- **Escrow (zero-sum)** — holons held and guaranteed to come back out, either to the payer or redistributed to other players. Audited June 12: every escrow path now closes.

## Faucets (minted)

| Event | Ledger type | Knob (default) | Design lens |
|---|---|---|---|
| Join the edition (once) | `join_bonus` | `startingStake` (100) | participation |
| First touch each UTC day | `daily_bonus` | `dailyBonus` (**0 = off**) | participation |
| Topic reaches quorum → nominator | `session_host_reward` | `topicQuorumReward` (25) | connection — you named what the group cared about |
| Pattern session launches → proposer | `session_host_reward` | `sessionHostReward` (30) | connection — you convened people |
| Pattern session launches → each signup | `session_participant_reward` | `sessionParticipantReward` (15) | participation ⚠ farmable |
| Map built on your frame | `frame_use_reward` | `frameUseReward` (5) | connection — your lens was adopted |
| Your entry seeds a follow-up map | `entry_seed_reward` | `entrySeedReward` (8) | connection — your position sparked the next question |
| Map added to your pattern | `pattern_activity_reward` | `patternActivityReward` (3) | connection |
| Fork of your pattern published | `algorithm_royalty` | `algorithmRoyaltyPercent` (10%), decay `forkRoyaltyDecayPercent` (50%), depth `forkDepthCap` (3) | connection — lineage pays |

## Sinks (burned or parked)

| Event | Ledger type | Knob (default) | Notes |
|---|---|---|---|
| Nominate a topic *that confirms* | `nomination_cost` | `nominationCost` (10) | parked in `topic.holonPool` — **nothing pays the pool out yet** (open design question) |
| Support a topic *that confirms* | `support_cost` | `supportCost` (5) | same — parked in the pool |
| Publish a pattern | `algorithm_publish_cost` | `algorithmPublishCost` (150) | burned, minus royalty mints upstream |

## Escrow (zero-sum, all paths verified closed)

| In | Out paths |
|---|---|
| Map stake `activity_stake` (`activityStakeAmount`, 5) | votes → `comment_attribution` to authors; remainder → `activity_stake_return` at close (complete / window / edition end) |
| Topic nomination (10) | refunded `nomination_return` if topic expires |
| Topic support wager (5) | refunded `support_return` on expiry or withdrawal |
| Proposal deposit `algorithm_proposal` / `_join` (uses `supportCost`, 5) | `algorithm_proposal_return` on session launch, expiry sweep, or withdrawal |

## Worked example — one festival day, 6 players

Each player logs in (`dailyBonus` say 5): **+30 minted**. One topic nominated (−10 parked on confirm) and confirmed (+25 minted). Three maps created and settled (stakes net zero; frame creator +15 across three `frame_use_reward`s). One pattern session launches at quorum 3: deposits net zero, mints 30 + 3×15 = **+75**.
**Day's money supply change: +30 +25 +15 +75 −10 = +135 minted, ◈10 parked.** Tune accordingly.

## Design intent (June 12 discussion)

Rewards should flow from **making connections, not filling boxes**. The connection-lens faucets (frame use, attribution, seeds, royalties, quorum convening) are the ones to keep generous; the participation faucets (`sessionParticipantReward`, `dailyBonus`) are the gameable ones — keep them small and let `dailyBonus` be the *controlled* inflation valve instead. The leaderboard ranks lifetime *attribution earned*, not balance, so farming minted rewards never buys standing.

## The daily/UBI faucet (built June 12)

`dailyBonus` (off by default). When > 0: minted once per UTC day on the player's first authenticated touch (the balance fetch on page load — i.e., daily-login style). Atomic claim via `lastDailyBonusAt` on the membership doc, so concurrent requests can't double-mint. Shows up live via the `holon_update` socket push and in the ledger as `daily_bonus`.

## Open questions

- `topic.holonPool` accumulates nomination + support money on confirmed topics and nothing distributes it. Candidate uses: seed the topic's map stakes, pay out to contributors at edition end, or fund the topic's leaderboard bonus.
- Refunds use *current* config values, not amount-at-time-of-payment — only matters if knobs change mid-edition with escrow open.
