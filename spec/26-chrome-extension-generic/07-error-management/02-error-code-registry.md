# Error Code Registry

**Version:** 1.0.0
**Updated:** 2026-04-24
**Status:** Authored
**AI Confidence:** High
**Ambiguity:** Low

> *Generic blueprint — no project-specific identifiers. If you find one, file an issue.*

---

## Concept

Every `AppError` carries a stable `code` string. Codes are the **public
identity** of a failure mode: dashboards, support docs, log greps, and unit
test assertions all key off them. Once published, a code MUST NOT change
meaning — only be deprecated and replaced.

The registry enforces three rules:

1. **One code per failure mode.** Two callsites that mean the same thing share
   one code. Two callsites with different recovery paths get distinct codes.
2. **Prefix-namespaced.** Each code starts with a registered subsystem prefix
   (`AUTH_`, `STORAGE_`, `DB_`, …). The prefix routes UI badges, log sinks,
   and diagnostic categories.
3. **No silent additions.** Adding a code requires appending a row to the
   table in this file *and* a passing unit test that constructs the error.

---

## Format & naming rules

- **Casing:** `SCREAMING_SNAKE_CASE`. ASCII letters, digits, and underscore only.
- **Shape:** `<PREFIX>_<NOUN>_<VERB_OR_STATE>` — e.g. `AUTH_TOKEN_MISSING`,
  `STORAGE_QUOTA_EXCEEDED`, `INJECTION_HOST_BLOCKED`.
- **Length:** ≤ 48 characters. Long codes resist greppability and break
  fixed-width log columns.
- **No version numbers, no dates, no ticket IDs.** Codes are stable identities,
  not changelogs. Use `context` for episodic data.
- **No project names or brand strings.** The registry is generic; project-
  specific failures inherit a generic code and discriminate via `context`.

---

## Subsystem prefix allocation

| Prefix | Subsystem | Owner folder | Severity hint |
|--------|-----------|--------------|---------------|
| `BOOT_` | Service worker / install / lifecycle | `04-architecture` | `fatal` |
| `MANIFEST_` | MV3 manifest / permissions parsing | `02-folder-and-build` | `fatal` |
| `MSG_` | Message relay (background ↔ content ↔ page) | `04-architecture` | `error` |
| `WORLD_` | ISOLATED ↔ MAIN world bridging | `04-architecture` | `error` |
| `STORAGE_` | `chrome.storage.local` & `.session` | `05-storage-layers` | `error` |
| `IDB_` | IndexedDB caches | `05-storage-layers` | `error` |
| `DB_` | SQLite (sqlite-wasm + OPFS) | `05-storage-layers` | `error` |
| `OPFS_` | Origin-Private File System direct access | `05-storage-layers` | `error` |
| `LS_` | localStorage TTL bridges | `05-storage-layers` | `warn` |
| `MIGRATION_` | Schema / config migration runner | `05-storage-layers` | `error` |
| `AUTH_` | Bearer token resolution & readiness gate | `08-auth-and-tokens` | `error` |
| `BRIDGE_` | Auth bridge recovery & session refresh | `08-auth-and-tokens` | `warn` |
| `INJECTION_` | Script injection pipeline & host access | `09-injection-and-host-access` | `error` |
| `HOST_` | Host permission checks & restricted schemes | `09-injection-and-host-access` | `warn` |
| `SEEDER_` | Token seeder / cooldown / blocked tabs | `09-injection-and-host-access` | `warn` |
| `UI_` | Options / popup / injected controller errors | `06-ui-and-design-system` | `warn` |
| `CFG_` | Build-time config / instruction.ts emission | `04-architecture` | `error` |
| `BUILD_` | Vite / packaging / zip contract failures | `11-cicd-and-release` | `fatal` |
| `TEST_` | Vitest / Playwright harness errors | `10-testing-and-qa` | `error` |
| `NET_` | Outbound `fetch` / API failures | (any) | `warn` |
| `INTERNAL_` | Invariant violations, "should never happen" | (any) | `fatal` |

> **Prefix invariants:** every prefix ends with one underscore. Two-prefix
> codes (e.g. `AUTH_BRIDGE_…`) are forbidden — pick the closer subsystem and
> use `context.subSystem` to disambiguate.

---

## Allocation procedure

1. **Pick the prefix** from the table above. If none fit, propose a new prefix
   in the same PR; do not invent ad-hoc prefixes inline.
