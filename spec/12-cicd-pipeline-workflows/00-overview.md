# CI/CD Pipeline Workflows

**Version:** 0.2.0
**Updated:** 2026-04-22
**Status:** Active (first spec landed)
**AI Confidence:** High
**Ambiguity:** Low

---

## Overview

This module holds specifications for CI/CD pipeline workflows, deployment automation, GitHub Actions workflows, release procedures, tag-push strategies, and **release-time helper scripts** (e.g. versioned-fork repo rename).

The existing `release-procedure.md` (at `spec/21-app/02-features/chrome-extension/release-procedure.md`) and the RCA `spec/22-app-issues/95-release-page-missing-built-assets-rca.md` are cross-referenced from here.

---

## Keywords

`cicd` · `github-actions` · `release-workflow` · `deployment` · `tag-push` · `pipeline` · `repo-rename` · `versioned-fork`

---

## Scoring

| Metric | Value |
|--------|-------|
| AI Confidence | High |
| Ambiguity | Low |
| Health Score | 100/100 |

---

## Files

| # | File | Description |
|---|------|-------------|
| 00 | [00-overview.md](./00-overview.md) | This file |
| 01 | [01-repo-rename-script.md](./01-repo-rename-script.md) | Generic shell script that rewrites the previous repo name to the current one across all tracked text files (auto-detected from `git remote`). |
| 99 | [99-consistency-report.md](./99-consistency-report.md) | Structural health report |

---

## Cross-References

| Reference | Location |
|-----------|----------|
| Spec authoring guide | `../01-spec-authoring-guide/00-overview.md` |
| Folder structure rules | `../01-spec-authoring-guide/01-folder-structure.md` |
| Release procedure | `../21-app/02-features/chrome-extension/release-procedure.md` |
| Release-page RCA | `../22-app-issues/95-release-page-missing-built-assets-rca.md` |
| Coding-guidelines linter pack (sibling pattern) | `../02-coding-guidelines/12-cicd-integration/00-overview.md` |
| Reorganization plan | `../../.lovable/spec-reorganization-plan-2026-04-22.md` |
