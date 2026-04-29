# Issue 94: Migration v2 Fails Because ErrorCodes Table Is Missing

**Version**: v2.193.0
**Date**: 2026-04-22
**Status**: Resolved

---

## Reliability and Failure-Chance Report

- **Confidence**: High
- **Failure class**: Deterministic boot failure during `db-init`
- **Blast radius**: Extension startup blocked for installs that execute migration v2 against a database without an error-code lookup table
- **Regression risk**: Low, because the fix is additive and idempotent (`CREATE TABLE IF NOT EXISTS` + `INSERT OR IGNORE`)

---

## Issue Summary

### What happened

Boot failed during schema migration v2 with:

`no such table: error_codes`

### Where it happened

- **Feature**: Background database initialization
- **Files**:
  - `src/background/migration-v2-sql.ts`
  - `src/background/db-schemas.ts`
  - `src/background/schema-migration.ts`

### Symptoms and impact

- Extension fails at `db-init`
- Boot failure banner shows `MIGRATION_FAILURE v=2`
- User cannot reach normal extension flows until startup succeeds

---

## Root Cause Analysis

### Direct cause

Migration v2 seeded rows into a table named `error_codes`, but the current database schema never created that table.

### Contributing factors

1. The migration used a legacy snake_case table name that violates the current PascalCase database naming convention.
2. The seed SQL used implicit `VALUES (...)` inserts without explicit column names, making the migration more brittle.
3. No schema guard existed to create the lookup table before seeding it.

### Why the existing implementation failed

The background startup path loads the database, then runs pending migrations. When v2 executed its seed statements, SQLite correctly rejected the insert because `error_codes` did not exist in `errors.db`.

---

## Fix Description

### What was changed

1. Added canonical `ErrorCodes` table creation to `ERRORS_SCHEMA`
2. Updated migration v2 to create `ErrorCodes` idempotently before seeding
3. Changed seed inserts from legacy `error_codes` to canonical `ErrorCodes`
4. Added explicit column lists to all v2 seed inserts

### New rule

> **RULE**: Lookup/reference tables used by migrations must exist in the base schema and migrations must seed canonical PascalCase table names only.

### Why this resolves the issue

Both fresh installs and existing databases now have an idempotent path to ensure `ErrorCodes` exists before v2 inserts execute. The startup failure path is removed because the table is guaranteed to exist before seeding.

---

## Prevention and Non-Regression

### Acceptance criteria

1. Fresh boot creates `ErrorCodes` and completes migration v2 successfully
2. Existing databases missing `ErrorCodes` recover on next startup without `no such table` errors
3. Error-code seed rows insert safely via `INSERT OR IGNORE`
4. Extension build and type checks pass after the schema update

### Guardrails

- Keep database entities in PascalCase only
- Use explicit insert column lists for seed data
- Ensure lookup tables referenced by migrations are also part of the base schema

---

## Done Checklist

- [x] Root cause confirmed from code and boot report
- [x] Spec written before implementation
- [x] Schema updated to include `ErrorCodes`
- [x] Migration v2 updated to seed the canonical table safely
- [x] Version bumped to v2.193.0