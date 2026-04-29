---
name: README badges break when line starts with HTML comment inside <div>
description: Root cause + fix for recurring readme.md badge render regression — GFM raw-HTML mode swallows [![alt](src)](url) markdown when the badge line begins with `<!--` inside a centered hero div
type: constraint
---

## Symptom (recurring)

GitHub renders the readme.md hero badge block as **raw markdown text**
(literal `[![CI](https://...)](...)` strings instead of badge images).
Lines above (logo `<img>`, H1, blockquote tagline) render correctly;
the breakage starts at the first badge line and runs to the end of the
centered `<div align="center">` block.

## Root cause

GitHub's CommonMark/GFM implementation (cmark-gfm) treats a paragraph
inside a raw-HTML block (`<div align="center">…</div>`) as **HTML
block type 2** when the paragraph's first non-whitespace token is
`<!--`. In that mode, **markdown image-link syntax `[![alt](src)](url)`
is NOT parsed** — every badge on that line falls through as literal
text. The on-same-line `-->` closer that normally ends type-2 blocks
does not re-enable markdown parsing for the rest of the paragraph in
this nested-div context.

The spec example in
`spec/01-spec-authoring-guide/11-root-readme-conventions.md` §"Badge
Layout Rules" shows the exact form that triggers the bug:

```
<!-- Build & Release --> [![CI](…)](…) <!-- Repo activity --> [![Issues](…)](…) …
```

Every regression of this issue traces back to a contributor (or
auto-formatter) putting an HTML comment as the first character of a
badge line.

## Fix (mandatory)

Prefix every badge line in the hero with the zero-width-space HTML
entity `&#x200B;` so the line does NOT start with `<!--`:

```
&#x200B;<!-- Build & Release --> [![CI](…)](…) <!-- Repo activity --> [![Issues](…)](…) …
&#x200B;<!-- Community --> <!-- (intentionally empty …) --> <!-- Code-quality --> [![Sec](…)](…) <!-- Stack & standards --> [![License](…)](…)
```

`&#x200B;` is invisible in the centered hero, does not affect the
compliance checker (which scans `<!-- Group -->` markers regardless of
leading characters), and reliably defeats the GFM raw-HTML-mode
trigger. Tested against `scripts/check-readme-compliance.mjs` —
18/18 checks pass.

## What NOT to do

- Do NOT remove the HTML comment group markers — `check-readme-compliance.mjs`
  requires all five (`Build & Release`, `Repo activity`, `Community`,
  `Code-quality`, `Stack & standards`) and uses them to attribute badges
  to per-group floors.
- Do NOT collapse all badges + markers onto a single line — the line
  becomes >700 chars and other GFM edge cases (token-budget bailout,
  link-reference resolution) start firing.
- Do NOT move markers to the END of each line — the checker scans
  "from this marker to the NEXT marker" so trailing markers misattribute
  badges to the WRONG group.
- Do NOT use `&nbsp;` (`\u00A0`) as the leading char — it counts as
  whitespace under CommonMark §2.1 and does NOT prevent type-2 detection.
  `&#x200B;` (U+200B ZERO WIDTH SPACE) does, because it is a non-whitespace
  character per the same spec.

## Related

- `spec/01-spec-authoring-guide/11-root-readme-conventions.md` — Badge
  Layout Rules (the spec itself needs updating to prescribe the
  `&#x200B;` prefix; tracked in `spec/22-app-issues/112-readme-badges-html-comment-leading.md`).
- `mem://constraints/no-static-mockup-badges` — sister rule (no
  static/placeholder badges; this rule governs CONTENT, the present
  rule governs RENDERING).
- `mem://workflow/root-readme-authoring-order` — overall hero ordering.
