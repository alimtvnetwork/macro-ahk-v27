---
name: Spec-link checker config
description: Behaviour of `scripts/check-spec-links.mjs` and `scripts/report-spec-links-ci.mjs` is driven by `scripts/check-spec-links.config.json`. Auto-resolve fallback downgrades fixable broken links from ERROR to WARNING.
type: feature
---

# Spec-Link Checker — Config-Driven + Auto-Resolve

## Single source of truth

All scan/exclude/auto-resolve behaviour lives in
**`scripts/check-spec-links.config.json`**. To add an archive folder or tune
the auto-resolver, edit the JSON — no JS changes.

| Field | Purpose |
|---|---|
| `scanRoots` | Repo-relative dirs scanned for `.md` (default `["spec"]`). |
| `excludeDirs` | Directory NAMES skipped during scan (default `["99-archive","imported"]`). |
| `autoResolve.enabled` | When `true`, broken links with a confident replacement match are downgraded from ERROR to WARNING (build still passes). Default `true`. |
| `autoResolve.minScore` | Minimum suffix-overlap score (default `1` = basename match). |
| `autoResolve.searchRoots` | Roots indexed for replacement candidates (default `["spec",".lovable"]`). |

Underscore-prefixed keys (`_doc`, `_excludeDirsNote`, …) in the JSON file are
inline documentation and are stripped at runtime. Malformed config falls back
to built-in defaults with a `WARN` (never crashes the build).

## Shared core module

`scripts/lib/spec-links-core.mjs` houses the shared parser, exclude logic, and
the suffix-overlap auto-resolver. **All three scripts** (`check-spec-links`,
`report-spec-links-ci`, `rewrite-spec-links`) MUST import from here — drift
between local parsers caused historical false-greens in CI.

## Auto-resolve algorithm

For each broken link the CI checker:
1. Builds a basename → absolute-path index across `autoResolve.searchRoots`.
2. Scores every basename match against the broken target via trailing
   path-segment overlap (numeric-prefix swaps like `06-` ↔ `10-` score 0.9).
3. Accepts the top candidate iff `score ≥ minScore` AND it strictly beats
   the runner-up. Ambiguous (tied) matches stay as hard errors — never
   silently picks the wrong target.

Output for each auto-resolved link: shows the `suggested:` absolute path and a
ready-to-paste `rewrite:` (relative form). Run
`pnpm check:spec-links:rewrite:apply` to commit.

## NPM scripts

| Script | Behaviour |
|---|---|
| `check:spec-links` | Local, baseline-aware. Pre-existing breaks pass; new ones fail. |
| `check:spec-links:strict` | Ignore baseline; fail on ANY break. |
| `check:spec-links:ci` | CI checker. Auto-resolve ON by default (per config). |
| `check:spec-links:ci:strict` | CI checker with `--no-auto-resolve` (legacy contract). |
| `check:spec-links:rewrite[:apply]` | Auto-rewriter (dry-run / write). |

## Exit codes (CI script)

| Code | Meaning |
|---|---|
| 0 | All links resolve, possibly via auto-resolve fallback. |
| 1 | At least one truly-missing or ambiguous broken link. |
| 2 | Usage error (missing scanRoots dir). |

## Why this design

- **Adding archives is a JSON edit** — historically required code changes in
  two places that drifted out of sync.
- **Auto-resolve is opt-in via config**, not a CLI dance — local devs and CI
  share the same defaults.
- **Confident-only matching** — ambiguous basenames stay as errors so the
  fallback never lies about what's reachable.
