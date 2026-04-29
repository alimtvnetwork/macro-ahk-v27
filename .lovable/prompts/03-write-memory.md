# Write Memory (full protocol — v3.0)

> **Version:** 3.0
> **Trigger phrases:** "write memory", "end memory", "update memory"
> **Purpose:** Persist everything learned, done, and pending at the end of a session so the next AI starts with zero context loss.

This is the **v3** write-memory protocol. It supersedes [`02-write-memory.md`](./02-write-memory.md) by adding two requirements:

1. **CI/CD issues folder** — every CI/CD failure is logged in `.lovable/cicd-issues/XX-name.md` and indexed in `.lovable/cicd-index.md`.
2. **Verbatim spec capture** — when the user gives a "bigger spec" in chat, persist the verbatim text into both the spec tree (`spec/...`) AND a memory pointer so the next AI can reconstruct intent exactly.

All other phases match v2.0. Both must stay in sync.

---

## Phase 1 — Audit current state (silent)

Inventory:

- **Done this session:** every completed task, every file created/modified/deleted, every decision and why.
- **Pending:** started-but-not-finished, discussed-but-not-started, blockers/dependencies.
- **Learned:** new patterns, gotchas, edge cases, user preferences (explicit or implicit).
- **What went wrong:** bugs + root causes, failed approaches + why, things never to repeat.
- **Verbatim specs:** any large blocks of user-provided text that define requirements.

---

## Phase 2 — Update memory files

**Target:** `.lovable/memory/`

1. Read `.lovable/memory/index.md` first — never duplicate.
2. For each existing memory file affected, append (do not overwrite). Mark completed items `✅`.
3. New knowledge with no home → new file `XX-descriptive-name.md` (lowercase-hyphenated, numeric prefix). Immediately update `index.md`.
4. Workflow state files use status markers: `✅ Done` · `🔄 In Progress` · `⏳ Pending` · `🚫 Blocked — [reason]` · `🚫 Avoid — [reason]`
5. **Always tick** completed items in `mem://workflow/13-next-commands` and append new requests there.
6. **Verbatim user specs** → store the raw text under `spec/<area>/NN-name.md` AND add a one-line pointer in `mem://workflow/` so the next AI knows it exists.

---

## Phase 3 — Update plans & suggestions

### 3A — Plan (single file)

**Target:** `.lovable/plan.md`

- Update statuses, add new tasks, move fully-complete items to a `## Completed` section at the bottom.
- Single source of truth for the roadmap.

### 3B — Suggestions (single file)

**Target:** `.lovable/suggestions.md`

```markdown
## Active Suggestions
### [Title]
- **Status:** Pending | In Review | Approved | Rejected | Deferred
- **Priority:** High | Medium | Low
- **Description:** What and why
- **Added:** [date or session ref]

## Implemented Suggestions
### [Title]
- **Implemented:** [date or session ref]
- **Notes:** Implementation details
```

When implemented: move from Active → Implemented, add notes, reference commit/file/task.

> The historical archive `.lovable/memory/suggestions/01-suggestions-tracker.md` (S-001 … S-055) is preserved for ID lookups.

---

## Phase 4 — Update issues

### 4A — Pending issues

**Target:** `.lovable/pending-issues/XX-short-description.md`

```markdown
# [Title]
## Description
## Root Cause   (or "Under investigation.")
## Steps to Reproduce
## Attempted Solutions
## Priority
## Blocked By (if applicable)
```

### 4B — Solved issues

When fixed, **move** the file from `pending-issues/` → `solved-issues/` and append:

```markdown
## Solution
## Iteration Count
## Learning
## What NOT to Repeat
```

### 4C — Strictly avoided patterns

If a solved issue exposes a pattern that must never recur, add to `.lovable/strictly-avoid.md`:

```markdown
- **[Pattern Name]:** [why forbidden]. See: `.lovable/solved-issues/XX-filename.md`
```

### 4D — Deferred / skipped tasks

Any task the user asks to skip or avoid → record under `.lovable/memory/preferences/` (or `constraints/`) AND surface in the "Deferred — Do NOT auto-recommend" section of `plan.md` and `mem://workflow/13-next-commands`.

