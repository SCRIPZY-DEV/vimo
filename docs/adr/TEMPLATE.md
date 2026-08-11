# ADR-NNNN — Short decision title

- **Status:** Proposed | Accepted | Superseded by ADR-XXXX | Deprecated
- **Date:** YYYY-MM-DD (last status update)
- **Area:** app | pipeline | security | distribution | testing | providers

<!--
  Copy this file to docs/adr/ADR-NNNN-short-slug.md and delete the comments.
  Sections marked (required) are always filled in. Delete the (optional) ones that
  don't apply: an ADR should read in under five minutes.
  ADRs themselves are written in Spanish — use TEMPLATE.es.md to write one.
  This English version exists so the structure is readable to everyone. Example:
  Code paths are relative to the repo root (`src/file.ts`).
-->

## Problem (required)

The situation that forced a decision, with evidence where it exists (user report,
measurement, incident). Enough context that someone without the history understands
why this wasn't obvious. Close with the constraints that narrowed the field:

- Constraint 1 (e.g. it has to run off a USB stick, with no installer).
- Constraint 2 (e.g. the contributor uses a cheaper model with a smaller context).

## Decision (required)

The decision in one imperative sentence. Then how it materializes in the code:
concrete files and functions, with paths.

> Example: "Session state lives in `src/state/session.ts` and is persisted to disk
> only on app shutdown."

### Shape (optional)

A diagram or table when the decision has moving parts. ASCII beats prose here:

```
user -> command    -> stage 1 -> stage 1.5 (review) -\
                                                      | fix loop
                   <- result  <- stage 2 <------------/
```

| Component | Status       | Location  | Purpose  |
| --------- | ------------ | --------- | -------- |
| `thing`   | new / reused | `src/...` | one line |

### Data flow (optional)

Numbered steps, only if order matters and the diagram doesn't already show it.

1. X enters through `src/...`.
2. It's validated in `...`; on failure it stops here.
3. Y goes out to `...`.

## Alternatives considered (required)

Without this section the ADR is useless: it's what stops the same debate six months
from now.

- **Alternative A** — why it was rejected (cost, risk, concrete evidence).
- **Alternative B** — same. If it was rejected _for now_ and could come back, say so
  and state what would have to change to reconsider it.

## Consequences (required)

- ✅ What gets better.
- ⚠️ The debt or cost we're taking on knowingly.
- 🔒 What can **no longer** be done (the constraint this imposes going forward).

## Compliance verification (required)

How we prove the decision works and is still being followed. An ADR with no
executable verification is an opinion, not a record.

- **Tests:** exact path + what they assert + where they run (CI / local).
- **Guards:** build or lint checks that protect it.
- **What a regression would look like:** the concrete symptom, and what would catch it.

## Failure modes (optional)

What happens when things go wrong, and who owns it: what aborts, what retries, what
gets reported back to the user.

## Out of scope (optional)

What was deliberately **not** built, so nobody reads it as an oversight. Add one of
these only when real use proves it's needed.

## References (optional)

Commits, issues, PRs, related ADRs (`ADR-NNNN`), external documentation.
