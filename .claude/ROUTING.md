# Model Routing Policy

**Principle:** match model cost to task risk/complexity. Cheap models do volume
work. Expensive models are reserved for things that are **hard to reverse or hard
to verify**.

The orchestrator (whoever is holding the conversation) does the routing — it reads
each task, picks a tier, and dispatches to the matching subagent in `.claude/agents/`.

## Tiers

| Tier | Model | Agent | Owns |
|---|---|---|---|
| **Fast** | Haiku | `fast` | Reading, searching, summarizing, running tests, fixing lint/type errors, boilerplate (CRUD, config, simple components, straightforward refactors). Fully autonomous. |
| **Standard** | Sonnet | `standard` | **Default.** Features, bug fixes, non-trivial refactors, multi-file changes following an existing pattern. Writes its own tests. No sign-off unless a guarded path. |
| **Advanced** | Opus / Fable | `advanced` | Architecture & system design; auth/payments/migrations/data deletion; security review; failures Standard tried and failed to root-cause twice; ambiguous specs needing judgment. |

## Routing rule
Default every task to **Standard**. Escalate **up** to Advanced only when the task
matches an Advanced category. Escalate **down** to Fast when the task is read-only
or mechanical. **Never escalate up "just in case"** — that is what makes
Advanced-tier usage balloon.

## Interruption budget
Only interrupt the human for:
- Before using Advanced tier for something **not obviously** in its category.
- Before merging / deploying to production.

Everything else proceeds without asking.

## Guarded changes (auth · payments · migrations · production config)
branch → tests pass → PR with a plain-English summary of what changed and why →
wait for explicit human **"go"** → merge → deploy → verify.
**No tier merges its own PR, including Advanced tier.**

## Fallback
If the assigned model is unavailable, drop one tier and say so. If the task was
Advanced-tier for a **risk** reason (not just difficulty), stop and ask before
substituting down — never silently downgrade a security review.
