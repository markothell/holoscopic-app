# Contributing

One convention is written down so far — how commit messages read. The rest of the
contributor guide follows later.

## Commit messages

**Subject: `Area: what the change does`, 72 characters or fewer.** The area is the app or
the surface it touches — `Circles:`, `Synthesis:`, `Homepage:` — and is dropped when the
change is repo-wide. Say what the tree does now, not what was done to it.

**A body only when the diff hides something.** Four things earn one:

- a constraint that forced the approach
- an alternative rejected, and the reason it was rejected
- the mechanism of a bug being fixed
- a hazard for whoever touches this next — a migration, an index, a second copy of the
  file that has to change with it

Copy, layout, and art changes get a subject line. If the body would only restate the diff
in prose, there is no body.

**The message describes the code, not the conversation that produced it.** A reader two
years out was not in the room, so every sentence has to be checkable against the tree.
*"The manifesto is included because it carries the identical footer"* is checkable. *"The
handle is right in the footer"* is not — that is a decision being reached, and a commit is
not where deliberation is recorded.

No first person, singular or plural. The project speaks. Neither the person nor the agent
at the keyboard appears in the prose, and neither does the fact that they discussed it.

Earns a body — none of this is visible in the diff:

```
Synthesis: an idea row says its map size and which circle holds it

thoughtCount excludes borrowed nodes — promotion retains sourceNodeId, so one
thought counts once however many maps carry it. Without that, the seeded home
hub would make merely reading an idea grow the number.

circles[] lists only circles the reader belongs to, so a share into a room they
are not in stays invisible.
```

Does not:

```
Essays and manifesto: full byline, handle stays in the footer
```

## Trailers

A commit written with an AI agent carries exactly one trailer:

```
Co-Authored-By: Claude <noreply@anthropic.com>
```

Stable and model-agnostic on purpose. The log should not churn between
`Claude Opus 5 (1M context)` and `Claude Fable 5.1` as tooling changes underneath it; what
is being disclosed is that an agent wrote the commit, not which build of it did.

Nothing else goes in the trailer block. In particular, no link to the agent session that
produced the commit: it resolves for one account and 404s for every other reader, and a
message that needs an external link to be understood is a message missing a sentence.
