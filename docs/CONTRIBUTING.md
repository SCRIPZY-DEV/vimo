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

## Ground rules (they apply to every change)

- **Claude never runs git commands**: you, as the human, handle _staging_, commits, branches, and pushes.
- Follow the rules in the area's `CLAUDE.md` file; those capture the conventions reviewers use to check the work.
