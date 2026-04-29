# Testing & QA

**Version:** 1.0.0
**Updated:** 2026-04-24
**Status:** Placeholder — to be authored
**AI Confidence:** Low (placeholder)
**Ambiguity:** Low

> *Generic blueprint — no project-specific identifiers. If you find one, file an issue.*

---

## Overview

Defines unit testing with Vitest (jsdom + fake-indexeddb + fake chrome API), end-to-end testing with Playwright in MV3 persistent-context mode, snapshot testing for Options + Popup, and the non-regression rules registry (every fixed bug → 1 test).

---

## Files in this folder

| # | File | Description |
|---|------|-------------|
| 01 | [01-vitest-unit.md](./01-vitest-unit.md) | Vitest setup, fake chrome API, fake-indexeddb, MSW
| 02 | [02-playwright-e2e.md](./02-playwright-e2e.md) | MV3 persistent context, service-worker handle, options/popup pages
| 03 | [03-snapshot-testing.md](./03-snapshot-testing.md) | Options + Popup snapshot patterns
| 04 | [04-non-regression-rules.md](./04-non-regression-rules.md) | Every fixed bug → 1 test (registry table)

---

## Cross-References

| Reference | Location |
|-----------|----------|
| Parent overview | `../00-overview.md` |
| Folder structure rules | `../../01-spec-authoring-guide/01-folder-structure.md` |
