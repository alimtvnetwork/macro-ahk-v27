# CI/CD Issues — Index

> Single summary of every CI/CD failure (build, lint, typecheck, test runner, GitHub Actions, release pipeline). Per-issue files live in `.lovable/cicd-issues/XX-name.md`.
>
> **Rule:** check this index before opening a new file — do not duplicate.
> **Lifecycle:** CI/CD issues stay in this folder even after resolution (they recur). Status flips to `✅ Resolved`. Do **not** move to `.lovable/solved-issues/`.

---

## Active

_None — all known CI/CD issues resolved._

## Resolved

| # | File | Title | Pipeline | Status | Resolved |
|---|---|---|---|---|---|
| 01 | [`01-installer-contract-not-in-ci.md`](./cicd-issues/01-installer-contract-not-in-ci.md) | `check:installer-contract` not wired into installer-tests workflow | `.github/workflows/installer-tests.yml` | ✅ Resolved | 2026-04-24 |

---

## Conventions

- File names: `.lovable/cicd-issues/XX-issue-name.md` (lowercase-hyphenated, numeric prefix starting at `01`).
- Required sections per file: `## Pipeline / Workflow`, `## Description`, `## First Seen`, `## Root Cause`, `## Status`, `## Fix`, `## Prevention`, `## References`.
- Update this index in the **same operation** as creating or modifying any CI/CD issue file.
