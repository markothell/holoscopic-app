# Holoscopic App — Claude Instructions

## Adding a new activity type

1. **Add config to `src/components/activities/types.ts`**
   - Add a new key to `ACTIVITY_TYPE_CONFIGS` with `id`, `label`, `description`, `icon`, `screens`, `requiresMapQuestion2`, `positioningMethod`, and `hasCommentTab`
   - `hasCommentTab: true` → results page shows a separate Map/Comments tab bar; `false` → results component handles its own comments panel

2. **Create a `PositioningSteps` component** in `src/components/activities/<type>/`
   - Implement the `TypePositioningStepsProps` interface from `registry.tsx`
   - Receives `step`, `xValue`, `yValue`, `onXChange`, `onYChange`, `objectName`, `existingRating`
   - Handles all steps between step 1 (name) and the last step (comment) — i.e. steps `2..totalSteps-1`

3. **Create a `Results` component** (or reuse an existing one)
   - Must implement `ResultsViewProps` from `src/models/Activity.ts`
   - If `hasCommentTab: false`, include an integrated comments panel; hide it at lg+ when `hideCommentsPanel={true}` is passed
   - `ActivityPageModal` always passes `hoveredSlotNumber` and `externalHoveredCommentId` to all TypeResults — forward both to your map sub-component to get bidirectional hover behavior (comment hover highlights dot, entry circle hover highlights dot) automatically

4. **Register in `src/components/activities/registry.tsx`**
   - Add an entry to `REGISTRY` with `totalSteps`, optional `commentMaxLength`, `PositioningSteps`, and `Results`

5. **Update `normalizeActivityType` in `types.ts`** if the new type has legacy DB name variants

`EntryModal` and `ActivityPageModal` require no changes.

## Server directories
- **`holoscopic-app/server/`** — source of truth for all backend code; runs locally at localhost:3001
- **`holoscopic-socket-server/`** — production server on Render; populated via sync script, never edited directly
- **Workflow**: edit `holoscopic-app/server/` → run `node sync-server-holoscopic.js` from repo root → commit & push `holoscopic-socket-server/`

## Retiring an activity type

Remove the entry from `REGISTRY` and `ACTIVITY_TYPE_CONFIGS`. The shared modal and page components adapt automatically.
