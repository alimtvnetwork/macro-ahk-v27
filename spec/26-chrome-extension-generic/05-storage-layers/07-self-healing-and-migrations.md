# Self-Healing & Migrations

**Version:** 1.0.0
**Updated:** 2026-04-24
**Status:** Active
**AI Confidence:** Production-Ready
**Ambiguity:** Low

> *Generic blueprint — no project-specific identifiers. If you find one, file an issue.*

---

## Why "self-healing" is mandatory

Every persistent tier in this blueprint can be wiped without warning:

| Wipe trigger | Affects | User-visible? |
|--------------|---------|---------------|
| User clears site data | OPFS (Tier 1), IndexedDB (Tier 2), localStorage (Tier 4) | Yes |
| Extension uninstall / reinstall | All tiers | Yes |
| OPFS quota pressure | Tier 1 records (best-effort persistence) | No |
| Browser crash mid-write | Last few records in any tier | No |
| Concurrent tab racing on upgrade | Tier 2 store creation | No |
| Manual reset by support tooling | All tiers | Yes |

Without a reseed path the extension boots into a half-functional state,
the user sees a broken UI, and the only recovery is reinstall. **All
data of record MUST have a reseed path.**

---

## Two-stage builtin-script-guard

The canonical pattern is the **builtin-script-guard**: a two-stage check
that runs on every SW activation and ensures every required artefact is
present, valid, and current.

```
SW activation
    │
    ▼
[Stage 1] Inventory check
    Read `MAN_BUILTIN_SCRIPTS` from chrome.storage.local.
    For every required script id:
      - Is the manifest entry present?
      - Does its hash match the bundled hash?
      - Is the asset reachable via chrome.runtime.getURL?
    If everything matches → done.
    │
    ▼
[Stage 2] Reseed
    For each missing or mismatched id:
      - Read the bundled bytes from dist/builtin/<id>.js
      - Compute SHA-256
      - Write { id, hash, version, bytes? } back to MAN_BUILTIN_SCRIPTS
    Emit a single info-level log: "self-healed N scripts"
    Surface fatal AppError ONLY if reseed itself fails.
```

The same two-stage shape is reused for **any** Tier 1 / Tier 3 dataset
that has a "source of truth" inside the extension package.

---

## Reference implementation — builtin-script-guard

```ts
// src/background/bootstrap/builtin-script-guard.ts
import { AppError } from "@shared/error-model";
import { createLogger } from "@shared/namespace-logger";
import { chromeLocal } from "@shared/storage/chrome-local";

const log = createLogger("guard.builtin-scripts");
const KEY = "MAN_BUILTIN_SCRIPTS";

interface ManifestEntry { id: string; hash: string; version: string; assetPath: string }
type Manifest = Record<string, ManifestEntry>;

interface BundledScript { id: string; assetPath: string; version: string }

const REQUIRED: readonly BundledScript[] = [
    { id: "sdk",     assetPath: "sdk.iife.js",   version: "<VERSION>" },
    { id: "content", assetPath: "content.js",    version: "<VERSION>" },
];

export async function ensureBuiltinScripts(): Promise<void> {
    const manifest = (await chromeLocal.get<Manifest>(KEY)) ?? {};
    const repaired: ManifestEntry[] = [];

    for (const script of REQUIRED) {
        const entry = manifest[script.id];
        const url = chrome.runtime.getURL(script.assetPath);

        let bytes: ArrayBuffer;
        try {
            bytes = await (await fetch(url)).arrayBuffer();
        } catch (cause) {
            throw AppError.fromFsFailure({
                code: "GUARD_ASSET_UNREACHABLE",
                path: url,
                missing: `Builtin script asset for id="${script.id}"`,
                reason: "fetch(chrome.runtime.getURL) failed — packaged asset is missing or build is corrupt",
                cause,
            });
        }

        const hash = await sha256(bytes);

        if (!entry || entry.hash !== hash || entry.version !== script.version) {
            const next: ManifestEntry = { id: script.id, hash, version: script.version, assetPath: script.assetPath };
            manifest[script.id] = next;
            repaired.push(next);
        }
    }

    if (repaired.length > 0) {
        try {
            await chromeLocal.set(KEY, manifest);
        } catch (cause) {
            throw AppError.fromFsFailure({
                code: "GUARD_MANIFEST_WRITE_FAILED",
                path: `chrome.storage.local/${KEY}`,
                missing: "Writable chrome.storage.local quota for the manifest",
                reason: cause instanceof Error ? cause.message : String(cause),
                cause,
            });
        }
        log.info("self-healed builtin scripts", { count: repaired.length, ids: repaired.map((r) => r.id) });
    }
}

async function sha256(buffer: ArrayBuffer): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
```

`ensureBuiltinScripts()` is called from the SW activation handler,
**before** the message router mounts.

---

## Hash-based reseed for config files

The same pattern applies to declarative configuration that ships inside
the extension as JSON (e.g., per-project `config.json`):

1. On first load, hash the file → seed the parsed values into the SQLite
   `ProjectConfig` table → store the hash in `ProjectConfigMeta`.
2. On subsequent loads, hash the file → compare against the stored hash.
3. If equal → read from SQLite (user edits preserved).
4. If different → re-seed from the file (treat the file as the new source of truth).
5. User edits made via the Options UI write to SQLite **only** — the
   file hash is never updated by user edits, so a config file change at
   release time always wins.

This avoids the two pathological cases:

- "User edits get clobbered on every boot" (naïve reseed).
- "Release-time config changes never reach the extension" (no reseed).

