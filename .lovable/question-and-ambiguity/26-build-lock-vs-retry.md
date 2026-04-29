# 26 — build-lock vs retry for in-flight file writes

**Context**: User requested a "build lock or retry mechanism so build:dev waits for file writes/uploads to finish before running prebuild verification."

**Conflict**: Project policy `mem://constraints/no-retry-policy` strictly bans retry/backoff loops in the codebase. Adding a generic retry around prebuild checks would violate it.

## Options

### A. Build lock sentinel (chosen)
- Writer process (uploader, IDE, sync agent) creates `.lovable/build.lock` while writing, deletes it on completion.
- `prebuild-clean-and-verify.mjs` calls `waitForBuildLock()` at startup: if lock exists, polls `existsSync` every 250 ms with a hard 60 s deadline, then proceeds (or fails fast).
- **Pros**: Sequential gate, not a retry. Honors no-retry policy. Deterministic — caller has explicit ownership of "ready" signal.
- **Cons**: Requires writer to actually create the lock file (no-op without cooperation).

### B. Retry the verifier itself
- Re-run `probeStepLibrary()` N times on failure with delay.
- **Pros**: Zero writer cooperation needed.
- **Cons**: ❌ Violates no-retry policy. Masks real missing-file bugs.

### C. Stat-stability check
- Read directory mtimes, sleep 250 ms, re-read; consider stable if unchanged.
- **Pros**: No writer cooperation.
- **Cons**: Heuristic; effectively a retry loop in disguise; can race; violates spirit of no-retry policy.

## Decision
**Option A — build lock sentinel.** Implemented via `scripts/lib/build-lock.mjs` and wired into `prebuild-clean-and-verify.mjs`. The wait is a single fail-fast gate (max 60 s, single deadline), not a retry/backoff. Lock is opt-in: when no `.lovable/build.lock` exists, behavior is unchanged.
