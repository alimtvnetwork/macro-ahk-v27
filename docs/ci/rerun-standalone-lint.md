# Re-running the Standalone-Scripts Lint Job

How to re-run the **`Preflight · ESLint (Standalone Scripts)`** job
(defined in `.github/workflows/ci.yml`, job id `lint-standalone`) on the
latest commit, and how to clear stale GitHub Actions caches if warnings
persist after a clean code state.

The job runs:

```bash
npx eslint standalone-scripts --max-warnings=0 --format=stylish
```

It also runs `pnpm run lint:macro` for the Macro Controller domain
guards. Both must exit `0` for the job to pass.

---

## 1. Re-run the job on the latest commit

### Option A — GitHub web UI (fastest)

1. Open the repository on GitHub.
2. Click **Actions** in the top nav.
3. In the left sidebar, select the **CI Build** workflow.
4. Click the most recent run for your branch / PR.
5. In the top-right of the run page, click **Re-run jobs ▾** →
   **Re-run failed jobs** (or **Re-run all jobs** for a full pass).
6. Confirm. The job re-runs against the **same commit SHA** as the
   original run — it does NOT pick up newer commits.

> ⚠️ "Re-run" replays the original SHA. To lint a newer commit, push a
> new commit (or use Option C below).

### Option B — `gh` CLI

```bash
# List recent runs for the workflow
gh run list --workflow="CI Build" --limit 10

# Re-run a specific run by ID (failed jobs only)
gh run rerun <run-id> --failed

# Or re-run every job in that run
gh run rerun <run-id>

# Watch the new run live
gh run watch
```

### Option C — Force a fresh run on the latest commit

The `lint-standalone` job is gated by the `concurrency` block at the top
of `ci.yml`, which **cancels in-progress runs on the same ref**. To
force a fresh run on the current `HEAD`:

```bash
# Empty commit — triggers CI without changing any files
git commit --allow-empty -m "ci: re-trigger lint"
git push
```

The new push cancels any in-flight run on the same branch and starts a
fresh one against the latest commit.

---

## 2. Verify the run is using the right commit

The `lint-standalone` job prints diagnostics **before** ESLint runs.
Open the job log and expand the `Lint diagnostics (commit, versions,
command)` step. You should see:

```
Git commit SHA   : <40-char SHA>
Git ref          : refs/heads/<branch>  (or refs/pull/<n>/merge)
Short SHA        : <7-char>
HEAD commit      : <SHA> <subject>
Node version     : v20.x.x
pnpm version     : 9.x.x
ESLint version   : x.y.z
ESLint config    : eslint.config.js
Lint command     : npx eslint standalone-scripts --max-warnings=0 --format=stylish
```

If the printed SHA does **not** match the commit you expect, the run is
replaying an old commit — re-trigger with Option C.

The checkout is also pinned (`fetch-depth: 0`, `clean: true`,
`ref: ${{ github.event.pull_request.head.sha || github.sha }}`) so a
stale workspace from a self-hosted/cached runner cannot leak in.

---

## 3. Reproduce the lint locally (before pushing)

```bash
pnpm install --prefer-offline --no-frozen-lockfile
npx eslint standalone-scripts --max-warnings=0 --format=stylish
echo "exit=$?"
```

`exit=0` and **zero output** means the job will pass. Any line of
output = a warning or error = CI failure under `--max-warnings=0`.

Also run the macro-controller guards:

```bash
pnpm run lint:macro
```

---

## 4. Clearing the GitHub Actions cache (if warnings persist)

The `lint-standalone` job caches **two things**:

| Cache key prefix              | Path(s)                                      | What it stores               |
|-------------------------------|----------------------------------------------|------------------------------|
| `${{ runner.os }}-pnpm-store-`| pnpm store (CAS)                             | Downloaded package tarballs  |
| `${{ runner.os }}-nm-lint-`   | `node_modules`, `standalone-scripts/*/node_modules` | Installed dependencies |

Both keys include `hashFiles('**/pnpm-lock.yaml', '**/package-lock.json')`,
so they auto-invalidate when the lockfile changes. They do **not** cache
ESLint output or source files — clearing them only affects install
behaviour, not lint results.

If a stale cache is genuinely suspect (e.g. an old `eslint` binary or a
phantom `node_modules` entry), purge it:

### Option A — GitHub web UI

1. Repo → **Actions** → **Caches** (left sidebar, near the bottom).
2. Filter by branch if needed.
3. Click the trash icon next to each cache entry to delete it.
4. Re-trigger the job (Section 1).

### Option B — `gh` CLI

```bash
# List caches
gh cache list --limit 50

# Delete one by ID
gh cache delete <cache-id>

# Delete every cache in the repo (nuclear option)
gh cache list --limit 100 --json id --jq '.[].id' \
  | xargs -n1 gh cache delete
```

After deleting, re-trigger the job (Section 1, Option C is recommended
so a brand-new run is forced).

### Option C — `gh` extension `gh-actions-cache`

```bash
gh extension install actions/gh-actions-cache
gh actions-cache list -R <owner>/<repo>
gh actions-cache delete <cache-key> -R <owner>/<repo> --confirm
```

---

## 5. If the warnings STILL appear after a clean re-run

1. **Check the diagnostics step's printed SHA** matches the commit you
   expect (Section 2). If not, you're looking at an old replay.
2. **Run the lint locally** at the same SHA (Section 3). If it's clean
   locally but red in CI, verify Node/pnpm/ESLint versions in the
   diagnostics step match your local versions.
3. **Inspect the warnings**: each line shows
   `path/to/file.ts  line:col  warning  rule-id`. Open that file at
   the printed line and either fix the code or — if the rule is a
   genuine false positive — adjust `eslint.config.js` overrides
   (see existing override blocks for `standalone-scripts/**`,
   `__tests__/**`, and `macro-controller/**`).
4. **Cache is almost never the cause.** ESLint reads source files
   directly from the freshly-checked-out workspace; it does not consult
   the pnpm store or `node_modules` for what to lint.

---

## Related

- Workflow: `.github/workflows/ci.yml` (search for `lint-standalone`)
- ESLint config: `eslint.config.js` (overrides for `standalone-scripts/**`,
  `__tests__/**`, `macro-controller/**`)
- Linting policy: zero warnings, zero errors (see project memory
  `mem://architecture/linting-policy`)
- No-retry policy: do **not** wrap the lint command in retry loops
  (see `mem://constraints/no-retry-policy`)