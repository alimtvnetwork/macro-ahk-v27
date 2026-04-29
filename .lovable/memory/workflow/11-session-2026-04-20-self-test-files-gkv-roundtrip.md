# Session 2026-04-20 — SDK Self-Test FILES + GKV Round-Trip (v2.169.0)

> **Goal:** Extend the SDK self-test so every project-scoped storage surface (KV, FILES, GKV) is health-checked on every page load, with one independent PASS/FAIL line per surface.

## What changed — `standalone-scripts/marco-sdk/src/self-test.ts`

The self-test now runs three independent async round-trips after the synchronous shape/meta checks succeed. Each surface logs its own `NamespaceLogger` line so a backend failure on one never masks the others.

### KV round-trip (unchanged behaviour, renamed function)
- `kv.set('selftest','ok')` → `kv.get` (must equal `"ok"`) → `kv.delete` → `kv.get` (must be `null`/`undefined`)
- 4 checks. Logged under `[sdkSelfTest:kv-roundtrip]`.

### FILES round-trip (new)
- `files.save("__selftest__.txt", "ok", "text/plain")`
- `files.list()` (must include the test file by `filename` or `path`)
- `files.read("__selftest__.txt")` (`.content` must equal `"ok"`)
- `files.delete("__selftest__.txt")`
- `files.list()` (must NOT include the test file)
- 5 checks. Logged under `[sdkSelfTest:files-roundtrip]`.

### GKV round-trip (new)
- Driven directly through `bridge.sendMessage` because the SDK self-namespace does not expose a public grouped-kv surface — but the background handler is part of the project-scoped storage layer and must be health-checked.
- `GKV_SET { group:"__selftest__", key:"selftest", value:"ok" }`
- `GKV_GET` (must equal `"ok"` — accepts both raw-string and `{value:…}` envelope shapes for forward-compat)
- `GKV_DELETE`
- `GKV_GET` (must be `null`/`undefined`)
- 4 checks. Logged under `[sdkSelfTest:gkv-roundtrip]`.

### Shared helpers
- `tryStep(op, label, failures)` — single try/catch wrapper used by all three surfaces.
- `reportRoundTrip(fn, pattern, failures, checks)` — single PASS/FAIL formatter so output is uniform across surfaces.
- The previous `verifyGetEquals` / `verifyGetCleared` were renamed to KV-specific names and parallel `verifyFilesListIncludes` / `verifyFilesReadEquals` / `verifyGkvGetEquals` / `verifyGkvGetCleared` were added.

## Why direct `sendMessage` for GKV (and not for files)?

- `files` already has a public surface on `marco.files` (and therefore on `Projects.RiseupMacroSdk.files` via the self-namespace mirror), so we exercise it through the documented API — exactly how a project script would use it.
- `gkv` has no SDK surface today. Adding a thin `marco.gkv` API just to enable the self-test would expand the public contract for a single internal use case. Calling `sendMessage("GKV_SET", …)` directly health-checks the same code path (bridge → content script → background handler → SQLite) without bloating the public API. If a `marco.gkv` surface is ever added, the round-trip should be migrated to use it.

## Diagnostic value

A typical healthy page load now logs (in order):

```
[RiseupAsia] [sdkSelfTest] PASS — Projects.RiseupMacroSdk v2.169.0 (5 checks)
[RiseupAsia] [sdkSelfTest:kv-roundtrip] PASS — set/get/delete/verify round-trip OK (4 checks)
[RiseupAsia] [sdkSelfTest:files-roundtrip] PASS — save/list/read/delete/verify round-trip OK (5 checks)
[RiseupAsia] [sdkSelfTest:gkv-roundtrip] PASS — set/get/delete/verify round-trip OK (4 checks)
```

If FILES or GKV breaks while KV stays healthy (e.g. a regression in `file-storage-handler.ts` or `grouped-kv-handler.ts`), only the affected surface logs FAIL with the offending step (`files.delete threw: …`, `gkv:get returned null ≠ "ok"`, etc.) — the other surfaces still PASS. This is the same isolation guarantee the BindError-into-Errors-panel hook (v2.168.0) provides at the message-router layer, but earlier in the pipeline.

## Verification

- `npx eslint standalone-scripts/marco-sdk/src/self-test.ts --max-warnings 0` → exit 0, zero warnings.
- `npx tsc --noEmit -p tsconfig.json` → exit 0.
- `npx tsc --noEmit -p tsconfig.sdk.json` → exit 0.
- Version unified at v2.169.0 across `manifest.json`, `constants.ts`, `macro-controller`, `marco-sdk`, and `xpath`.

## Manual verification (next AI / operator)

1. Reload the extension on a matched tab.
2. Open DevTools console.
3. Confirm four PASS lines appear (or precise FAIL diagnostics for any broken surface).
4. To force a FAIL: temporarily monkey-patch `marco.files.delete` in the page console to `() => Promise.reject(new Error("boom"))` and reload — the `files-roundtrip` line should FAIL with `files.delete threw: boom` while KV and GKV still PASS.

## Cross-references

- Surface docs: `spec/21-app/02-features/devtools-and-injection/sdk-convention.md` (`marco.kv`, `marco.files`)
- Background handlers exercised: `src/background/handlers/kv-handler.ts`, `file-storage-handler.ts`, `grouped-kv-handler.ts`
- Layer 4 (Errors panel hookup): `.lovable/memory/workflow/10-session-2026-04-20-binderror-into-errors-panel.md`
- Bind safety architecture: `mem://architecture/sqlite-bind-safety`

## Next Logical Step

Plan.md item #1: vitest coverage for `assertBindable` + `BindError` so the column-name inference is locked against future Proxy refactors.

## Confirmation pass — 2026-04-20 (later)

User re-issued the same request ("extend self-test to FILES + GKV"). Verified the v2.169.0 implementation already in `standalone-scripts/marco-sdk/src/self-test.ts` satisfies it in full:
- KV/FILES/GKV each emit independent `[sdkSelfTest:<surface>-roundtrip]` PASS/FAIL via `NamespaceLogger`
- Three surfaces are isolated — a backend break on one never masks the others
- Plan.md item #3 remains ✅ Completed (no version bump required)

No code changes; treated as confirmation only.
