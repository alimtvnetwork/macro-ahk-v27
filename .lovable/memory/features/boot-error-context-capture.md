---
name: Boot Error Context Capture
description: Capturing exact failing SQL statement and migration step on db-init failures and surfacing them in the BootFailureBanner with a copyable code block
type: feature
---

# Boot Error Context Capture (v2.175.0+)

## Problem

When `db-init` failed, the popup showed only `Boot failed at step: db-init` plus the surface error message. Users had to dig through the service worker console (often unavailable mid-failure) to find which SQL statement or which migration step actually broke.

## Tagged-error pipeline

Two failure sites now wrap their errors with a structured tag prefix that `setBootError()` parses into `BootErrorContext`:

### 1. `schema-migration.ts` — `applySingleMigration`

- `runIgnoringDuplicates()` records each statement into module-level `lastAttemptedSql` BEFORE running it. Duplicate-column / "already exists" errors are still swallowed; everything else re-throws so the migration wrapper can attach context.
- `applySingleMigration()` catches, then re-throws as:
  ```
  [MIGRATION_FAILURE v=8 step="Add AssetVersion table"]
    SQL: CREATE TABLE AssetVersion (…);
    Reason: <original message>
  ```

### 2. `db-manager.ts` — `runSchemaWithIsolation`

- Replaces the old `db.run(FULL_LOGS_SCHEMA)` blob call inside `initInMemory()`.
- Splits the schema on `;`, runs each statement individually, and on failure throws:
  ```
  [SCHEMA_INIT_FAILURE scope="logs:memory"] SQL: CREATE INDEX …;
    Reason: <original message>
  ```

## Parsing → BootErrorContext

`boot-diagnostics.ts → parseBootErrorContext()` runs on every `setBootError()` call. It matches either tag with regex and extracts:

```ts
interface BootErrorContext {
  sql: string | null;                  // verbatim failing statement
  migrationVersion: number | null;     // e.g. 8
  migrationDescription: string | null; // e.g. "Add AssetVersion table"
  scope: string | null;                // "migration-up" | "logs:memory" | …
}
```

Returns `null` when no recognised tag is present so the banner falls back to the generic stack-trace presentation.

## Surfacing

- `getBootErrorContext()` exported from `boot-diagnostics.ts`
- `status-handler.ts` includes it in `GET_STATUS.bootErrorContext`
- `StatusResponse.bootErrorContext` typed in `shared/messages.ts`
- `Popup.tsx` passes it to `<BootFailureBanner bootErrorContext={…} />`
- The banner renders a dedicated **"Failing operation"** block with:
  - Pills for migration version, step description, and scope
  - **Copyable SQL snippet** (syntax-aware `<pre>` + dedicated "Copy SQL" button)
  - Full bundle still available via the existing "Copy report" button

## Report bundle additions

The plain-text report from `Copy report` now includes a new `── Failing operation ─────` block listing migration version, step description, scope, and the failing SQL (indented) — printed only when structured context exists.
