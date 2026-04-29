#!/usr/bin/env node
/**
 * check-installer-constants-clean.mjs
 *
 * Belt-and-braces complement to check-installer-contract.mjs.
 *
 * Where check-installer-contract.mjs imports the generator and diffs
 * its in-memory output against the committed files, this script runs
 * the generator AS A SUBPROCESS — exactly the way a developer or CI
 * job would invoke it via `npm run installer:contract:gen` — and then
 * asserts the working tree has no uncommitted changes to the two
 * generated files:
 *
 *   scripts/installer-constants.sh
 *   scripts/installer-constants.ps1
 *
 * Why both checks?
 *   - The in-memory check catches contract drift cheaply with no git
 *     dependency (runs in any sandbox).
 *   - This check catches a separate failure mode: the generator's CLI
 *     entry point misbehaves (wrong cwd, EOL handling, missing flush,
 *     side-effects on other files) in a way the in-memory path hides.
 *   - It also gives the operator the literal `git diff` they would see
 *     locally — easier triage than "files differ".
 *
 * Exits 0 on a clean tree, 1 on any diff or git failure.
 *
 * Wire: `npm run check:installer-constants-clean` (CI uses the npm
 * alias; local devs can run the file directly).
 */
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const GENERATOR = resolve(__dirname, "generate-installer-constants.mjs");
const TARGETS = [
    "scripts/installer-constants.sh",
    "scripts/installer-constants.ps1",
];

/** Run a command, streaming stderr; return { status, stdout }. */
function run(cmd, args, options = {}) {
    const result = spawnSync(cmd, args, {
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "inherit"],
        ...options,
    });

    if (result.error) {
        process.stderr.write(
            `✗ failed to spawn ${cmd}: ${result.error.message}\n`,
        );
        process.exit(1);
    }

    return { status: result.status ?? 1, stdout: result.stdout ?? "" };
}

// ── 0. Sanity: git must be available and we must be inside a repo ───
const inRepo = run("git", ["rev-parse", "--is-inside-work-tree"]);
if (inRepo.status !== 0 || inRepo.stdout.trim() !== "true") {
    process.stderr.write(
        "✗ Not inside a git working tree — this check requires git " +
            "(use scripts/check-installer-contract.mjs in non-git sandboxes).\n",
    );
    process.exit(1);
}

// ── 1. Snapshot pre-existing diff so we don't blame the generator ───
// If the targets are ALREADY dirty before we run, that's the operator's
// problem, not the generator's. We surface both states clearly.
const preDiff = run("git", ["diff", "--name-only", "--", ...TARGETS]);
const preDirty = preDiff.stdout.trim().length > 0;
if (preDirty) {
    process.stderr.write(
        "✗ installer-constants.{sh,ps1} were ALREADY modified before " +
            "running the generator — refusing to mask pre-existing edits:\n" +
            preDiff.stdout +
            "\nCommit, stash, or `git checkout -- " +
            TARGETS.join(" ") +
            "` first, then re-run.\n",
    );
    process.exit(1);
}

// ── 2. Re-generate in place via the canonical CLI entry point ───────
const gen = run(process.execPath, [GENERATOR]);
if (gen.status !== 0) {
    process.stderr.write(
        `✗ generate-installer-constants.mjs exited with code ${gen.status}\n`,
    );
    process.exit(1);
}

// ── 3. Assert clean working tree on the generated targets ───────────
const postDiff = run("git", ["diff", "--", ...TARGETS]);
if (postDiff.stdout.trim().length > 0) {
    process.stderr.write(
        "✗ installer-constants.{sh,ps1} are OUT OF SYNC with " +
            "installer-contract.json.\n\n" +
            "The CLI generator produced different content than what is " +
            "committed. Run locally and commit:\n\n" +
            "  npm run installer:contract:gen\n\n" +
            "Diff:\n" +
            postDiff.stdout,
    );
    process.exit(1);
}

process.stdout.write(
    "✓ installer-constants.{sh,ps1} regenerate cleanly — no uncommitted diffs\n",
);
