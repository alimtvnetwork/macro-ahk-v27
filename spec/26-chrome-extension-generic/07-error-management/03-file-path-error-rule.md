# CODE-RED — File / Path Error Rule

**Version:** 1.0.0
**Updated:** 2026-04-24
**Status:** Authored
**AI Confidence:** High
**Ambiguity:** Low

> *Generic blueprint — no project-specific identifiers. If you find one, file an issue.*

---

## The rule (CODE-RED, no exceptions)

> **Every error that touches a file, a storage key, a database row, an OPFS
> handle, an IndexedDB record, or any addressable resource MUST include all
> three of `path`, `missing`, and `reason`. No exceptions. No "TODO".
> No partial logs. The build, lint, and PR review fail otherwise.**

This is the highest-priority error rule in the blueprint. It exists because
file/path errors are the single most expensive class of bug to diagnose
remotely: without the exact resource identifier, an AI agent or human
reviewer must guess from filenames, breakpoints, and luck. With the three
fields populated, root cause is one log line away.

The rule applies equally to:

- `chrome.storage.local` / `.session` / `.managed` reads and writes
- IndexedDB `get`, `put`, `delete`, transaction errors
- SQLite (sqlite-wasm) `exec`, `prepare`, schema operations
- OPFS `getFileHandle`, `createSyncAccessHandle`, write/flush errors
- `localStorage` TTL bridge envelopes
- Any `fetch` whose URL is the resource identity (rare; prefer NET_ codes)
- Build-time file reads (`fs.readFile`, `fs.stat`) in scripts

---

## What each field means

| Field | Required value | Examples |
|-------|----------------|----------|
| `path` | The exact, unambiguous resource identifier — verbatim, no interpolation drift. | `"chrome.storage.local"`, `"sqlite:Sessions"`, `"opfs:/app.db"`, `"idb:cache/v3/prompts"`, `"/dist/manifest.json"` |
| `missing` | What was expected but absent — never just `"data"`. | `"key:userToken"`, `"row:id=42"`, `"file"`, `"table:Sessions"`, `"column:expiresAt"`, `"index:byTimestamp"` |
| `reason` | Plain-English cause and *why it matters now*, ≤ 140 chars. | `"User preferences must exist after onboarding step 3 completion."` |

The three fields are independent: `path` answers *where*, `missing` answers
*what*, `reason` answers *why now*. All three are mandatory because each one
alone is insufficient for diagnosis.

---

## Path format conventions

Paths follow a **scheme prefix** so log greps and dashboards can route
without parsing:

| Scheme | Used for | Example |
|--------|----------|---------|
| `chrome.storage.local` | `chrome.storage.local` (no prefix needed beyond the API name) | `"chrome.storage.local"` |
| `chrome.storage.session` | session storage | `"chrome.storage.session"` |
| `idb:` | IndexedDB — `idb:<dbName>/<storeName>` | `"idb:appCache/v3/prompts"` |
| `sqlite:` | SQLite — `sqlite:<TableName>` (or `sqlite:<TableName>#<rowSelector>`) | `"sqlite:Sessions#id=42"` |
| `opfs:` | OPFS files — `opfs:/<absolute path>` | `"opfs:/app.db"`, `"opfs:/logs/2026-04.ndjson"` |
| `ls:` | localStorage TTL bridges — `ls:<envelopeKey>` | `"ls:auth.bearerEnvelope"` |
| (none) | Real files on the build host (Node.js scripts only) | `"/dist/manifest.json"` |

**Never interpolate dynamic IDs into the path silently.** If the row ID is
part of the failure identity, append it as `#id=<value>` or carry it in
`context`. This keeps cardinality manageable in dashboards while preserving
diagnostic detail.

---

## `missing` value vocabulary

Use a constrained vocabulary so dashboards can categorise:

| Token | Meaning |
|-------|---------|
| `"file"` | The whole file/handle/blob is absent. |
| `"key:<name>"` | A specific storage key is absent. |
| `"row:<selector>"` | A specific DB row is absent. |
| `"column:<name>"` | A column expected by the reader is absent (schema drift). |
| `"table:<name>"` | A whole table/object-store is absent. |
| `"index:<name>"` | An expected IDB / SQLite index is absent. |
| `"value:<field>"` | The record exists but a required field is null/empty. |
| `"signature"` | Integrity check (hash/checksum/HMAC) failed. |
| `"permission"` | The resource exists but the caller lacks access. |

Multiple missing items collapse to one token plus a `context.missingList`
array of strings.

---

## Enforcement mechanisms

The rule is enforced at four layers; all four MUST be active.

### 1. TypeScript signatures

`AppError.fromFsFailure(...)` declares `path: string` and `missing: string`
as **non-nullable, non-optional**. The compiler refuses any FS-class throw
that omits them. The plain `new AppError(...)` constructor allows `null`
fields for non-FS errors — but the lint rule (below) forbids constructing
storage-prefixed codes that way.

### 2. ESLint custom rule (`no-bare-fs-error`)

