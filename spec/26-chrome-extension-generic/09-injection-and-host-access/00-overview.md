# Injection & Host Access

**Version:** 1.0.0
**Updated:** 2026-04-24
**Status:** Placeholder — to be authored
**AI Confidence:** Low (placeholder)
**Ambiguity:** Low

> *Generic blueprint — no project-specific identifiers. If you find one, file an issue.*

---

## Overview

Direct synthesis of the recent token-seeder + diagnostics work. Provides a turnkey recipe so the same host-permission bugs never recur: permission decision tree, restricted scheme list, tab eligibility evaluator, cooldown + blocked-tab diagnostics, and the canonical executeScript MAIN-world seeder.

---

## Files in this folder

| # | File | Description |
|---|------|-------------|
| 01 | [01-host-permissions.md](./01-host-permissions.md) | matches[] vs optional_host_permissions vs activeTab decision tree
| 02 | [02-restricted-schemes.md](./02-restricted-schemes.md) | chrome:// / chrome-extension:// / Web Store / file:// rules
| 03 | [03-tab-eligibility.md](./03-tab-eligibility.md) | url-matcher / project-matcher patterns
| 04 | [04-cooldown-and-blocked-tabs.md](./04-cooldown-and-blocked-tabs.md) | Diagnostics surface + indicator UI
| 05 | [05-token-seeder.md](./05-token-seeder.md) | executeScript MAIN-world seeding pattern with cooldown

---

## Cross-References

| Reference | Location |
|-----------|----------|
| Parent overview | `../00-overview.md` |
| Folder structure rules | `../../01-spec-authoring-guide/01-folder-structure.md` |
