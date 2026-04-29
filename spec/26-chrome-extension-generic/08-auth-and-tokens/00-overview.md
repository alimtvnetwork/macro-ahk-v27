# Auth & Tokens

**Version:** 1.0.0
**Updated:** 2026-04-24
**Status:** Placeholder — to be authored
**AI Confidence:** Low (placeholder)
**Ambiguity:** Low

> *Generic blueprint — no project-specific identifiers. If you find one, file an issue.*

---

## Overview

Generic bearer-token bridge: single-path getBearerToken(), unified 10-second readiness gate, sequential fail-fast (no retry / no exponential backoff), and the host-permission failure recovery the recent token-seeder issue exposed.

---

## Files in this folder

| # | File | Description |
|---|------|-------------|
| 01 | [01-bearer-token-bridge.md](./01-bearer-token-bridge.md) | Single getBearerToken() path, no fallbacks
| 02 | [02-readiness-gate.md](./02-readiness-gate.md) | Unified 10s budget pattern
| 03 | [03-no-retry-policy.md](./03-no-retry-policy.md) | Sequential fail-fast — no recursive retry / backoff
| 04 | [04-host-permission-failures.md](./04-host-permission-failures.md) | 'Cannot access contents of the page' recovery

---

## Cross-References

| Reference | Location |
|-----------|----------|
| Parent overview | `../00-overview.md` |
| Folder structure rules | `../../01-spec-authoring-guide/01-folder-structure.md` |