2. **Search the registry table below** for an existing match. Reuse if the
   recovery path is identical.
3. **Choose the noun + state.** Prefer present-tense verbs or terminal states:
   `MISSING`, `EXPIRED`, `EXCEEDED`, `BLOCKED`, `REJECTED`, `CORRUPTED`.
4. **Append a row** to the registry table with the severity, description, and
   the file path of the throw site.
5. **Write a unit test** in `tests/error-codes.spec.ts` that constructs the
   `AppError` and asserts the code shape — guards against typos.
6. **Bump the registry version** in this file's frontmatter (semver minor for
   additions, major for removals or meaning changes).

Removing a code requires an explicit deprecation cycle: mark with
`status: "deprecated"`, leave for one minor release, then delete with a major
bump.

---

## Canonical code registry

The table below is the seed registry. Project-specific blueprints copy this
list verbatim and append rows for new failure modes.

| Code | Severity | Description | Typical throw site |
|------|----------|-------------|--------------------|
| `BOOT_INIT_FAILED` | fatal | Service worker `onInstalled` handler raised before lifecycle phase 2 completed. | `src/background/lifecycle.ts` |
| `BOOT_PHASE_TIMEOUT` | fatal | Lifecycle phase exceeded its budget (default 10s). | `src/background/lifecycle.ts` |
| `MANIFEST_PERMISSION_MISSING` | fatal | A required permission is not declared in `manifest.json`. | `src/background/preflight.ts` |
| `MSG_RELAY_TIMEOUT` | error | Message relay round-trip exceeded the 5s default. | `src/messaging/client.ts` |
| `MSG_UNKNOWN_TYPE` | error | Receiver got a message type not in the registry. | `src/messaging/router.ts` |
| `WORLD_BRIDGE_UNAVAILABLE` | error | MAIN-world SDK was called before the page bridge attached. | `src/sdk/page-bridge.ts` |
| `STORAGE_KEY_MISSING` | error | `chrome.storage.local` lookup returned `undefined` for a required key. | `src/storage/chrome-local.ts` |
| `STORAGE_QUOTA_EXCEEDED` | error | `chrome.storage` write rejected with `QuotaExceededError`. | `src/storage/chrome-local.ts` |
| `STORAGE_WRITE_FAILED` | error | `chrome.storage.local.set` rejected for a non-quota reason. | `src/storage/chrome-local.ts` |
| `IDB_OPEN_FAILED` | error | `indexedDB.open` raised — usually private-browsing or quota. | `src/storage/idb.ts` |
| `IDB_VERSION_MISMATCH` | error | Stored DB version is newer than the runtime expects. | `src/storage/idb.ts` |
| `IDB_TX_ABORTED` | error | Transaction aborted before commit (quota, browser shutdown). | `src/storage/idb.ts` |
| `DB_OPEN_FAILED` | fatal | sqlite-wasm could not open the OPFS file. | `src/storage/sqlite.ts` |
| `DB_QUERY_FAILED` | error | SQL execution rejected (syntax, constraint, type). | `src/storage/sqlite.ts` |
| `DB_SCHEMA_DRIFT` | fatal | Live schema differs from the declared `JsonSchemaDef`. | `src/storage/sqlite-schema.ts` |
| `OPFS_WRITE_FAILED` | error | OPFS `createSyncAccessHandle` write rejected. | `src/storage/opfs.ts` |
| `LS_BRIDGE_EXPIRED` | warn | TTL bridge envelope older than its declared cap. | `src/storage/ls-bridge.ts` |
| `LS_BRIDGE_CORRUPTED` | warn | TTL bridge envelope failed schema validation. | `src/storage/ls-bridge.ts` |
| `MIGRATION_RUN_FAILED` | error | A schema migration step threw mid-run. | `src/storage/migrations.ts` |
| `MIGRATION_LOCK_TIMEOUT` | error | Concurrent activation lock not released within budget. | `src/storage/migrations.ts` |
| `AUTH_TOKEN_MISSING` | error | Bearer resolver returned null after the readiness gate. | `src/auth/get-bearer-token.ts` |
| `AUTH_TOKEN_EXPIRED` | warn | Cached token past its `exp` claim — refresh required. | `src/auth/get-bearer-token.ts` |
| `AUTH_GATE_TIMEOUT` | error | Readiness gate exceeded the 10s unified budget. | `src/auth/readiness-gate.ts` |
| `BRIDGE_RECOVER_FAILED` | warn | Auth bridge recovery exhausted its single retry. | `src/auth/bridge-recovery.ts` |
| `INJECTION_HOST_BLOCKED` | warn | Host permission absent for the active tab. | `src/background/injection.ts` |
| `INJECTION_SCRIPTING_BLOCKED` | warn | Tab is on a restricted scheme (`chrome://`, `about:`). | `src/background/injection.ts` |
| `INJECTION_COOLDOWN_ACTIVE` | info | Tab is in cooldown after a prior failure. | `src/background/injection.ts` |
| `HOST_PERMISSION_DENIED` | warn | User revoked optional host permission at runtime. | `src/background/permissions.ts` |
| `SEEDER_NO_ACTIVE_TAB` | warn | Token seeder ran with no eligible tab present. | `src/background/token-seeder.ts` |
| `UI_RENDER_FAILED` | warn | Options/popup view threw during mount. | `src/options/*` |
| `UI_INVALID_INPUT` | warn | Form submission failed schema validation. | `src/options/*` |
| `CFG_DEFAULT_MISSING` | error | Build-emitted `config-defaults.ts` missing a required key. | `src/config/load.ts` |
| `CFG_INSTRUCTION_INVALID` | fatal | `instruction.ts` failed schema validation at build time. | `scripts/compile-instruction.mjs` |
| `BUILD_VALIDATION_FAILED` | fatal | Pre-build validation script rejected the source tree. | `scripts/check-*.mjs` |
| `BUILD_ZIP_CONTRACT_BROKEN` | fatal | Release ZIP missing a required artifact. | `scripts/package-zip.mjs` |
| `TEST_HARNESS_FAILED` | error | Vitest/Playwright harness crashed (not a test failure). | `tests/setup.ts` |
| `NET_REQUEST_FAILED` | warn | Outbound `fetch` rejected or returned ≥ 500. | (any) |
| `NET_RESPONSE_INVALID` | warn | Response body failed schema validation. | (any) |
| `INTERNAL_INVARIANT_VIOLATED` | fatal | A "should never happen" branch was reached. | (any) |
| `INTERNAL_NOT_IMPLEMENTED` | fatal | Stub left in production code. | (any) |

