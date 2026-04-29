# Issue 112: README badges render as raw text when badge line starts with HTML comment inside `<div align="center">`

**Version**: v2.230.0
**Date**: 2026-04-28
**Status**: Resolved

---

## Issue Summary

### What happened

The repository-root `readme.md` hero block rendered every shields.io
badge as **raw markdown text** on github.com instead of as badge
images. Lines 1–8 (centering `<div>`, logo `<img>`, H1 title,
blockquote tagline) rendered correctly; the breakage began at the
badge paragraph (line 9) and ran to the end of the centered hero
`<div>`.

Visible failure mode: the README showed literal text
`[![CI](https://img.shields.io/.../ci.yml?...)](https://github.com/.../actions/workflows/ci.yml)`
instead of the rendered CI badge image, and the same for every
subsequent badge.

### Where it happened

- **Feature**: Repository-root README hero badge area.
- **Files**: `readme.md` (lines 9–10 — the badge paragraph inside the
  `<div align="center">` block).
- **Functions**: N/A (markdown rendering, no application code).
- **Tooling impacted**: `scripts/check-readme-compliance.mjs`
  (passed locally because it is a structural checker, not a render
  checker — see "Why the checker missed it" below).

### Symptoms and impact

- Public repository landing page looked broken on github.com
  (raw markdown text dump instead of badges).
- First-impression damage to a public-facing project — the very
  block that signals "this project is healthy / built / licensed"
  was the block that visibly broke.
- Repeat regression: this is at least the third time this exact
  symptom has appeared, despite the existing
  `mem://constraints/no-static-mockup-badges` rule and the
  `check-readme-compliance.mjs` gate.

### How it was discovered

User screenshot of github.com showing the README rendering with raw
`[![alt](src)](url)` text in place of every badge image.

---

## Root cause

GitHub's CommonMark/GFM implementation (cmark-gfm) treats a paragraph
inside a raw-HTML block (`<div align="center">…</div>`) as
**HTML block type 2** (CommonMark §4.6) when the paragraph's first
non-whitespace token is `<!--`. While the line is parsed as a
type-2 HTML block, **markdown image-link syntax `[![alt](src)](url)`
is NOT parsed** — every badge token on that line is emitted as
literal text.

The intuition that "the inline `-->` closes the type-2 block, so the
rest of the line should be parsed as markdown" does NOT hold inside
a nested raw-HTML container (`<div align="center">`). Once cmark-gfm
enters HTML-block mode for the paragraph, it stays in that mode for
the whole paragraph, regardless of inline `-->` closers.

The two badge lines that broke were:

```
<!-- Build & Release --> [![CI](…)](…) <!-- Repo activity --> [![Issues](…)](…) [![Pull Requests](…)](…) [![Repo Size](…)](…)
<!-- Community --> <!-- (intentionally empty …) --> <!-- Code-quality --> [![Security Issues](…)](…) [![Dependency PRs](…)](…) <!-- Stack & standards --> [![License](…)](…)
```

Both lines satisfy the trigger: first non-whitespace token = `<!--`,
inside a raw-HTML container. Hence both lines were emitted as raw
text and every `[![…](…)](…)` on them became literal text.

### Why the checker missed it

`scripts/check-readme-compliance.mjs` is a **structural** checker —
it parses the markdown source, counts `<!-- Group -->` markers, and
counts `![alt](src)` regex matches per group. It does NOT run the
source through cmark-gfm and does NOT verify that the badges actually
render as images on github.com. So a file that satisfies all 18
structural checks can still render as raw text. This is a real gap
that should be tracked separately (see "Follow-ups" below).

### Why the spec example reproduced the bug

The spec at
`spec/01-spec-authoring-guide/11-root-readme-conventions.md`
§"Badge Layout Rules" v2.1.0 shows the exact same form
(`<!-- Build & Release --> [![CI](…)](…) …`) as the canonical
grammar — so contributors faithfully following the spec reproduce
the bug. The spec is the proximate cause of the regression
repeating.

