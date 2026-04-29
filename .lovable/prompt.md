# Lovable Prompts — Index

Reusable, copy-pastable prompts that drive repeatable workflows on this project.

| Prompt | File | Purpose |
|---|---|---|
| Write Memory / End Memory (concise) | [`prompts/01-write-memory.md`](./prompts/01-write-memory.md) | Persist everything learned/done/pending at end of a session so the next AI starts with zero context loss. |
| Write Memory / End Memory (full protocol v2.0) | [`prompts/02-write-memory.md`](./prompts/02-write-memory.md) | Expanded protocol with all 5 phases, deferred-task handling, anti-corruption rules. |
| Write Memory / End Memory (full protocol **v3.0** — current) | [`prompts/03-write-memory.md`](./prompts/03-write-memory.md) | Adds CI/CD issues folder (`.lovable/cicd-issues/` + `cicd-index.md`) and verbatim-spec capture rules. **Use this one.** |

## Conventions

- Filenames: `XX-descriptive-name.md` (lowercase, hyphenated, numeric prefix).
- Every prompt added under `.lovable/prompts/` MUST be referenced in this file.
- Prompts are versioned inline (header `version: X.Y`).
