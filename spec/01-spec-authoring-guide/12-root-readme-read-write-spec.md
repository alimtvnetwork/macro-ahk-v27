# Root README — Read / Write / Validate Procedure

**Version:** 1.1.0
**Updated:** 2026-04-22
**Status:** Active
**AI Confidence:** Production-Ready
**Ambiguity:** None

---

## Purpose

This document is the **canonical procedure** for any contributor (human or AI agent) who needs to **read, edit, or validate** the repository-root `readme.md`. It complements `11-root-readme-conventions.md` (which defines _what_ a compliant README looks like) by defining _how_ to safely operate on the file end-to-end.

Use this spec when:

- You are about to add, remove, or rewrite any block inside `readme.md`.
- You are auditing the README before a release, after a merge, or after a CI failure of `pnpm run check:readme`.
- You are handing the task off to another AI model and need a self-contained playbook.

---

## 1. File location & invariants

| Property | Value |
|----------|-------|
| Filename | `readme.md` (lowercase, **never** `README.md`) |
| Path | repository root |
| Encoding | UTF-8, LF line endings, no BOM |
| Final newline | exactly one trailing `\n` |
| Authority for structure | [`./11-root-readme-conventions.md`](./11-root-readme-conventions.md) |
| Authority for branding | `mem://branding/author-identity` |
| Authority for forbidden badges | `mem://constraints/no-static-mockup-badges` |

The file is treated as a **first-class artifact** — the only file in the project that visitors and AI agents are guaranteed to read first. Treat every edit as a public release note.

---

## 2. Read procedure (before any edit)

Always perform these reads **in parallel** before mutating the file:

1. **Full file read** — `code--view readme.md` (or `cat readme.md`). Never edit blind.
2. **Structural spec read** — `code--view spec/01-spec-authoring-guide/11-root-readme-conventions.md` (skip if already in current context).
3. **Branding memory read** — `code--view mem://branding/author-identity`.
4. **Forbidden-badge memory read** — `code--view mem://constraints/no-static-mockup-badges`.
5. **Run the checker in JSON mode** to capture the current pass/fail baseline:
   ```bash
   pnpm run check:readme:json
   ```
   Record which checks pass before your edit so you can confirm you did not regress any of them afterwards.

> If `check:readme:json` reports ≥1 failing check **before** your edit, treat that pre-existing failure as part of the work scope unless the user explicitly said otherwise. Never silently leave the README in a worse state.

---

## 3. Write procedure (mutating the file)

### 3.1 Tooling preference

| Change shape | Tool to use |
|--------------|-------------|
| Small edit (≤30 lines, surgical) | `code--line_replace` with explicit `search` + `first_replaced_line` / `last_replaced_line` |
| Mid-size edit (multi-block, same section) | `code--line_replace` with `...` ellipsis between 2-3 identifying lines on each side |
| Large rewrite (whole sections) | `code--write` (full overwrite) |
| Auto-fixable structural drift (missing centered hero / missing License / Author misorder) | `node scripts/repair-readme.mjs --apply --audit` (companion to the checker) |

**Never** use `sed -i`, `awk`, or shell heredocs against `readme.md` from `code--exec`. Those bypass the project's diff/preview pipeline and the git history will be opaque.

### 3.2 Hero-block editing rules

The first ~30 lines (the centered hero `<div>…</div>`) are governed by the strictest invariants. When editing:

1. **Preserve order**: opening `<div align="center">` → logo `<img>` → `# H1` → `> tagline` blockquote → five `<!-- group -->` markers in the fixed order Build & Release / Repo activity / Community / Code-quality / Stack & standards → hero `<img>` → closing `</div>`.
2. **All five group HTML comment markers must remain present**, even if a group is empty. Empty groups must carry an explanatory `<!-- (intentionally empty …) -->` comment **on the same line** as their group marker.
3. **Badge layout is 1–2 visual lines, never 5 stacked rows.** All HTML group markers and their badges sit space-separated on at most two consecutive lines with **no blank line between them**. See `11-root-readme-conventions.md` §"Badge Layout Rules" for the grammar.
4. **No `img.shields.io/badge/…-…-<color>` static mockup badges** (see `mem://constraints/no-static-mockup-badges`).
5. **No badges whose rendered text resolves to** `activate`, `no status`, `not found`, `404`, `repo not found`, `no releases found`, `badge not found`. If shields.io fails for a badge URL, remove the badge entirely — do not leave a broken image.
6. The hero image (last element inside the centering div) stays at `width=820`.

#### Quick recipes for common badge edits

| You want to… | Do this | Don't do this |
|--------------|---------|----------------|
| Add a new live-data badge to the Code-quality group | Locate `<!-- Code-quality -->` marker, insert the new `[![…](shields-url)](link)` **immediately after** the existing badges in that group on the same line, separated by a single space. | Don't push the new badge onto its own line — it will break the 1–2 line layout. |
| Remove a broken/`activate` placeholder badge | Delete just that `[![…](…)](…)` segment plus the leading space. Leave the group marker in place. | Don't delete the `<!-- … -->` group marker too — the checker requires all five. |
| Empty a group entirely (e.g., Codecov was deactivated) | Replace the badges following that group's marker with `<!-- (intentionally empty — <reason>) -->` on the same line as the marker. | Don't insert a `PRs-welcome` or "no status" placeholder to "fill" the group. |
| Reorder groups | **Don't.** The five-marker order is fixed: Build & Release → Repo activity → Community → Code-quality → Stack & standards. | Don't move Stack & standards above Build & Release "for emphasis". |
| Switch from 1-row to 2-row layout | Move the `<!-- Community -->` marker (and everything after it) to a new line. The two rows form one paragraph (no blank line between them). | Don't insert a blank line — that creates two paragraphs and the layout becomes "stacked" again. |