```ts
// eslint-plugin-blueprint/rules/no-bare-fs-error.ts
// Reports any `new AppError({ code: "STORAGE_…" | "DB_…" | "IDB_…" |
//   "OPFS_…" | "LS_…" | "MIGRATION_…", … })` where path or missing is
// null, undefined, "", or omitted. Suggests `AppError.fromFsFailure(...)`.
```

Severity: `error`. The zero-warnings policy
(`03-typescript-and-linter/05-zero-warnings-policy.md`) makes this a hard
build break.

### 3. Pre-build validation script

`scripts/check-error-rule.mjs` runs in CI before `vite build`. It greps for
all `AppError` constructions whose code matches the FS prefixes and asserts
non-empty `path` and `missing` literals. Catches dynamic constructions the
lint rule cannot reach (e.g., factory wrappers).

### 4. PR review checklist

The PR template includes an explicit CODE-RED checkbox. Reviewers reject any
diff that introduces an FS-class error without all three fields populated.

---

## Reference patterns

### Storage read miss

```ts
const raw = await chrome.storage.local.get("userPreferences");
if (raw.userPreferences === undefined) {
    throw AppError.fromFsFailure({
        code: "STORAGE_KEY_MISSING",
        path: "chrome.storage.local",
        missing: "key:userPreferences",
        reason: "User preferences must exist after onboarding step 3.",
    });
}
```

### SQLite row absence

```ts
const row = db.exec("SELECT * FROM Sessions WHERE id = ?", [sessionId])[0];
if (!row) {
    throw AppError.fromFsFailure({
        code: "DB_QUERY_FAILED",
        path: `sqlite:Sessions#id=${sessionId}`,
        missing: "row:id",
        reason: "Active session row vanished between dispatch and read.",
        context: { sessionId },
    });
}
```

### OPFS write failure

```ts
try {
    handle.write(buffer);
} catch (cause) {
    throw AppError.fromFsFailure({
        code: "OPFS_WRITE_FAILED",
        path: "opfs:/app.db",
        missing: "value:writeAck",
        reason: "OPFS sync handle rejected the write — likely quota.",
        cause,
    });
}
```

### IndexedDB schema drift

```ts
if (!objectStore.indexNames.contains("byTimestamp")) {
    throw AppError.fromFsFailure({
        code: "IDB_VERSION_MISMATCH",
        path: "idb:appCache/v3/sessions",
        missing: "index:byTimestamp",
        reason: "Migration to v3 did not create the required index.",
    });
}
```

### Build-time file read (Node.js script)

```ts
if (!fs.existsSync(manifestPath)) {
    throw AppError.fromFsFailure({
        code: "BUILD_VALIDATION_FAILED",
        path: manifestPath,             // already an absolute path
        missing: "file",
        reason: "Vite build expected a generated manifest.json in dist/.",
    });
}
```

---

## Common pitfalls

| Pitfall | Why it breaks | Fix |
|---------|---------------|-----|
| `path: "storage"` (vague) | Cannot tell `chrome.storage.local` from IDB or LS. | Use the scheme prefix vocabulary above. |
| `missing: "data"` or `"value"` | Tells the reviewer nothing. | Use the `key:` / `row:` / `column:` vocabulary. |
| Embedding the `reason` inside `path` | Breaks dashboard cardinality and grep. | Keep them separate; `reason` is prose, `path` is identity. |
| Logging the error first, then throwing without the fields | The throw site is the source of truth — the log is a copy. | Construct `AppError` once; let the logger sink read it. |
| Using `fromFsFailure` for non-FS errors just to satisfy types | Pollutes the registry with miscategorised codes. | Use the plain constructor with non-FS codes. |
| Interpolating user-supplied strings into `path` | Cardinality explosion + potential PII leak. | Sanitise to a stable selector; carry the raw value in `context`. |

---

## DO / DO NOT / VERIFY

**DO**
- Use `AppError.fromFsFailure(...)` for every FS / storage / DB / OPFS / IDB / LS error.
- Use the documented scheme prefixes for `path`.
- Use the constrained vocabulary for `missing`.
- Keep `reason` ≤ 140 characters and present-tense.

**DO NOT**
- Throw an FS-class error with `path: null`, `missing: null`, empty strings, or omitted fields.
- Interpolate raw user input into `path`.
- Duplicate the same data across `path`, `missing`, and `reason`.
- Disable the `no-bare-fs-error` lint rule for any reason.

**VERIFY**
- `rg "fromFsFailure\(" src/` count equals the count of FS-class throw sites.
- `rg "code: \"(STORAGE|DB|IDB|OPFS|LS|MIGRATION)_" src/ -A 6` shows non-empty `path` and `missing` for every match.
- `scripts/check-error-rule.mjs` exits with code 0 in CI.
- Diagnostic export `logs.txt` shows all three fields populated for every FS-class entry.
- The ESLint rule `no-bare-fs-error` is enabled at severity `error` in `eslint.config.js`.

---

## Cross-References

| Reference | Location |
|-----------|----------|
| AppError shape | `./01-error-model.md` |
| Code registry & prefixes | `./02-error-code-registry.md` |
| Logger contract | `./04-namespace-logger.md` |
| Diagnostic export | `./07-diagnostic-export.md` |
| Reference implementation | `../12-templates/error-model.template.ts` |
| Zero-warnings policy | `../03-typescript-and-linter/05-zero-warnings-policy.md` |
| Storage layer overview | `../05-storage-layers/00-overview.md` |
