# Contributing

**English** · [Español](/docs/CONTRIBUTING.es.md)

How to work in this repository: for humans (and the AI agents helping you).

## Orientation

- **Architecture** (how everything is built): [ARCHITECTURE.md](ARCHITECTURE.md) — read this first.
- **Rules**: to change the rules, edit `CLAUDE.md`. Claude Code loads these files automatically in every session.

## Two ways of working with Claude

### A. Standard prompts (the default)

Just make your request. Use this for any task that doesn't involve a full feature spanning multiple areas:

- questions ("how does the _feed_ query work?"),
- changes in a specific area ("fix this serializer validation", "tweak this component"),
- debugging, refactoring, and one-off fixes.

### B. The `/feature` pipeline

This process is still under development, but what it basically does is spin up several AI agents to help you solve a specific task. That said, it can end up being more expensive if the feature to implement isn't clearly defined.

## Branches and Pull Requests

- **One branch per feature.** Never work directly on `dev`. Name the branch after the change, using the same prefix as the commit type: `feat/portable-export`, `fix/serializer-validation`.
- **Every Pull Request targets `dev`, never `production`.** Releases reach production only by promoting `dev`; no PR goes straight to the production branch.
- **The PR title follows git flow / Conventional Commits**: `<type>: <short description>`, for example `feat: add portable export for the settings panel`.

  Types in use: `feat` (new feature), `fix` (bug fix), `docs` (documentation), `style` (formatting, no logic change), `refactor` (restructuring with no behavior change), `perf` (performance), `test` (tests), `chore` (tooling, dependencies, config).

  **Optional scope**: when the change lives in one clear area, put it in parentheses after the type — `fix(editor): …`, `fix(pipeline): …`, `fix(ci): …`. It tells _where_ the change is without opening the diff. Use a single lowercase word naming the area: a module under `src/modules/` (`editor`, `videos`, `auth`), `pipeline` (the sidecar), `tauri` (`src-tauri/`), `ci`, `updater`. If the change spans several areas, keep the bare type (`fix: …`) or split it into one commit per area.

- **Commits use the same format as the PR title**, one per logical unit (the sidecar fix, the UI fix, the guards, the docs), ordered so the project builds at each one. Write the subject so anyone on the team understands it: what changes for the user, not the internal function name. If the why doesn't fit in the subject, put it in the body in two or three plain lines:

  ```
  fix(editor): stop losing the first click on Regenerate image

  Clicking the button blurred the description field, which saved it and
  disabled the button before the click landed.
  ```

- **The PR description must be detailed** — enough for a reviewer who wasn't there. Cover at least:
  - **What was done**: the changes, area by area.
  - **Why**: the problem it solves or the issue/task it closes.
  - **How to test it**: steps to reproduce or verify the change.
  - **Notes**: breaking changes, migrations, or anything left pending.

## Ground rules (they apply to every change)

- **Claude never runs git commands**: you, as the human, handle _staging_, commits, branches, and pushes.
- Follow the rules in the area's `CLAUDE.md` file; those capture the conventions reviewers use to check the work.
