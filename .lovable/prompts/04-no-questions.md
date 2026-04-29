# No-Questions Mode (40-task window)

> **Version:** 1.0
> **Trigger phrases:** `no question`, `not ques for 40`, `no-questions mode`
> **Exit phrase:** `ask question if any understanding issues`
> **Activated:** 2026-04-26 (window opened by user)
> **Last refreshed by user:** 2026-04-28 (this prompt persisted to disk)
> **Window size:** 40 tasks
> **Status:** ACTIVE — see `.lovable/question-and-ambiguity/task-counter.md` for current count.

This file is the **verbatim, persistent capture** of the user's
No-Questions Mode spec. It supersedes ad-hoc memory of the rule and
is the canonical reference for both this AI session and the next.
The matching memory pointer lives at
`mem://workflow/no-questions-mode` and the **Core** entry of
`mem://index.md`.

---

## Goals

1. Eliminate all user questions for the next 40 tasks.
2. Centralize ambiguity tracking in `.lovable/question-and-ambiguity/`
   for later review.
3. Maintain forward momentum by inferring the most reasonable
   interpretation when requirements are unclear.

---

## Ambiguity Logging Rules

### 1. Location

- Save all ambiguity notes to
  `.lovable/question-and-ambiguity/xx-brief-title.md`.
- Use sequential numbering (`01`, `02`, `03`, …) prefixed to the
  filename. Pick the next free number by `ls`-ing the directory.

### 2. Content requirements (every ambiguity file)

- **Task context** — what feature or spec the ambiguity relates to.
- **Specific question** — the exact point of uncertainty.
- **Inferred decision** — what assumption was made to proceed.
- **Impact** — how the decision affects the implementation.
- **Suggested clarification** — what the user should confirm when
  reviewing.

### 3. Format

- Markdown with clear headers.
- Keep each note **under 200 words** for quick review.
- Include a timestamp (`Asia/Kuala_Lumpur` per
  `mem://localization/timezone`).
- Append one bullet to `.lovable/question-and-ambiguity/readme.md`
  pointing at the new file.

---

## Inference Guidelines

1. When a requirement is ambiguous:
   - Choose the interpretation that aligns with the **existing
     codebase style**.
   - Prefer the **simpler** implementation over the complex one.
   - Default to the **most common UX pattern** for the given
     context.
2. Document the inference in the ambiguity log so the user can
   override it later.
3. **Do not block progress** — complete the task with the inferred
   approach.

---

## Task Counter

1. Maintain a running count of tasks completed under this mode.
2. The count starts at **0** and increments by 1 for each completed
   task.
3. When the count reaches **40**, resume normal question-asking
   behaviour.
4. Log the completion of each task in
   `.lovable/question-and-ambiguity/task-counter.md`.

---

## Hard rules ("Important")

1. **Do not ask the user any questions** for the next 40 tasks.
2. **All ambiguity must be logged**, not voiced.
3. **Inferences must be reasonable and documented.**
4. The user will review all logged questions at the end of the
   40-task period.

---

## Cross-references

- Memory rule (Core, always in context):
  `mem://workflow/no-questions-mode`.
- Question-asking style for any rare question that DOES surface
  (e.g. when the user explicitly invites one):
  `mem://preferences/question-asking-style`.
- Counter file: `.lovable/question-and-ambiguity/task-counter.md`.
- Index of logged ambiguities:
  `.lovable/question-and-ambiguity/readme.md`.