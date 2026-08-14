# Toyrok — the Toono language

Chosen by MO 2026-08-14 from a three-direction board (Toono / Felt & Thread / Instrument),
each direction skinned onto the circle-home map. This file is the spec the app implements;
`src/app/globals.css` carries the same values as tokens.

**The story:** the toono is the crown ring of a ger — the round dwelling where every roof-pole
runs from the lattice wall to one ring at the top, and the light comes in through it. Shelter
built by hand, architecture that converges. The circle home is a toono seen from inside.

## Palette

| Token | Value | Named for | Used for |
|---|---|---|---|
| `--ground` | `#F7F2E9` | felt | page ground |
| `--ground-deep` | `#EFE7D8` | pressed felt | hover grounds, wells |
| `--card` | `#FDFAF4` | canvas | cards, member nodes |
| `--ink` | `#3A2E20` | larch | text, structure |
| `--ink-soft` | `#6D5E4A` | | secondary text |
| `--ink-faint` | `#9C8D75` | | labels, captions |
| `--sky` | `#3D7FB5` | the sky through the ring | **what is live, and nothing else** |
| `--sky-soft` | `#DCE8F2` | | live surfaces' ground |
| `--ochre` | `#C08A3E` | | solo work — the spur color |
| `--rope` | `#B49A6E` | | shared-node strokes, quiet emphasis |
| `--shared` | `#EDE3D0` | | shared-node fill, the middle band's wash |
| `--pole-a` / `--pole-b` | `#2F7D7B` / `#B15C3C` | teal / clay | **the two ends of any polarity** — measured for weight parity and deuteranopia separation (check in threshold's globals.css); the pair travels with the mechanic, not the brand |

## Type

- **Display:** `"Iowan Old Style", Palatino, Georgia, serif` — warm roman, round shoulders.
  System stack for now; the bought-webfont decision (Freight-Text-like) is open.
- **Body / chrome:** `Seravek, "Gill Sans", "Trebuchet MS", system-ui, sans-serif`.

## Rules

1. **Sky appears once per screen, on what is live.** Stolen from the Instrument direction with
   MO's blessing. Everything else earns attention through weight and position, never color.
2. **Ochre is the solo mark** — a member's own exploration, pointing outward.
3. **Hairlines over boxes.** Rules at `rgba(58,46,32,0.14)`; the discipline that keeps warmth
   from drifting into softness.
4. **The ring is the signature.** The map, the wordmark's ring-O (`components/Wordmark.tsx`),
   empty states, the loading moment — one motif everywhere, quiet chrome around it.
5. **No Holoscopic mention anywhere** (P18): accounts read as Toyrok's own. The shared backend
   is invisible.

## Open

- Webfont purchase/selection for display (Iowan Old Style is the stand-in).
- Dark theme stance (unexplored; felt-and-larch inverts badly, needs its own pass).
- The wordmark ring needs real drawing time — current one is the board sketch.
- Felt & Thread's edge-as-stitch idiom is reserved for Synthesis's editable edges.
