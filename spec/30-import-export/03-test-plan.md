# 30-03 — Import/Export E2E Test Plan

**Status**: Spec — pending review. Implementation triggered when user replies "next".
**Last updated**: 2026-04-24.
**Scope**: ~40+ tests, "go wild" tier per user direction.
**Runner**: Vitest with file-level parallelism (`vitest --pool=threads`).

---

## 1. Architecture — setup-once / asserts-parallel

```
┌────────────────────────────────────────────────┐
│ SETUP (runs ONCE per `vitest run`)             │
│  src/test/import-export/setup-fixture.ts       │
│   ├─ build a fixture project covering every    │
│   │  artifact category                         │
│   ├─ run exportProjectAsSqliteZip() once       │
│   ├─ run importFromSqliteZip() once            │
│   └─ cache: zipBytes, dbBytes, importedState   │
└────────────────────────────────────────────────┘
                      │ shared, read-only
       ┌──────────────┼──────────────┐
       ▼              ▼              ▼
 archive.test     schema.test    settings.test    ... 12 parallel files
 (asserts)        (asserts)      (asserts)
```

- Fixture build + export + import happen **once** in `globalSetup`. Result is written to `node_modules/.cache/marco-fixture/{bundle.zip, bundle.db, imported-state.json}`.
- All assertion test files re-open the cached `bundle.db` read-only via `sql.js` and read `imported-state.json`. They never mutate, so file-level parallelism is safe.
- Any test that *needs* mutation (e.g. negative cases, prompt Save/Modify/Delete) builds its own scoped in-memory copy from the cached bytes — never touches the cache.

## 2. Fixture project (must hit every artifact)

Built by `src/test/import-export/build-fixture.ts`:

```
Project "FixtureCoverage" {
  scripts: [
    { path: "in-project-script-1", code: "console.log('inline-1')", runAt: "document_idle" },
    { path: "in-project-script-2", code: "globalThis.x=1", runAt: "document_start" },
    { path: "ExternalLib1" }   // resolves to library Scripts row
  ],
  configs:  [{ path: "ExternalCfg1" }],
  cookies:  [{ host: "*.example.com", name: "session" }],
  variables: { Foo: "bar", Nested: { A: 1, B: [true, false, null] } },  // JSON blob
  dependencies: ["dep-a@1.0.0", "dep-b@^2"],
  settings: { autoRun: true, theme: "dark" },
  targetUrls: [{ pattern: "https://example.com/*", matchType: "glob" }]
}
LibraryScripts: [
  { name: "ExternalLib1", code: "/* lib */", runOrder: 0 }
]
LibraryConfigs: [
  { name: "ExternalCfg1", json: "{\"k\":\"v\"}" }
]
Prompts seeded from standalone-scripts/prompts/*  (all 14 + 1 synthetic)
```

## 3. Test files (all parallel after setup)

