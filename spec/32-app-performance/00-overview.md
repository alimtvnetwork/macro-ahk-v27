# App Performance + Testing

**Version:** 1.0.0
**Updated:** 2026-04-26
**Status:** Planned (Phase 01 of 12 complete in companion `31-macro-recorder/`)
**AI Confidence:** Medium
**Ambiguity:** Low

---

## Overview

Companion module to `../31-macro-recorder/`. Tracks performance hotspots,
bundle improvements, and end-to-end testing coverage gaps committed
alongside the recorder build.

Phase 02 of the 12-phase plan delivers `01-performance-findings.md` and
`02-testing-findings.md`. Subsequent phases extend this folder as fixes
land.

---

## Keywords

`performance` · `e2e-testing` · `vitest` · `playwright` · `bundle-analysis`

---

## Scoring

| Metric | Value |
|--------|-------|
| AI Confidence | Medium |
| Ambiguity | Low |
| Health Score | 100/100 |

---

## Files

| # | File | Description |
|---|------|-------------|
| 00 | [00-overview.md](./00-overview.md) | This index |
| 99 | [99-consistency-report.md](./99-consistency-report.md) | Module health snapshot |

Future files (added in Phase 02 onward):

| Phase | Planned File |
|-------|--------------|
| 02 | `01-performance-findings.md` |
| 02 | `02-testing-findings.md` |
| 12 | `03-final-perf-pass.md` |

---

## Cross-References

| Reference | Location |
|-----------|----------|
| Macro recorder (driver) | `../31-macro-recorder/00-overview.md` |
| Phase plan | `../31-macro-recorder/02-phases.md` |
| Existing E2E suite | `../../tests/e2e/` |
| Vitest setup | `../../vitest.config.ts` |
