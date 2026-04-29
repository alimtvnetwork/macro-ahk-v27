#!/usr/bin/env node
/**
 * refresh-spec-links-baseline.mjs
 *
 * Safely cleans and regenerates the broken-link baseline used by
 * `scripts/check-spec-links.mjs`.
 *
 * Why this wrapper exists:
 *  - The naive flow is `check-spec-links.mjs --update-baseline`, which
 *    snapshots WHATEVER is currently broken — including genuine new
 *    failures — and silently lets them pass forever.
 *  - This wrapper enforces a safety contract: the baseline is only
 *    regenerated when the tree is provably clean (zero broken links) OR
 *    the operator explicitly opts in via `--accept-current` after
 *    inspecting the proposed snapshot.
 *
 * Default flow (safe):
 *  1. Optionally run the auto-rewriter first (`--rewrite`) to repair links.
 *  2. Run check-spec-links in --strict mode (ignores existing baseline).
 *  3. If clean → delete the baseline file (it's no longer needed).
 *  4. If still broken → REFUSE to update; print the failures and exit 1.
 *
 * Opt-in override (`--accept-current`):
 *  - Runs the strict check, prints every break that would be baselined,
 *    requires the explicit flag to actually write the snapshot.
 *  - Prevents accidental regression-hiding by forcing a deliberate action.
 *
 * Usage:
 *    node scripts/refresh-spec-links-baseline.mjs                  # safe: only clears baseline if clean
 *    node scripts/refresh-spec-links-baseline.mjs --rewrite        # auto-rewrite first, then refresh
 *    node scripts/refresh-spec-links-baseline.mjs --accept-current # snapshot current breaks (explicit)
 *    node scripts/refresh-spec-links-baseline.mjs --rewrite --accept-current
 *
 * Exit codes:
 *    0 — baseline cleared (tree clean) OR snapshot written under --accept-current
 *    1 — refused: tree has broken links and operator did not opt in
 *    2 — internal error (missing files, subprocess failure)
 *
 * Output follows project Code Red logging: exact path, missing item, reason.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..");
const CHECKER = join(REPO_ROOT, "scripts", "check-spec-links.mjs");
const REWRITER = join(REPO_ROOT, "scripts", "rewrite-spec-links.mjs");
const BASELINE = join(REPO_ROOT, "scripts", "check-spec-links.baseline.json");

const SCRIPT_TAG = "[refresh-spec-links-baseline]";

const argv = new Set(process.argv.slice(2));
const DO_REWRITE = argv.has("--rewrite");
const ACCEPT_CURRENT = argv.has("--accept-current");

function failHard(message) {
  console.error(`${SCRIPT_TAG} HARD ERROR — ${message}`);
  process.exit(2);
}

function ensureExists(path, label) {
  if (!existsSync(path)) {
    failHard(
      `required file missing.\n` +
        `  path:    ${path}\n` +
        `  missing: ${label}\n` +
        `  reason:  this wrapper depends on ${label} existing alongside it.`
    );
  }
}

ensureExists(CHECKER, "scripts/check-spec-links.mjs");

/** Run a node subprocess inheriting stdio. Returns exit code. */
function runNode(scriptPath, args, label) {
  console.log(`${SCRIPT_TAG} ${label}: node ${relative(REPO_ROOT, scriptPath)} ${args.join(" ")}`.trimEnd());
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: REPO_ROOT,
    stdio: "inherit",
  });
  if (result.error) {
    failHard(
      `subprocess failed to launch.\n` +
        `  script: ${scriptPath}\n` +
        `  reason: ${result.error.message}`
    );
  }
  return result.status ?? 1;
}

function clearBaselineIfPresent() {
  if (!existsSync(BASELINE)) {
    console.log(`${SCRIPT_TAG} baseline already absent — nothing to clear at ${relative(REPO_ROOT, BASELINE)}.`);
    return;
  }
  unlinkSync(BASELINE);
  console.log(`${SCRIPT_TAG} OK — deleted stale baseline at ${relative(REPO_ROOT, BASELINE)} (tree is clean).`);
}

