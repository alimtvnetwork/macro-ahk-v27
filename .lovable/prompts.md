# Prompts Index

Canonical index of every persisted prompt under `.lovable/prompts/`.
Each prompt file captures a verbatim instruction or protocol from the
user so that future AI sessions can reload the exact intent without
re-deriving it from chat history.

## Format

- One row per prompt file, in numeric order.
- The **Tags** column lists every trigger phrase or short alias the
  user has used to invoke the prompt — so a future AI can `grep` for
  any of those phrases and land on the right file.
- Status: `active` (currently in force) / `superseded` (replaced by a
  newer version) / `archived` (one-shot, no longer needed).

## Entries

| # | File | Title | Tags | Status |
|---|------|-------|------|--------|
| 01 | [01-write-memory.md](./prompts/01-write-memory.md) | Write Memory v1.0 | `write memory`, `end memory` | superseded by 03 |
| 02 | [02-write-memory.md](./prompts/02-write-memory.md) | Write Memory v2.0 | `write memory`, `end memory`, `update memory` | superseded by 03 |
| 03 | [03-write-memory.md](./prompts/03-write-memory.md) | Write Memory v3.0 (CI/CD issues + verbatim spec capture) | `write memory`, `end memory`, `update memory` | active |
| 04 | [04-no-questions.md](./prompts/04-no-questions.md) | No-Questions Mode (40-task window) | `no question`, `not ques for 40`, `no-questions mode` | active |