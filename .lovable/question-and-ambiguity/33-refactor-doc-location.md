# 33 — Refactor doc placement: in-file comment vs sibling README

**Original task:** "Document the refactor approach (detailSuffix, head array
concatenation) in a short comment or README inside the file so future edits
keep the same output."

## Point of confusion

The user said "comment **or** README **inside the file**". A README cannot
literally live *inside* a `.ts` file — so the phrasing implies one of:

- **A.** A JSDoc-style block comment inside `run-summary-types.ts` (the
  refactored file).
- **B.** A sibling `README.md` next to the file
  (`standalone-scripts/lovable-common/src/report/README.md`).
- **C.** Both A and B.

## Considered options

| # | Option | Pros | Cons |
|---|--------|------|------|
| A | In-file block comment above the renderers | Travels with the code; visible to anyone editing the file; survives `git mv`; no extra file | Slightly longer file |
| B | Sibling `README.md` | Indexable in folder listings | Easy to miss when editing the file; can drift; another doc surface |
| C | Both | Maximum visibility | Two sources of truth → drift risk |

## Decision

**Proceeded with Option A** — single in-file block comment placed
immediately above the text renderers, the functions whose output the
contract governs. Rationale:

1. The user's phrase "**inside the file**" most naturally maps to A.
2. The lint rule (`sonarjs/no-nested-template-literals: error`) and the
   `check:no-nested-tpl` scanner are pinned to *this exact file*, so the
   doc that explains *why* the patterns exist must live where the lint
   error will surface.
3. Avoids a second README that would need its own discovery path.

If the user wants a sibling README too, it's a one-file follow-up.

## Verification

- `node scripts/check-no-nested-template-literals.mjs` → OK (scanner
  state machine pushes `bcomment` context on `/*`, so backticks/dollars
  inside the doc block are ignored).
- File shape unchanged below the comment; renderer signatures untouched;
  no behavioural diff.