---

## Resolution

Prefix every badge line in the centered hero with the zero-width-space
HTML entity `&#x200B;` (U+200B) so the line does NOT start with
`<!--`:

```
&#x200B;<!-- Build & Release --> [![CI](…)](…) <!-- Repo activity --> [![Issues](…)](…) …
&#x200B;<!-- Community --> <!-- (intentionally empty …) --> <!-- Code-quality --> [![Sec](…)](…) <!-- Stack & standards --> [![License](…)](…)
```

Why this works:

- `&#x200B;` is a **non-whitespace** character per CommonMark §2.1
  (the spec lists only U+0009, U+000A, U+000B, U+000C, U+000D, U+0020
  as whitespace; U+200B is not in that set).
- Because the line's first non-whitespace token is now `&#x200B;`
  (an inline character entity), not `<!--`, the HTML-block-type-2
  trigger does not fire.
- The paragraph is therefore parsed as a normal markdown paragraph,
  the `<!-- … -->` comments are stripped from the rendered output as
  inline HTML comments, and the badges parse and render correctly.
- `&#x200B;` is invisible in the rendered output, so the centered
  hero looks pixel-identical to the intended layout.
- `scripts/check-readme-compliance.mjs` continues to pass 18/18 —
  the leading entity does not interfere with the marker-bounded
  group scan (verified post-fix).

### Why NOT alternative fixes

- **`&nbsp;` (`\u00A0`) prefix** — counts as whitespace under some
  legacy interpretations and renders as a visible non-breaking space
  in some contexts. Less reliable than U+200B.
- **Move HTML comments to the END of each line** — the compliance
  checker scans "from this marker until the NEXT marker", so trailing
  markers misattribute badges to the WRONG group and the checker
  fails. Verified empirically.
- **Collapse all 7 badges + 5 markers onto a single line** — the
  line becomes >700 characters and other GFM edge cases (link-
  reference resolution token budget, paragraph-bailout heuristics)
  start firing intermittently.
- **Drop the HTML comment markers entirely** — the compliance
  checker requires all 5 `<!-- Group -->` markers and uses them to
  enforce per-group badge floors. Dropping them breaks the
  enforcement gate that exists precisely to prevent the
  static-mockup-badge regression
  (`mem://constraints/no-static-mockup-badges`).

---

## Follow-ups

1. **Update the spec** —
   `spec/01-spec-authoring-guide/11-root-readme-conventions.md`
   §"Badge Layout Rules" must prescribe the `&#x200B;` line-prefix
   in its canonical example, and explicitly call out the
   raw-HTML-mode trigger as the documented reason. Without this,
   future contributors will keep regenerating the bug from the
   spec example.
2. **Tighten the checker** — `scripts/check-readme-compliance.mjs`
   should add a structural rule: "every line in the centered hero
   that contains a `<!--` MUST be prefixed by `&#x200B;` or start
   with a markdown image link". This catches the regression at PR
   time instead of on github.com.
3. **Optional render verification** — consider piping `readme.md`
   through `cmark-gfm` (or a small Node binding) inside the same
   checker and asserting that the raw badge URL strings do NOT
   appear in the rendered HTML output. This would catch the next
   class of GFM-only quirks even if the structural rule above is
   bypassed somehow.

---

## Related

- `mem://constraints/readme-badge-html-comment-leading` — sister
  memory rule that captures the root cause for fast lookup by
  future agents.
- `mem://constraints/no-static-mockup-badges` — governs badge
  CONTENT (no static placeholders); the present issue governs
  badge RENDERING (raw-HTML mode trigger).
- `mem://workflow/root-readme-authoring-order` — overall hero
  ordering convention.
- `spec/01-spec-authoring-guide/11-root-readme-conventions.md`
  — README structural spec (must be updated per Follow-up #1).
- `scripts/check-readme-compliance.mjs` — structural checker
  (must be tightened per Follow-up #2).