function summarizeProposedSnapshot() {
  if (!existsSync(BASELINE)) return;
  try {
    const raw = JSON.parse(readFileSync(BASELINE, "utf8"));
    const entries = Array.isArray(raw?.entries) ? raw.entries : [];
    console.log(`${SCRIPT_TAG} snapshot contains ${entries.length} entr${entries.length === 1 ? "y" : "ies"}:`);
    for (const e of entries.slice(0, 50)) {
      console.log(`  - ${e.source} → ${e.target}`);
    }
    if (entries.length > 50) {
      console.log(`  ... and ${entries.length - 50} more (truncated).`);
    }
  } catch (err) {
    console.warn(`${SCRIPT_TAG} could not parse written baseline for summary: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function main() {
  console.log(`${SCRIPT_TAG} mode: ${ACCEPT_CURRENT ? "ACCEPT-CURRENT (snapshot will be written)" : "SAFE (only clears baseline if tree is clean)"}`);
  if (DO_REWRITE) {
    ensureExists(REWRITER, "scripts/rewrite-spec-links.mjs");
    const rc = runNode(REWRITER, ["--apply"], "step 1/3 auto-rewrite broken links");
    if (rc !== 0) {
      failHard(
        `auto-rewriter exited with code ${rc}.\n` +
          `  script: scripts/rewrite-spec-links.mjs --apply\n` +
          `  reason: rewriter failed; aborting before touching the baseline.`
      );
    }
  }

  // Strict mode ignores the existing baseline so we see the TRUE current state.
  const strictLabel = DO_REWRITE ? "step 2/3 strict link check (post-rewrite)" : "step 1/2 strict link check";
  const strictRc = runNode(CHECKER, ["--strict"], strictLabel);

  if (strictRc === 0) {
    // Tree is clean — baseline is unnecessary; remove it so it can never hide
    // future regressions.
    const finalLabel = DO_REWRITE ? "step 3/3 clear baseline" : "step 2/2 clear baseline";
    console.log(`${SCRIPT_TAG} ${finalLabel}`);
    clearBaselineIfPresent();
    console.log(`${SCRIPT_TAG} DONE — tree is clean; baseline cleared. Future builds will fail on ANY broken link.`);
    process.exit(0);
  }

  // Tree still has broken links. Decide based on opt-in flag.
  if (!ACCEPT_CURRENT) {
    console.error(
      `\n${SCRIPT_TAG} REFUSED — broken links remain and --accept-current was not passed.\n` +
        `  reason:  refreshing the baseline now would silently hide the failures listed above.\n` +
        `  options:\n` +
        `    1. Fix the broken links (manually or via: node scripts/rewrite-spec-links.mjs --apply),\n` +
        `       then re-run this command.\n` +
        `    2. Re-run with --rewrite to attempt auto-repair before refreshing.\n` +
        `    3. If you have reviewed the breaks and accept them as the new baseline,\n` +
        `       re-run with --accept-current to write the snapshot explicitly.`
    );
    process.exit(1);
  }

  // Explicit opt-in: regenerate the baseline.
  console.log(`${SCRIPT_TAG} --accept-current acknowledged. Writing snapshot of current breaks...`);
  const updateRc = runNode(CHECKER, ["--update-baseline"], "step N/N regenerate baseline");
  if (updateRc !== 0) {
    failHard(
      `baseline update exited with code ${updateRc}.\n` +
        `  script: scripts/check-spec-links.mjs --update-baseline\n` +
        `  reason: subprocess failed; baseline file may be inconsistent.`
    );
  }
  summarizeProposedSnapshot();
  console.log(`${SCRIPT_TAG} DONE — baseline regenerated by explicit operator request.`);
  process.exit(0);
}

main();