| # | File | Asserts | Approx test count |
|---|------|---------|-------------------|
| 1 | `archive-structure.test.ts` | zip has exactly one entry; entry name = `marco-backup.db`; entry is valid SQLite (magic bytes `SQLite format 3\0`) | 4 |
| 2 | `schema-pascalcase.test.ts` | every `sqlite_master` table is PascalCase; every column name in every table is PascalCase; **no** snake_case or camelCase identifiers; `Meta.format_version >= '4'` | 6 |
| 3 | `projects-roundtrip.test.ts` | every field on `StoredProject` survives (id/Uid, name, version, description, targetUrls, scripts JSON, configs JSON, cookieRules JSON, settings JSON, createdAt, updatedAt); JSON blob keys themselves are camelCase per contract | 8 |
| 4 | `scripts-roundtrip.test.ts` | in-project inline scripts persisted; external library scripts persisted with full Code; RunOrder/RunAt/ConfigBinding/IsIife/HasDomUsage preserved; ScriptOriginKind enum tagging round-trips | 7 |
| 5 | `configs-roundtrip.test.ts` | library configs preserved; raw JSON byte-equal | 3 |
| 6 | `variables-roundtrip.test.ts` | variables JSON blob inside `Projects.Settings` round-trips deep-equal incl. nested arrays/null/bool/number | 4 |
| 7 | `prompts-roundtrip.test.ts` | every seeded prompt present in bundle; Text byte-equal to `trimEnd(prompt.md)`; Slug+Version+IsDefault+IsFavorite preserved | 6 |
| 8 | `prompt-resolver.test.ts` | `resolvePromptBySlug(slug)` returns Text; round-trip MD→DB→resolver→assertEqual(MD) for all 14 prompts; PromptOperationKind.Save/Modify/Delete behave correctly in scoped copy | 14 (prompt-count + 3 ops) |
| 9 | `meta.test.ts` | Meta has `exported_at` ISO timestamp; Meta has `format_version='4'` | 2 |
| 10 | `bundle-determinism.test.ts` | exporting the same fixture twice produces byte-identical SQLite file (modulo `exported_at`); zip entry order stable | 2 |
| 11 | `negative-cases.test.ts` | corrupt zip → throws; zip missing `marco-backup.db` → throws specific message; non-PascalCase schema (synthesised) → rejected with `ImportStrictPascalCase` error; unknown table → quarantined | 6 |
| 12 | `merge-vs-replace.test.ts` | `replaceAll`: existing data deleted then inserted; `mergeAll`: existing data preserved + upsert by Uid; collision on Name without Uid logs warning | 5 |

**Total**: ≈ 67 test cases across 12 parallel files.

## 4. Helper modules

```
src/test/import-export/
  enums.ts                 ExportArtifactKind, ScriptOriginKind, PromptOperationKind
  build-fixture.ts         pure builder of StoredProject/Script/Config arrays
  setup-fixture.ts         globalSetup — runs export + import once, caches output
  fixture-cache.ts         loadCachedBundle() / loadImportedState()
  pascalcase.ts            isPascalCase(name); assertSchemaPascalCase(db)
  prompt-resolver.ts       resolvePromptBySlug(db, slug)  — exported for app reuse
  scoped-db.ts             cloneCachedDbInMemory()  — for mutation tests
```

## 5. Vitest configuration delta

`vitest.config.ts` will add:

```ts
test: {
  globalSetup: ["./src/test/import-export/setup-fixture.ts"],
  pool: "threads",
  poolOptions: { threads: { singleThread: false } },
  // import/export tests are tagged so they can be run in isolation
  include: [..., "src/test/import-export/*.test.ts"],
}
```

## 6. CI integration

A new GitHub Actions job `import-export-e2e` will:

1. `node scripts/aggregate-prompts.mjs` (so MD→JSON intermediate exists).
2. `bun run test -- src/test/import-export` (Vitest, parallel).
3. Upload `node_modules/.cache/marco-fixture/bundle.zip` as a CI artifact for forensic inspection on failure.
4. Annotate the PR with per-test failures via Vitest's `--reporter=github-actions`.

The job runs after `derive-casing-matrix` so the casing job and the round-trip job share the same registry.

## 7. Performance budget

- Setup must complete in < 5 s on CI (sql.js init dominates).
- Each parallel test file < 1 s.
- Total wall time budget: < 15 s on CI's 2-vCPU runner.

## 8. Out of scope (deferred)

- React component tests for the import/export UI panels (per `mem://preferences/deferred-workstreams`).
- Manual Chrome smoke test (per same memory).
- Fuzz testing of zip parser.
- Migration tests for the `Dependencies` / `Variables` first-class-table promotion (separate spec).

## 9. Acceptance — when this plan is "done"

- [ ] All 12 test files exist and pass locally with `bun run test src/test/import-export`.
- [ ] CI job green on at least 2 consecutive PR runs.
- [ ] Bundle artifact downloadable from a failed run.
- [ ] Per-prompt MD↔SQLite byte-equality enforced in CI.
- [ ] Negative cases produce clear, actionable error messages (verified by snapshot).