---

## Common pitfalls

| Pitfall | Why it breaks | Fix |
|---------|---------------|-----|
| Reusing `INTERNAL_INVARIANT_VIOLATED` for every "weird" branch | Loses signal — every alert page lights up the same code. | Allocate a specific code once a failure repeats. |
| Inventing an inline prefix (`<PROJECT>_…`, `<BRAND>_…`) | Breaks the generic blueprint and routing rules. | Use a registered prefix; project identity goes in `context`. |
| Renaming a code "to be clearer" | Breaks downstream dashboards and support docs silently. | Deprecate first, then add a new code. |
| Encoding parameters in the code (`AUTH_TOKEN_MISSING_USER_42`) | Cardinality explodes; greps and counters lose meaning. | Keep the code stable; put `userId` in `context`. |
| Adding a code without a unit test | Typos slip through (`AUTH_TOKEM_MISSING`). | Mandatory `tests/error-codes.spec.ts` row per code. |

---

## DO / DO NOT / VERIFY

**DO**
- Use a registered prefix from the allocation table.
- Keep the code ≤ 48 characters and `SCREAMING_SNAKE_CASE`.
- Append the registry row in the *same PR* that introduces the throw.
- Treat the code as immutable once shipped — deprecate, never rename.

**DO NOT**
- Invent ad-hoc prefixes inline.
- Encode parameters, IDs, dates, or project names into codes.
- Duplicate codes across subsystems (each code lives under exactly one prefix).
- Throw an unregistered code in production paths.

**VERIFY**
- `rg "code:\s*\"[A-Z_]+\"" src/ | sort -u` matches the registry table 1:1.
- The unit test `tests/error-codes.spec.ts` constructs every registered code.
- Severity hints in the table align with actual `AppError` constructions.
- No code starts with two consecutive underscores or ends with `_`.

---

## Cross-References

| Reference | Location |
|-----------|----------|
| AppError shape | `./01-error-model.md` |
| CODE-RED FS rule | `./03-file-path-error-rule.md` |
| Reference implementation | `../12-templates/error-model.template.ts` |
| Logger contract | `./04-namespace-logger.md` |
| Diagnostic export | `./07-diagnostic-export.md` |
