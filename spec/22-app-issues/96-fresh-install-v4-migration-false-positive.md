# Issue 96: Fresh Install Triggers Legacy v4 snake_case Rename Migration

**Version**: v2.194.0
**Date**: 2026-04-22
**Status**: Resolved

---

## Reliability and Failure-Chance Report

- **Confidence**: High
- **Failure class**: Deterministic boot failure during `db-init` on fresh installs or installs with missing schema-version metadata
- **Blast radius**: Extension startup blocked before UI becomes usable
- **Regression risk**: Low, because the fix only changes migration eligibility and adds schema-aware guards for legacy rename statements

---

## Issue Summary

### What happened

Boot failed during schema migration v4 with:

`no such column: "started_at"`

### Where it happened

- **Feature**: Background database initialization and schema migration
- **Files**:
  - `src/background/schema-migration.ts`
  - `src/background/db-manager.ts`
  - `src/background/migration-v4-sql.ts`

### Symptoms and impact

- Fresh installs executed the v4 snake_case → PascalCase migration even though the base schema already uses PascalCase
- Startup aborted at `db-init`
- The boot report incorrectly suggested an old-database inconsistency when the real problem was migration eligibility

---

## Root Cause Analysis

### Direct cause

The migration runner defaulted the schema version to `1` whenever `chrome.storage.local["marco_schema_version"]` was missing. On a fresh install, the database bootstrap already creates tables in PascalCase (`StartedAt`, `SessionId`, etc.), but the runner still treated that database as version 1 and executed v4 rename SQL meant only for legacy snake_case databases.

### Contributing factors

1. Schema version truth lived only in storage metadata, not in the actual live database shape.
2. Fresh database bootstrap created the latest schema immediately, while migrations were still replayed from older versions.
3. The v4 rename runner only ignored duplicate/existing-object errors; it did not guard against the source column being absent because the table was already modern.
4. The in-memory fallback path initialized `errors.db` with `ERRORS_SCHEMA` instead of `FULL_ERRORS_SCHEMA`, which made the fallback path inconsistent with OPFS/storage bootstraps.

### Why the existing implementation failed

For a fresh install, `loadOrCreateFromOpfs()` or `loadFromStorage()` created `Sessions` with `StartedAt`. The migration runner then read no stored schema version, assumed version `1`, and ran:

`ALTER TABLE Sessions RENAME COLUMN started_at TO StartedAt`

SQLite correctly rejected that statement because `started_at` never existed in the freshly created database.

---

## Fix Description

### What was changed

1. `readSchemaVersion()` now inspects the live database schema when stored version metadata is missing and infers the correct current version instead of blindly returning `1`
2. The inferred version is persisted back to `chrome.storage.local` to heal missing metadata permanently
3. v4 rename execution now checks whether each legacy source column actually exists before attempting `ALTER TABLE ... RENAME COLUMN ...`
4. The in-memory fallback now initializes `errors.db` with `FULL_ERRORS_SCHEMA` so all boot paths create the same canonical schema

### New rule

> **RULE**: Never decide migration eligibility from missing storage metadata alone when the live SQLite schema can prove a newer version already exists.

### Why this resolves the issue

Fresh installs now infer the live schema as already modern, persist that repaired version metadata, and skip v4 entirely. Legacy databases still run v4, but only for columns that actually exist in snake_case.

---

## Prevention and Non-Regression

### Acceptance criteria

1. Fresh installs do not run snake_case rename SQL against PascalCase tables
2. Missing `marco_schema_version` metadata is repaired automatically from live schema inspection
3. Legacy databases with snake_case columns still migrate successfully to PascalCase
4. All initialization paths (OPFS, storage, memory) create consistent `errors.db` schema
5. Type checks pass after the migration runner update

### Guardrails

- Infer version from the database shape before replaying historical migrations
- Guard rename migrations by checking for the legacy source column first
- Keep fresh-bootstrap schema and fallback bootstrap schema identical

---

## Done Checklist

- [x] Root cause confirmed from the boot report and migration runner code
- [x] False-positive fresh-install migration path identified
- [x] Live schema inference added for missing version metadata
- [x] v4 rename runner guarded against absent snake_case source columns
- [x] In-memory schema bootstrap aligned with canonical `FULL_ERRORS_SCHEMA`
- [x] Version bumped to v2.194.0
