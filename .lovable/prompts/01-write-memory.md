# Write Memory / End Memory

> **Version:** 1.0
> **Trigger phrases:** "write memory", "end memory", "update memory"
> **Purpose:** At end of every session, persist what was done, learned, and left undone so the next AI session has zero context loss.

---

## Core Principle

The memory system is the project's brain. If you did something and didn't write it down, it didn't happen. Write as if the next AI has amnesia — because it does.

---

## Phase 1 — Audit current state (silent)

Before writing, inventory:

- **Done this session:** every completed task, every file created/modified/deleted, every decision and why.
- **Pending:** started-but-not-finished, discussed-but-not-started, blockers/dependencies.
- **Learned:** new patterns, gotchas, edge cases, user preferences (explicit or implicit).
- **What went wrong:** bugs + root causes, failed approaches + why, things never to repeat.

---

## Phase 2 — Update memory files

**Target:** `.lovable/memory/`

1. Read `.lovable/memory/index.md` first — never duplicate.
2. For each existing memory file affected, append (do not overwrite). Mark completed items `✅`.
3. New knowledge with no home → new file `XX-descriptive-name.md`. Immediately update `index.md`.
4. Workflow state files use status markers:
   - `✅ Done` · `🔄 In Progress` · `⏳ Pending` · `🚫 Blocked — [reason]` · `🚫 Avoid — [reason]`

---

## Phase 3 — Update plans & suggestions

### 3A — Plan (single file)

**Target:** `.lovable/plan.md`

- Update statuses, add new tasks, move fully-complete items to a `## Completed` section at the bottom.
- Single source of truth for the roadmap.

### 3B — Suggestions (single file)

**Target:** `.lovable/suggestions.md`

Two sections only:

```markdown
## Active Suggestions
### [Title]
- **Status:** Pending | In Review | Approved | Rejected
- **Priority:** High | Medium | Low
- **Description:** What and why
- **Added:** [date or session ref]

## Implemented Suggestions
### [Title]
- **Implemented:** [date or session ref]
- **Notes:** Implementation details
```

When implemented: move from Active → Implemented, add notes, reference commit/file/task.

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

---

## Phase 5 — Consistency validation

1. **Index integrity** — every file in `.lovable/memory/` (recursive) listed in `index.md`.
2. **Cross-reference** — every `✅ Done` in `plan.md` has evidence (memory entry, solved issue, or code change). Every actionable pending issue is reflected in `plan.md` or `suggestions.md`. No file in both `pending-issues/` and `solved-issues/`.
3. **Orphans** — no memory file without an index entry; no "Implemented" suggestion without code evidence; no solved issue missing `## Solution`.
4. **Final confirmation** — emit:

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
| Memory grouped by topic | `.lovable/memory/workflow/`, `.lovable/memory/architecture/`, … |
| Completed items → `## Completed` section in same file | Never `completed/` sub-folders |

```
.lovable/
├── overview.md
├── strictly-avoid.md
├── user-preferences
├── plan.md
├── suggestions.md
├── prompt.md
├── prompts/
│   └── 01-write-memory.md
├── memory/
│   ├── index.md
│   ├── workflow/
│   ├── architecture/
│   └── [topic]/
├── pending-issues/
└── solved-issues/
```

> ⚠️ Path is `.lovable/memory/` — never `.lovable/memories/`.

---

## Anti-corruption rules

1. **Never delete history** — mark done, move to completed sections; never remove entirely.
2. **Never overwrite blindly** — read before write; preserve existing content.
3. **Never leave orphans** — every file indexed; every reference resolves.
4. **Never split what should be unified** — plans and suggestions each live in ONE file.
5. **Never mix states** — pending and solved are mutually exclusive; same for done/in-progress.
6. **Never skip the index update** — creating a memory file and updating `index.md` is a single operation.
7. **Never assume the next AI knows anything** — write for a stranger with only the files.
8. **Skipped/avoided tasks** → entry in `.lovable/strictly-avoid.md` (or memory `constraints/`).

---

*Sync with `ai-onboarding-prompt.md` if/when it exists.*
