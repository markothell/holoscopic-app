# @hs/activities

Shared React component library and activity-type engine. Consumed by `apps/holoscopic-game`. No runtime dependencies beyond React (peer dep). TypeScript source is consumed directly (no build step) via `"main": "./src/index.ts"`.

## What This Package Is Responsible For

All activity-type-specific UI, positioning logic, type definitions, and shared utilities live here so they can be used by any frontend app without duplicating code. The `REGISTRY` is the single source of truth for how each activity type behaves.

## Key Files

| File | Purpose |
|---|---|
| `src/index.ts` | Public API — all exports go through here |
| `src/components/activities/registry.tsx` | Maps each type to its components (PositioningSteps, Results, CreatePanel) |
| `src/components/activities/types.ts` | Type configs, `normalizeActivityType()`, `QUADRANT_POSITIONS` |
| `src/components/activities/registry-types.ts` | TypeScript interface for `ActivityTypeRegistration` |
| `src/types/Activity.ts` | Core `HoloscopicActivity` + `ActivityEntry` types and selectors (`commentEntries`, `positionedEntries`) |
| `src/components/MappingGrid.tsx` | 2D canvas grid for continuous positioning (dissolve) |
| `src/components/ResultsView.tsx` | Full results display for dissolve type |
| `src/components/ResultsViewSimple.tsx` | Simplified results for resolve type |
| `src/components/activities/snapshot/SnapshotResults.tsx` | Results for snapshot type |

## Activity Type Registry

Three canonical types:

| Type | Positioning | Steps | Notes |
|---|---|---|---|
| `dissolve` | Continuous sliders (X then Y) | 4 | Requires `mapQuestion2` for Y-axis label |
| `resolve` | 4-quadrant click | 3 | No second question needed |
| `snapshot` | Multi-question quadrant | Dynamic | Steps = 3 + question count |

These are the only type values — there are no legacy aliases. `normalizeActivityType()` just guards unknown strings to `dissolve`.

## Entries

Activity payloads carry `entries: ActivityEntry[]` — one entry per (user, slot, question) holding position, text, objectName, and votes together. Components never join separate ratings/comments arrays; use the selectors:
- `commentEntries(activity)` — entries with text (the comments panel)
- `positionedEntries(activity)` — entries with a position (the map dots); returns `PositionedEntry` with a non-null position
- `entryTimestamp(entry)` — updatedAt/createdAt as a Date

Votes live on the entry as `voterIds[]` + `voteCount`. Seed data is `isSeed: true`. Profile links in `CommentSection` are game-scoped via the `gameSlug` prop (`/profile/{userId}?game={slug}`).

## Adding a New Activity Type

1. Add type string to `ActivityType` union in `src/types/Activity.ts`.
2. Add config entry in `ACTIVITY_TYPE_CONFIGS` in `types.ts`.
3. Update `normalizeActivityType()` so the new value passes through.
4. Create `PositioningSteps`, `Results`, and `CreatePanel` components.
5. Register all three in `registry.tsx` under the new key.
6. Add the new string to the backend `Activity` schema enum in `apps/backend/models/Activity.js`.

## Position Coordinates

All positions are stored as `{ x: number, y: number }` where both values are in `[0, 1]`:
- `x=0` → left (axis min label), `x=1` → right (axis max label)
- `y=0` → bottom (axis min label), `y=1` → top (axis max label)

Quadrant positions (resolve type) map to fixed coordinates via `QUADRANT_POSITIONS`:
- Q1 (NE): `{ x: 0.75, y: 0.75 }`, Q2 (NW): `{ x: 0.25, y: 0.75 }`, Q3 (SW): `{ x: 0.25, y: 0.25 }`, Q4 (SE): `{ x: 0.75, y: 0.25 }`

## Utilities

All three utility classes are thin wrappers re-exported from the game app's `src/utils/`:
- `FormattingService` — display helpers (truncate, format dates, etc.)
- `ValidationService` — activity field validation
- `UrlUtils` — URL slug generation and validation

## Dependencies on Other Modules

- Consumed by `apps/holoscopic-game` — import paths use `@hs/activities`
- The backend `Activity` schema enum must stay in sync with the types here
- `normalizeActivityType()` must handle all values that may exist in the DB

## Things That Are Easy to Break

- **`totalSteps` mismatch**: If `PositioningSteps` renders a different number of screens than `totalSteps` declares, the progress indicator breaks. Snapshot overrides this dynamically based on question count.
- **Adding a field to `ActivityTypeRegistration` interface**: All three registry entries must implement it or TypeScript will fail across the package.
- **Direct `activityType` string comparisons**: Use `normalizeActivityType()` before any switch/comparison — raw DB values may be legacy names.