```ts
// pseudo
const fileBytes = await fetch(chrome.runtime.getURL("config.json")).then((r) => r.arrayBuffer());
const fileHash = await sha256(fileBytes);

const meta = await db.exec(`SELECT FileHash FROM ProjectConfigMeta WHERE Id = 'singleton'`);
const storedHash = meta?.[0]?.FileHash as string | undefined;

if (storedHash !== fileHash) {
    const cfg = JSON.parse(new TextDecoder().decode(fileBytes)) as Record<string, unknown>;
    await reseedProjectConfig(db, cfg);
    await db.exec({
        sql: `INSERT OR REPLACE INTO ProjectConfigMeta (Id, FileHash, SeededAt) VALUES (?, ?, ?)`,
        bind: ["singleton", fileHash, new Date().toISOString()],
    });
    log.info("project config reseeded from file", { newHash: fileHash });
}
```

---

## Storage schema versioning

Tier 1 (SQLite) and Tier 2 (IndexedDB) both carry a schema version:

| Tier | Where the version lives | Migration mechanism |
|------|--------------------------|---------------------|
| Tier 1 SQLite | `SystemMigration` table | Additive `applySchema()` runner (`03-…`) |
| Tier 2 IndexedDB | `IDBOpenDBRequest.onupgradeneeded` + `version` field on every record | Additive store creation + record-level version filter |

When the **storage schema** must change in a non-additive way (rare), do
this:

1. Bump a single shared **storage schema version** constant in
   `src/shared/constants.ts`.
2. Write a one-shot migrator keyed on the previous version.
3. Run the migrator inside `ensureBuiltinScripts()`-equivalent, before
   the message router mounts.
4. After success, write the new version into a sentinel
   (`BOOT_STORAGE_SCHEMA_VERSION`).
5. Log a CODE-RED entry if the migration fails — never proceed with a
   half-migrated DB.

The blueprint ships with **no** non-additive migrators. Add them only
under issue tracking with a written rollback plan.

---

## Concurrent activation safety

Two parts of the codebase must never reseed the same dataset at the
same time. The blueprint uses a simple in-memory lock per dataset:

```ts
const inflight = new Map<string, Promise<void>>();

export async function once(key: string, fn: () => Promise<void>): Promise<void> {
    const existing = inflight.get(key);
    if (existing) return await existing;
    const p = fn().finally(() => inflight.delete(key));
    inflight.set(key, p);
    await p;
}

await once("guard:builtin-scripts", () => ensureBuiltinScripts());
```

This is sufficient because the SW is single-threaded; the lock only
needs to survive within a single SW activation.

---

## Diagnostic surfacing

Every reseed event MUST be observable in the diagnostic ZIP export:

| Event | Severity | Content |
|-------|----------|---------|
| Self-heal repaired N items | `info` | dataset id, ids repaired, count, durationMs |
| Hash changed → re-seeded from file | `info` | dataset id, oldHash, newHash, durationMs |
| Storage schema migrated | `warn` | fromVersion, toVersion, durationMs |
| Reseed source unreachable | `error` (CODE-RED) | path, missing, reason |
| Reseed write failed | `error` (CODE-RED) | path, missing, reason |
| Concurrent activation lock held > 5 s | `warn` | key, ageMs |

This is what makes "the extension fixed itself" a debuggable event
rather than an invisible miracle.

---

## Common pitfalls

| Pitfall | Symptom | Fix |
|---------|---------|-----|
| Reseed clobbered user edits | User-visible config "resets itself" | Compare hashes; only reseed when source changed |
| No lock around reseed → ran twice | Duplicate rows / races | Use `once(key, fn)` |
| Reseed on every boot regardless | Slow startup | Inventory first, reseed only on diff |
| Swallowed reseed errors | Half-functional UI with no log | Always throw `AppError.fromFsFailure(...)` |
| Reseed coupled to network | Cold install offline → broken | Sources of truth MUST be in `dist/` |
| No diagnostic record | Support cannot tell that a heal occurred | Log every heal at `info` |

---

## DO / DO NOT / VERIFY

**DO**

- Run the inventory check on every SW activation, before the router mounts.
- Use bundled bytes (in `dist/`) as the source of truth, not network.
- Hash artefacts and reseed only on diff.
- Lock concurrent reseeds with `once(key, fn)`.
- Log every heal (info) and every reseed failure (CODE-RED error).

**DO NOT**

- Reseed on every boot blindly.
- Overwrite user edits when only the file hash is unchanged.
- Catch and ignore reseed failures.
- Assume the previous SW left the storage tiers in a known state.

**VERIFY**

- [ ] Deleting OPFS via DevTools then reloading the extension restores
      a working state without UI glitches.
- [ ] Bumping a builtin script version triggers exactly one `info`
      "self-healed" log line.
- [ ] User edits to `config.json` keys persist across SW restarts when
      the source `config.json` hash is unchanged.
- [ ] Reseed lock prevents double execution when two messages arrive
      simultaneously on cold start.

---

## Cross-References

| Reference | Location |
|-----------|----------|
| Storage tier matrix | `./01-storage-tier-matrix.md` |
| SQLite in background | `./02-sqlite-in-background.md` |
| Schema conventions | `./03-sqlite-schema-conventions.md` |
| chrome.storage.local | `./05-chrome-storage-local.md` |
| Error model | `../07-error-management/01-error-model.md` |
| CODE-RED rule | `../07-error-management/03-file-path-error-rule.md` |
| Diagnostic export | `../07-error-management/07-diagnostic-export.md` |
