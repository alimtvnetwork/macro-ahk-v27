#!/usr/bin/env node
/**
 * derive-casing-matrix.mjs
 *
 * Auto-derives the GitHub Actions matrix used by the
 * `casing-instruction-json` CI job from the project registry instead
 * of requiring authors to hand-edit the literal `include:` block in
 * `.github/workflows/ci.yml` every time a new standalone-script
 * project is added.
 *
 * Source of truth (in priority order):
 *
 *   1. `scripts/check-standalone-dist.mjs` → `REQUIRED_ARTIFACTS`
 *      The authoritative map of "projects that produce a dist/ bundle
 *      with instruction.json + instruction.compat.json". Every key in
 *      this map MUST appear in the casing matrix — the casing checker
 *      runs against exactly the projects that emit those two files.
 *
 *   2. `standalone-scripts/<name>/src/instruction.ts` (must exist)
 *      Cross-check: a project listed in REQUIRED_ARTIFACTS but missing
 *      `src/instruction.ts` is a wiring bug — fail loudly so the
 *      registry doesn't drift silently.
 *
 *   3. `.github/workflows/ci.yml` `build-<name>:` job (must exist)
 *      Cross-check: the casing job downloads the artifact uploaded by
 *      `build-<name>`. If that build job is missing, the matrix leg
 *      would always fail at the `download-artifact` step. Detect at
 *      derive-time so a misconfiguration is a single clear error
 *      instead of a confusing per-leg download failure.
 *
 * Artifact-name convention (also derived, not hand-typed):
 *
 *   - `marco-sdk` → `sdk-dist`   (legacy short name kept for back-compat
 *                                  with existing artifact consumers)
 *   - everyone else → `<name>-dist`
 *
 * Dist-path convention:
 *
 *   - `standalone-scripts/<name>/dist`
 *
 * Outputs (CLI):
 *
 *   default
 *     Pretty JSON with { include: [...] } — copy/pasteable into the
 *     matrix block for humans verifying the derivation.
 *
 *   --compact
 *     Single-line JSON of the include array — the exact shape
 *     `fromJSON()` expects in GitHub Actions matrix expansion.
 *
 *   --github-output
 *     Compact JSON written to $GITHUB_OUTPUT under the key `matrix`
 *     so a workflow job can expose it via `outputs:` to consuming jobs:
 *
 *       outputs:
 *         matrix: ${{ steps.derive.outputs.matrix }}
 *
 *   --check
 *     Re-parse `.github/workflows/ci.yml` and assert that the static
 *     `needs:` list of the `casing-instruction-json` job (which CANNOT
 *     be expression-evaluated in GitHub Actions — `needs:` must be
 *     literal YAML strings) matches the set of `build-<name>` jobs
 *     implied by the derived matrix. Exits 1 with a precise diff if
 *     they drift. This is the safety net that keeps "adding a new
 *     project requires fewer YAML edits" honest — the derived matrix
 *     gives you the per-leg automation, and this check forces the
 *     ONE remaining manual edit (extending `needs:`) to happen.
 *
 * Exit codes:
 *   0 — matrix derived (and `--check` passed if requested)
 *   1 — wiring inconsistency (registry/instruction.ts/build job mismatch
 *       OR `--check` detected `needs:` drift)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STANDALONE_DIR = path.join(ROOT, "standalone-scripts");
const CHECK_DIST_FILE = path.join(ROOT, "scripts", "check-standalone-dist.mjs");
const CI_YAML_FILE = path.join(ROOT, ".github", "workflows", "ci.yml");

// ── 1. Load the authoritative project list from REQUIRED_ARTIFACTS. ──
//
// `check-standalone-dist.mjs` is a SCRIPT (not a library) — its top-level
// code calls `process.exit(1)` when dist/ folders are missing. Importing
// it would side-effect-fail in any environment that hasn't built the
// standalones yet (CI's casing job, fresh clones, IDE inspections).
//
// So we regex-parse the literal `REQUIRED_ARTIFACTS = { … };` instead.
// The literal is plain JS object syntax with double-quoted keys/values
// and no trailing commas — safe to JSON.parse after a quick scrub.
// (If REQUIRED_ARTIFACTS ever grows comments or expressions, switch to
// a real JS parser or formally export the constant from that module.)
function loadRequiredArtifacts() {
    const src = fs.readFileSync(CHECK_DIST_FILE, "utf8");
    const m = src.match(/const REQUIRED_ARTIFACTS\s*=\s*(\{[\s\S]*?\n\});/);
    if (!m) {
        console.error("[derive-casing-matrix] Could not locate REQUIRED_ARTIFACTS in scripts/check-standalone-dist.mjs");
        process.exit(1);
    }
    // The literal is plain JS object syntax with double-quoted keys/values
    // and no trailing commas — safe to JSON.parse after a quick scrub.
    // (If REQUIRED_ARTIFACTS ever grows comments or expressions, switch
    // to a real JS parser.)
    let literal = m[1];
    literal = literal.replace(/\/\/[^\n]*/g, ""); // strip line comments
    literal = literal.replace(/,\s*([}\]])/g, "$1"); // strip trailing commas
    try {
        return JSON.parse(literal);
    } catch (err) {
        console.error(`[derive-casing-matrix] Could not parse REQUIRED_ARTIFACTS literal as JSON: ${err.message}\nLiteral was:\n${literal}`);
        process.exit(1);
    }
}

