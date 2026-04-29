---
name: README compliance check
description: Standalone validator scripts/check-readme-compliance.mjs enforces the root README structure mandated by spec/01-spec-authoring-guide/11-root-readme-conventions.md, with a companion repair script that auto-fixes the three most common violations.
type: standard
---

`scripts/check-readme-compliance.mjs` validates the repository-root `readme.md` against the rules in `spec/01-spec-authoring-guide/11-root-readme-conventions.md`. It enforces all 18 checks: single H1 (code-fence aware), centered hero `<div>` opened above the H1 with logo image, tagline blockquote under H1, hero `<div>` closed before the first `## section`, all five badge groups (Build & Release ≥5, Repo activity ≥5, Community ≥6, Code-quality ≥3, Stack & standards ≥8) detected by `<!-- comment -->` markers with per-group counts plus an aggregate ≥27 minimum, `## Author` section with centered `### [Name](url)` H3 + role line `**[Primary](url)** | [Secondary](url), [Company](url)` + biography mentioning years-of-experience and a reputation source + 2-column metadata table with empty header, `### <Company>` subsection, and `## License` section with body.

Code fences are stripped before heading detection so example markdown inside ` ```markdown ` blocks does not trigger false positives.

CLI:
- `pnpm run check:readme` — human output
- `pnpm run check:readme:json` — JSON envelope `{ version: 2, ok, file, summary, checks[] }` for CI consumption
- `pnpm run check:readme:report` — additionally writes a Markdown report to `.lovable/reports/readme-compliance.md`

Flags: `--file=<path>` overrides the README path; `--report=<path>` writes a Markdown compliance report (works alongside `--json`). Exit code 1 on any failure. The script intentionally has zero npm dependencies.

**Schema v2 (current):** each check carries `{ id, label, ok, detail, expected, found }`. The `expected` field states the rule in one line; `found` states the actual observed state. The Markdown report renders failed checks first as side-by-side tables, then a full status inventory, then a collapsible passed-checks section. v1 consumers reading only `id/label/ok/detail` remain compatible — the new fields are additive.

## Auto-repair companion

`scripts/repair-readme.mjs` fixes the three most common violations in-place:

1. **`centered-hero`** — wraps the hero block in `<div align="center"> … </div>`. The opening tag is inserted above the first logo `<img>` (or above the H1 if no logo is found); the closing tag is inserted immediately before the first `## ` H2. If only the closing `</div>` is missing (unbalanced opens), only that close is inserted.
2. **`license-section`** — appends a 7-line stub `## License` section pointing at `LICENSE.md` if the heading is missing.
3. **`author-misorder`** — when the Author section contains both an Author H3 (`### [Name](url)`, linked) and a Company H3 (plain text), and the Company appears first, swaps the two H3 sub-blocks back to the mandated order (Author first, Company second).

CLI:
- `pnpm run repair:readme` — dry-run; prints the intended changes and exits 0 without writing.
- `pnpm run repair:readme:apply` — applies repairs in place, writing a `readme.md.bak` backup first.
- `pnpm run repair:readme:audit` — dry-run plus an audit log file (default `.lovable/reports/readme-repair-audit-<ISO>.json`).
- `pnpm run repair:readme:apply:audit` — apply mode plus the same audit log.
- `pnpm run repair:readme:hero-only` / `repair:readme:license-only` / `repair:readme:author-only` — convenience wrappers around `--only=<id>` for running a single rule.
- `pnpm run repair:readme:all` — dry-run across **every** README in the repo via glob `**/readme.md,**/README.md` (skips `node_modules`, `dist`, `build`, `.release`, `skipped`, `.git`, `.cache`, `.next`, `.turbo`, `.lovable`, `coverage`, and `*.bak`). Emits a v2 multi envelope with per-file results and aggregate totals.
- `pnpm run repair:readme:all:apply` — same glob, but applies repairs and writes a single bundled audit log.
- `--json` emits `{ version: 1, file, applied, dryRun, changedBytes, auditLog, repairs[] }` for single-file runs, or `{ version: 2, multi: true, totals, auditLog, results[] }` when more than one file is processed (each entry inside `results[]` follows the v1 schema).
- `--audit[=<path>]` writes a structured JSON audit log of every mutation. Default path is `.lovable/reports/readme-repair-audit-<ISO-timestamp>.json`; pass `--audit=<path>` to override. Audit logs are written for BOTH dry-run and apply modes. In multi-file mode the audit payload is `{ version: 2, kind: "readme-repair-audit-bundle", timestamp, mode, totals, files: [<v1 single-file audit>, …] }`.
- `--only=<ids>` — comma-separated allowlist (`centered-hero`, `license-section`, `author-misorder`). Repairs not in the list are reported with status `skipped` and reason `disabled by --only flag`.
- `--skip=<ids>` — comma-separated blocklist with the same id vocabulary. Disabled repairs report `disabled by --skip flag`. Mutually exclusive with `--only` (passing both fails fast). Unknown ids fail fast with the full valid-id list in the error message.
- `--file=<path>` (repeatable) / `--files=<csv>` — explicit README paths, resolved relative to the repo root. May be combined with `--glob`.
- `--glob=<pattern>` (repeatable, comma-separated) — glob of README files to repair, e.g. `--glob='**/README.md'` or `--glob='docs/**/readme.md,packages/*/readme.md'`. Default ignores: `node_modules`, `dist`, `build`, `.git`, `.release`, `skipped`, `coverage`, `.next`, `.cache`, `.turbo`, `.lovable`, plus all `*.bak` files. Pass `--no-default-ignores` to disable the exclusion list. Defaults to `./readme.md` when neither `--file` nor `--glob` is provided (full backwards compatibility with v1).

### Audit log schema

```
{
  version: 1,
  kind: "readme-repair-audit",
  timestamp,        // ISO 8601 UTC
  file,             // absolute path of the README operated on
  mode,             // "dry-run" | "apply"
  applied,          // boolean — true only when --apply wrote changes
  changedBytes,     // working.length - original.length
  summary: { total, applied, wouldApply, skipped, notNeeded },
  mutations: [{
    id, label, status, preview,
    before: { range: { startLine, endLine }, snippet },
    after:  { range: { startLine, endLine }, snippet },
  }],                        // only repairs that mutated (or would mutate) the file
  allRepairs: [{ id, label, status, reason, preview }]   // full status inventory, no snippets
}
```

Snippets are exact line-range slices (1-indexed, inclusive) capturing the affected region with a small amount of context, suitable for code review and for handoff to other AI models. The `mutations` array intentionally excludes `skipped`/`not-needed` repairs to keep the diff compact; the `allRepairs` array carries the full status inventory.

All repairs are idempotent: re-running `--apply` on an already-compliant file produces zero changes (and an audit log with `mutations: []`). Repairs that cannot be performed safely (ambiguous structure, missing parent section) are reported with status `skipped` and a `reason` field — they are never silently skipped. The script never edits content inside existing badge blocks, code fences, or biography paragraphs.

**Recommended workflow:** run `check:readme` first to discover violations → run `repair:readme:audit` (dry-run + audit log) to preview the auto-fixes with full before/after snippets → run `repair:readme:apply:audit` to write them while persisting the audit log for hand-off → re-run `check:readme` to confirm 18/18.
