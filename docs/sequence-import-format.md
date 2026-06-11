# Sequence Import JSON Format

Use this format to create `.json` files that can be imported via the **Import JSON** button on the Sequences page (`/create/sequences`).

---

## Top-level structure

```json
{
  "sequence": { ... },
  "activities": [ ... ]
}
```

Both keys are **required**. The `sequence` object describes the sequence itself; `activities` is an ordered array of activity definitions.

---

## `sequence` object

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | **Yes** | Display name of the sequence |
| `urlName` | string | No | URL slug (e.g. `my-sequence`). Auto-generated from title if omitted. Lowercase letters, numbers, hyphens only. |
| `description` | string | No | Short description shown to participants |

```json
"sequence": {
  "title": "Leadership Across Difference",
  "urlName": "leadership-across-difference",
  "description": "A three-activity arc exploring perspective, trust, and shared language."
}
```

---

## `activities` array

Each item in `activities` defines one mapping activity. The order in the array sets the display order in the sequence.

### Activity fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | **Yes** | Display name of the activity |
| `activityType` | string | No | `"dissolve"`, `"resolve"`, or `"snapshot"`. Defaults to `"dissolve"`. |
| `mapQuestion` | string | No | Primary mapping prompt (what the x-axis represents) |
| `mapQuestion2` | string | No | Secondary prompt shown alongside the first (resolve type) |
| `xAxis` | object | No | See axis object below. Defaults: label=Horizontal, min=Low, max=High |
| `yAxis` | object | No | See axis object below. Defaults: label=Vertical, min=Low, max=High |
| `commentQuestion` | string | No | Prompt shown above the comment box. Defaults to `"Any thoughts?"` |
| `objectNameQuestion` | string | No | Prompt asking what to name the thing being placed. Defaults to `"Name something that represents your perspective"` |
| `preamble` | string | No | Intro text shown to participants before they engage |
| `wikiLink` | string | No | URL to reference material |
| `urlName` | string | No | URL slug. Auto-generated from title if omitted. |
| `round` | number \| null | No | Graph level for the sequence DAG view. Usually omitted (auto-derived from parent links). |
| `_ref` | string | No | Local reference name used to wire up `parentActivityRefs`. Not stored in DB. |
| `parentActivityRefs` | string[] | No | List of `_ref` values from earlier activities this one depends on |
| `starterData` | array | No | Pre-populated example entries (see below) |

### Axis object

```json
{ "label": "Trust", "min": "Low", "max": "High" }
```

All three fields are optional and fall back to the defaults shown above.

### Activity type reference

| Type | Description |
|---|---|
| `dissolve` | Each axis is its own mapping dimension. Participants place a named thing on a 2D map. |
| `resolve` | One question, find the center together. Same two-axis grid but framed as convergence. |
| `snapshot` | Multi-question grid with a fixed set of labeled items; uses `snapshotQuestions` instead of free entry. |

---

## `starterData` — pre-populated example entries

Each item in `starterData` adds one example dot to the map before participants arrive.

| Field | Type | Required | Notes |
|---|---|---|---|
| `objectName` | string | **Yes** | The name of the thing being placed |
| `x` | number | See note | 0.0 (left) to 1.0 (right). Required unless `quadrant` is given. |
| `y` | number | See note | 0.0 (bottom) to 1.0 (top). Required unless `quadrant` is given. |
| `quadrant` | number | See note | `1`=top-right, `2`=top-left, `3`=bottom-left, `4`=bottom-right. Overridden by explicit x/y. |
| `comment` | string | No | Comment to attach to this entry |

Use either `x`/`y` (exact coordinates) or `quadrant` (approximate center of that quadrant). If neither is valid, the entry is skipped.

```json
"starterData": [
  { "objectName": "Curiosity", "x": 0.75, "y": 0.8, "comment": "Opens doors." },
  { "objectName": "Control",   "quadrant": 3 },
  { "objectName": "Trust",     "x": 0.6,  "y": 0.65 }
]
```

---

## DAG relationships (`_ref` / `parentActivityRefs`)

To model a dependency graph (where some activities unlock after others), assign a `_ref` string to each activity and list the `_ref` values of its prerequisites in `parentActivityRefs`.

```json
"activities": [
  {
    "_ref": "act-a",
    "title": "Opening Round"
  },
  {
    "_ref": "act-b",
    "title": "Deepening",
    "parentActivityRefs": ["act-a"]
  },
  {
    "_ref": "act-c",
    "title": "Synthesis",
    "parentActivityRefs": ["act-b"]
  }
]
```

`_ref` values are only used during import to wire relationships; they are not stored.

---

## Snapshot activity extra fields

Only used when `"activityType": "snapshot"`.

| Field | Type | Notes |
|---|---|---|
| `snapshotQuestions` | array | List of `{ label, color? }` items defining what participants rate |
| `xAxisPoints` | number | `2` or `4`. Grid columns. Default `2`. |
| `yAxisPoints` | number | `2` or `4`. Grid rows. Default `2`. |
| `xAxisLabels` | string[] | Labels for grid column positions |
| `yAxisLabels` | string[] | Labels for grid row positions |

---

## Complete example

```json
{
  "sequence": {
    "title": "Trust Across Difference",
    "description": "A two-activity arc on the conditions for trust in diverse teams."
  },
  "activities": [
    {
      "_ref": "conditions",
      "title": "Conditions for Trust",
      "activityType": "dissolve",
      "mapQuestion": "How present is this in your team right now?",
      "xAxis": { "label": "Certainty", "min": "Uncertain", "max": "Certain" },
      "yAxis": { "label": "Presence",  "min": "Absent",    "max": "Strong" },
      "commentQuestion": "What shapes where you placed this?",
      "objectNameQuestion": "Name a condition for trust",
      "preamble": "Think about the team you are currently part of.",
      "starterData": [
        { "objectName": "Psychological safety", "x": 0.7, "y": 0.75 },
        { "objectName": "Clear expectations",   "quadrant": 1 },
        { "objectName": "History of follow-through", "x": 0.55, "y": 0.6, "comment": "Hard to build, easy to break." }
      ]
    },
    {
      "_ref": "repair",
      "title": "Trust Repair",
      "activityType": "dissolve",
      "mapQuestion": "How difficult is this to repair once broken?",
      "xAxis": { "label": "Visibility", "min": "Hidden",   "max": "Visible" },
      "yAxis": { "label": "Difficulty", "min": "Easy",     "max": "Hard" },
      "commentQuestion": "What makes repair possible here?",
      "objectNameQuestion": "Name something that damages trust",
      "parentActivityRefs": ["conditions"]
    }
  ]
}
```

---

## Common mistakes

- **Missing `sequence` wrapper** — the top-level must have a `"sequence"` key, not just `"title"` at root level.
- **`activities` not an array** — must be a JSON array even if there is only one activity.
- **Wrong `activityType`** — use `dissolve`, `resolve`, or `snapshot`. Do not use old names `holoscopic` or `findthecenter`.
- **`x`/`y` out of range** — values must be between 0.0 and 1.0 or the entry is silently skipped.
- **`starterData` missing `objectName`** — entries without `objectName` are silently skipped.