const REQUIRED_ARTIFACTS = loadRequiredArtifacts();

// ── 2. Build the matrix include[] in deterministic alphabetical order ──
//      so PR diffs to the derived JSON are stable and reviewable.
const projectNames = Object.keys(REQUIRED_ARTIFACTS).sort((a, b) => a.localeCompare(b));

const errors = [];
const include = [];

// Naming convention helpers — colocated so the legacy `marco-sdk` →
// `sdk-dist` / `build-sdk` mapping is documented in one place. If/when
// the SDK build is renamed, update both here AND in `.github/workflows/ci.yml`.
function artifactNameFor(project) {
    return project === "marco-sdk" ? "sdk-dist" : `${project}-dist`;
}
function buildJobNameFor(project) {
    return project === "marco-sdk" ? "build-sdk" : `build-${project}`;
}

for (const project of projectNames) {
    const distPath = `standalone-scripts/${project}/dist`;
    const artifact = artifactNameFor(project);

    // Cross-check 1: src/instruction.ts must exist.
    const instructionTs = path.join(STANDALONE_DIR, project, "src", "instruction.ts");
    if (!fs.existsSync(instructionTs)) {
        errors.push(
            `Project '${project}' is in REQUIRED_ARTIFACTS but ${path.relative(ROOT, instructionTs)} is missing. ` +
            `The casing checker has nothing to validate the dist JSON against — either add the source file or remove the project from REQUIRED_ARTIFACTS.`
        );
        continue;
    }

    include.push({ project, artifact, "dist-path": distPath });
}

// ── 3. Cross-check 2: every project must have its build job in ci.yml ──
const ciSrc = fs.existsSync(CI_YAML_FILE) ? fs.readFileSync(CI_YAML_FILE, "utf8") : "";
for (const entry of include) {
    const jobName = buildJobNameFor(entry.project);
    const jobHeader = new RegExp(`^\\s{2}${jobName}\\s*:`, "m");
    if (!jobHeader.test(ciSrc)) {
        errors.push(
            `Project '${entry.project}' is in REQUIRED_ARTIFACTS but no \`${jobName}:\` job exists in .github/workflows/ci.yml. ` +
            `The matrix leg would fail at the artifact download step — add a build job that uploads artifact '${entry.artifact}'.`
        );
    }
}

