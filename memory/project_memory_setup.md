---
name: project-memory-setup
description: Hierarchical CLAUDE.md and .claude/memory/ documentation was created for the holoscopic monorepo
metadata:
  type: project
---

A full hierarchical documentation pass was completed for the holoscopic monorepo.

**What was created:**
- Root `CLAUDE.md` — high-level architectural map (92 lines)
- `apps/backend/CLAUDE.md` — backend patterns, route loading, WebSocket events, model conventions
- `packages/activities/CLAUDE.md` — activity type registry, position coordinates, how to add new types
- `apps/holoscopic-game/CLAUDE.md` — existed; left mostly unchanged
- `apps/platform/CLAUDE.md` — existed; left mostly unchanged
- `.claude/memory/architecture.md` — full system design narrative
- `.claude/memory/decisions.md` — 7 key architectural decisions with rationale
- `.claude/memory/patterns.md` — recurring code patterns with examples
- `.claude/memory/gotchas.md` — 14 non-obvious things that can cause bugs

**Why:** User requested this to give Claude persistent context across sessions for accurate code assistance.

**How to apply:** Read the CLAUDE.md files and `.claude/memory/` files at the start of any session involving this codebase.