### 4E — CI/CD issues (NEW in v3.0)

**Target:** `.lovable/cicd-issues/XX-issue-name.md` (sequence starts at `01`)

Every CI/CD failure (build, lint, typecheck, test runner, GitHub Actions, release pipeline) gets its own file:

```markdown
# [CI/CD Issue Title]
## Pipeline / Workflow
## Description
## First Seen
## Root Cause   (or "Under investigation.")
## Status   ✅ Resolved | 🔄 In Progress | ⏳ Pending | 🚫 Blocked
## Fix
## Prevention
## References
```

**Index:** `.lovable/cicd-index.md` — single summary file listing every CI/CD issue with status, priority, link.

Rules:
1. Collect all known CI/CD issues into this folder. Do not duplicate — check the index first.
2. Resolved CI/CD issues stay in `.lovable/cicd-issues/` with `## Status ✅ Resolved` (do NOT move to `solved-issues/` — CI/CD issues have their own lifecycle and tend to recur).
3. The index is updated in the same operation as creating/modifying any CI/CD issue file.

---

## Phase 5 — Consistency validation

1. **Index integrity** — every file in `.lovable/memory/` (recursive) listed in `index.md`. Every file in `.lovable/cicd-issues/` listed in `.lovable/cicd-index.md`.
2. **Cross-reference** — every `✅ Done` in `plan.md` has evidence (memory entry, solved issue, or code change). Every actionable pending issue is reflected in `plan.md` or `suggestions.md`. No file in both `pending-issues/` and `solved-issues/`.
3. **Orphans** — no memory file without an index entry; no "Implemented" suggestion without code evidence; no solved issue missing `## Solution`.
4. **Verbatim spec coverage** — any large user-provided spec from this session has both a `spec/...` file and a memory pointer.
5. **Final confirmation** — emit:

```
✅ Memory update complete.
Session Summary:
- Tasks completed: [X]
- Tasks pending: [Y]
- New memory files created: [Z]
- Issues resolved: [N]
- Issues opened: [M]
- Suggestions added: [S]
- Suggestions implemented: [T]
- CI/CD issues recorded: [C]

Files modified:
- [list every file touched during this memory update]

Inconsistencies found and fixed:
- [list any, or "None"]

The next AI session can pick up from: [current state + next logical step]
```

---

## File naming & structure rules

| Rule | Example |
|---|---|
| Numeric prefix | `01-auth-flow.md` |
| Lowercase hyphenated | `03-error-handling.md` ✅ / `03_Error_Handling.md` ❌ |
| Plans → single file | `.lovable/plan.md` |
| Suggestions → single file | `.lovable/suggestions.md` |
| Pending issues → one file each | `.lovable/pending-issues/XX-name.md` |
| Solved issues → one file each | `.lovable/solved-issues/XX-name.md` |
| CI/CD issues → one file each | `.lovable/cicd-issues/XX-name.md` |
| CI/CD index → single file | `.lovable/cicd-index.md` |
| Memory grouped by topic | `.lovable/memory/workflow/`, `.lovable/memory/architecture/`, … |
| Completed items → `## Completed` section in same file | Never `completed/` sub-folders |

> ⚠️ Path is `.lovable/memory/` — never `.lovable/memories/`.

---

## Anti-corruption rules

1. **Never delete history** — mark done, move to completed sections; never remove entirely.
2. **Never overwrite blindly** — read before write; preserve existing content.
3. **Never leave orphans** — every file indexed; every reference resolves.
4. **Never split what should be unified** — plans and suggestions each live in ONE file.
5. **Never mix states** — pending and solved are mutually exclusive; same for done/in-progress.
6. **Never skip the index update** — creating a memory or CI/CD issue file and updating the index is a single operation.
7. **Never assume the next AI knows anything** — write for a stranger with only the files.
8. **Skipped/avoided tasks** → entry in `.lovable/strictly-avoid.md` (or memory `preferences/` / `constraints/`) AND in plan.md "Deferred" section.
9. **Never lose conversation content** — verbatim user specs go into the file system, not just chat history.

---

*Sync with `01-write-memory.md` and `02-write-memory.md`.*