if (errors.length > 0) {
    console.error("[derive-casing-matrix] Wiring inconsistencies detected:\n");
    for (const e of errors) console.error("  • " + e);
    process.exit(1);
}

// ── 4. CLI mode dispatch ─────────────────────────────────────────────
const args = process.argv.slice(2);
const wantsCompact = args.includes("--compact");
const wantsGithubOutput = args.includes("--github-output");
const wantsCheck = args.includes("--check");

const compactJson = JSON.stringify(include);
const prettyJson = JSON.stringify({ include }, null, 2);

if (wantsGithubOutput) {
    const ghOut = process.env.GITHUB_OUTPUT;
    if (!ghOut) {
        console.error("[derive-casing-matrix] --github-output requires the GITHUB_OUTPUT env var (only set inside GitHub Actions).");
        process.exit(1);
    }
    fs.appendFileSync(ghOut, `matrix=${compactJson}\n`);
    console.log(`[derive-casing-matrix] Wrote matrix output (${include.length} entries) to $GITHUB_OUTPUT.`);
    for (const e of include) console.log(`   • ${e.project} → ${e.artifact} → ${e["dist-path"]}`);
}

if (wantsCheck) {
    // Locate the casing-instruction-json job and extract its `needs:` list.
    // We do a minimal block scan rather than pulling in a YAML parser
    // dep, since the workflow file format is stable and 2-space indented.
    const jobAnchor = ciSrc.indexOf("\n  casing-instruction-json:");
    if (jobAnchor === -1) {
        console.error("[derive-casing-matrix] --check: could not locate `casing-instruction-json:` job in ci.yml");
        process.exit(1);
    }
    const tail = ciSrc.slice(jobAnchor);
    // `needs:` block: allow comment-only lines (`      # …`) and blank
    // lines between `needs:` and the first list entry, then capture
    // every `      - <name>` line until the indentation drops.
    const needsMatch = tail.match(
        /\n\s{4}needs:\s*\n((?:\s{6}(?:#[^\n]*|-\s*\S+)\s*\n|\s*\n)+)/,
    );
    if (!needsMatch) {
        console.error("[derive-casing-matrix] --check: `needs:` block not found in `casing-instruction-json:` job (or uses inline list syntax this checker does not handle).");
        process.exit(1);
    }
    const declaredNeeds = needsMatch[1]
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.startsWith("- "))
        .map((line) => line.replace(/^-\s*/, ""))
        .sort();

    const expectedBuildJobs = include.map((e) => buildJobNameFor(e.project)).sort();
    // Allow extra unrelated `needs` entries (none today, but future-proof);
    // only flag missing required entries.
    const missing = expectedBuildJobs.filter((j) => !declaredNeeds.includes(j));
    const extra = declaredNeeds.filter((j) => j.startsWith("build-") && !expectedBuildJobs.includes(j));

    if (missing.length > 0 || extra.length > 0) {
        console.error("[derive-casing-matrix] --check: `needs:` block of casing-instruction-json drifted from derived matrix.\n");
        if (missing.length > 0) {
            console.error("  Missing from `needs:` (must add — `needs:` cannot be a GitHub Actions expression):");
            for (const m of missing) console.error(`    - ${m}`);
        }
        if (extra.length > 0) {
            console.error("  Extra `build-*` entries in `needs:` (referenced project no longer in REQUIRED_ARTIFACTS):");
            for (const x of extra) console.error(`    - ${x}`);
        }
        console.error("\n  Derived matrix (alphabetical):");
        for (const e of include) console.error(`    - ${e.project}  →  artifact ${e.artifact}  →  ${e["dist-path"]}`);
        process.exit(1);
    }
    console.log(`[derive-casing-matrix] --check: OK. \`needs:\` covers all ${expectedBuildJobs.length} derived build jobs.`);
}

// Default human-readable output last so it's always visible (unless
// --github-output already printed its own summary).
if (!wantsGithubOutput) {
    console.log(wantsCompact ? compactJson : prettyJson);
}
