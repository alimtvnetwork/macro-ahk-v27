# Error Management

**Version:** 1.0.0
**Updated:** 2026-04-24
**Status:** Placeholder — to be authored
**AI Confidence:** Low (placeholder)
**Ambiguity:** Low

> *Generic blueprint — no project-specific identifiers. If you find one, file an issue.*

---

## Overview

Defines the AppError shape, the SCREAMING_SNAKE_CASE error code registry, the CODE-RED file/path error rule, the NamespaceLogger contract, the ERROR_COUNT_CHANGED real-time broadcast, stack-trace filtering, and the diagnostic ZIP export bundle.

---

## Files in this folder

| # | File | Description |
|---|------|-------------|
| 01 | [01-error-model.md](./01-error-model.md) | AppError shape (code, severity, path?, missing?, reason, timestamp, stack)
| 02 | [02-error-code-registry.md](./02-error-code-registry.md) | SCREAMING_SNAKE prefixes, allocation rules, registry table
| 03 | [03-file-path-error-rule.md](./03-file-path-error-rule.md) | CODE-RED: every FS error MUST include path/missing/why
| 04 | [04-namespace-logger.md](./04-namespace-logger.md) | <RootNamespace>.Logger.{info,warn,error} contract
| 05 | [05-error-broadcast.md](./05-error-broadcast.md) | ERROR_COUNT_CHANGED real-time UI sync
| 06 | [06-stack-trace-filtering.md](./06-stack-trace-filtering.md) | Drop chunk-*.js / assets/*.js noise
| 07 | [07-diagnostic-export.md](./07-diagnostic-export.md) | ZIP bundle (logs.txt, sessions, manifest snapshot)

---

## Cross-References

| Reference | Location |
|-----------|----------|
| Parent overview | `../00-overview.md` |
| Folder structure rules | `../../01-spec-authoring-guide/01-folder-structure.md` |