### 3.3 Author / License section editing rules

- The Author H3 (`### [Name](url)`) **must** appear before the Company H3. The repair script's `author-misorder` rule auto-corrects swaps but never restructures content.
- The Company H3 is plain text (`### Riseup Asia LLC`) — never wrap it in a link.
- The License section heading is exactly `## License` (case-sensitive); body must mention the owning legal entity and the license type in one sentence.
- Spelling of `Riseup Asia LLC` must match `mem://branding/author-identity` byte-for-byte.

### 3.4 Atomic-commit guidance

Each `readme.md` mutation should be one logical change per edit (e.g. "remove broken badges", "update tagline", "bump version line"). When multiple unrelated changes are needed, perform them as separate `code--line_replace` calls in parallel; do not bundle into one `code--write` overwrite.

---

## 4. Validate procedure (after every edit)

Run these checks **in this exact order**:

1. **Structural compliance**:
   ```bash
   pnpm run check:readme
   ```
   Must report 18/18 checks passing. If any check regresses vs. the baseline you captured in §2, fix immediately.

2. **Markdown compliance report** (optional but recommended for non-trivial edits):
   ```bash
   pnpm run check:readme:report
   ```
   Writes `.lovable/reports/readme-compliance.md` with side-by-side expected-vs-found tables. Read the report before declaring the edit done.

3. **Auto-repair dry-run** (sanity check — should report `not-needed` for all three rules):
   ```bash
   pnpm run repair:readme
   ```
   If any rule reports `would-apply`, your manual edit drifted from the spec. Inspect, fix manually, or accept the auto-repair via `pnpm run repair:readme:apply`.

4. **Visual smoke test on GitHub** (when published): open the repo on GitHub.com and confirm that:
   - The hero is visually centered.
   - **Zero badges show `activate`, `no status`, `not found`, or `404`.**
   - The hero screenshot renders.
   - The Author and License sections render with correct hierarchy.

> If step 4 reveals a broken badge that step 1 missed, treat it as a checker bug — file a ticket against `scripts/check-readme-compliance.mjs` and add the broken pattern to the forbidden list in `mem://constraints/no-static-mockup-badges`.

---

## 5. Common pitfalls (and the rule that prevents each)

| Pitfall | Prevention rule |
|---------|----------------|
| Adding `[![X](https://img.shields.io/badge/X-yes-brightgreen)](…)` to make a group "look full" | §3.2 #3 — static mockup badges forbidden |
| Adding `Codacy-activate` / `Codecov-activate` placeholder to plan future activation | §3.2 #4 — no `activate` placeholders; activate the service first, then add the live badge |
| Renaming the file to `README.md` (uppercase) | §1 — filename is `readme.md`, all lowercase |
| Bundling unrelated edits into one `code--write` overwrite | §3.4 — atomic commits only |
| Editing the hero without re-running `check:readme` afterwards | §4 step 1 — checker is mandatory after every hero edit |
| Changing `Riseup Asia LLC` casing | §3.3 — branding memory is byte-for-byte authoritative |
| Removing an HTML comment marker because its group is empty | §3.2 #2 — markers are required even for empty groups |

---

## 6. Handoff checklist (before declaring an edit "done")

- [ ] All edits made via `code--line_replace` or `code--write` (no shell `sed`/`awk`).
- [ ] `pnpm run check:readme` returns 18/18.
- [ ] `pnpm run repair:readme` reports `not-needed` for all three rules.
- [ ] Zero `img.shields.io/badge/` URLs inside the hero `<div align="center">…</div>`.
- [ ] Zero badges whose visible text matches any forbidden term (`activate`, `no status`, `not found`, `404`, `repo not found`, `no releases found`).
- [ ] Author H3 precedes Company H3 inside `## Author`.
- [ ] `## License` section present at end of file.
- [ ] Final newline present, no trailing whitespace, LF endings.
- [ ] Compliance markdown report (when generated) committed to `.lovable/reports/readme-compliance.md`.

---

## 7. Cross-References

| Reference | Location |
|-----------|----------|
| README structural conventions | [`./11-root-readme-conventions.md`](./11-root-readme-conventions.md) |
| Compliance checker | [`../../scripts/check-readme-compliance.mjs`](../../scripts/check-readme-compliance.mjs) |
| Auto-repair script | [`../../scripts/repair-readme.mjs`](../../scripts/repair-readme.mjs) |
| Compliance check standard | `mem://standards/readme-compliance-check` |
| Forbidden badge patterns | `mem://constraints/no-static-mockup-badges` |
| Author identity (single source of truth) | `mem://branding/author-identity` |
| Documentation standards | `mem://workflow/documentation-standards` |
| Spec Authoring Guide overview | [`./00-overview.md`](./00-overview.md) |
