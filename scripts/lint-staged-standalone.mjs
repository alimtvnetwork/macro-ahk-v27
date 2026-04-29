#!/usr/bin/env node
/**
 * lint-staged-standalone.mjs — pre-commit ESLint gate for standalone-scripts
 *
 * Runs ESLint with `--max-warnings=0` on the subset of git-staged files
 * that live under `standalone-scripts/**` and have a TS/TSX extension.
 * Catches the same class of issues the CI `lint-standalone` job catches
 * (e.g. `sonarjs/no-nested-template-literals`) BEFORE the developer
 * pushes, where the round-trip is cheap.
 *
 * Sequential, fail-fast (Core no-retry policy):
 *   - One pass over the staged file list.
 *   - One ESLint invocation with the filtered file list.
 *   - Non-zero exit aborts the commit.
 *
 * Zero new dependencies — pure git + ESLint already on disk. Mirrors the
 * project's "no husky / no lint-staged" preference (see scripts/build-*.mjs).
 *
 * USAGE
 *   node scripts/lint-staged-standalone.mjs           # invoked by .git/hooks/pre-commit
 *   node scripts/lint-staged-standalone.mjs --all     # lint every standalone TS file (no git filter)
 *
 * BYPASS (escape hatch — discouraged, audit trail in git log)
 *   git commit --no-verify ...
 *
 * Author: Riseup Asia LLC
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const ALL_MODE = process.argv.includes("--all");

/* ---------------------------------------------------------------- */
/*  1. Collect staged files                                          */
/* ---------------------------------------------------------------- */

function getStagedFiles() {
    const result = spawnSync(
        "git",
        ["diff", "--cached", "--name-only", "--diff-filter=ACMR"],
        { cwd: REPO_ROOT, encoding: "utf8" }
    );
    if (result.status !== 0) {
        const detail = (result.stderr ?? "").trim() || `exit ${result.status}`;
        console.error(`[pre-commit] FAIL — git diff --cached failed (${detail}). Cannot determine staged files. Repo: ${REPO_ROOT}.`);
        process.exit(1);
    }
    return (result.stdout ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
}

function getAllStandaloneTsFiles() {
    const result = spawnSync("git", ["ls-files", "standalone-scripts/**/*.ts", "standalone-scripts/**/*.tsx"], {
        cwd: REPO_ROOT,
        encoding: "utf8",
    });
    if (result.status !== 0) {
        console.error("[pre-commit] FAIL — git ls-files failed. Cannot enumerate standalone-scripts/**.");
        process.exit(1);
    }
    return (result.stdout ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
}

/* ---------------------------------------------------------------- */
/*  2. Filter to standalone-scripts TS/TSX                           */
/* ---------------------------------------------------------------- */

function filterStandaloneLintable(files) {
    return files.filter((f) => {
        if (!f.startsWith("standalone-scripts/")) return false;
        if (!/\.tsx?$/.test(f)) return false;
        // Skip generated artifacts (dist) and vendored deps (node_modules).
        if (f.includes("/dist/")) return false;
        if (f.includes("/node_modules/")) return false;
        return true;
    });
}

const candidateFiles = ALL_MODE ? getAllStandaloneTsFiles() : getStagedFiles();
const lintTargets = filterStandaloneLintable(candidateFiles);

if (lintTargets.length === 0) {
    const reason = ALL_MODE ? "no standalone TS files in repo" : "no staged standalone-scripts TS/TSX files";
    console.log(`[pre-commit] skip — ${reason}.`);
    process.exit(0);
}

console.log(`[pre-commit] eslint --max-warnings=0 on ${lintTargets.length} standalone-scripts file(s)`);
for (const f of lintTargets) console.log(`  ·  ${f}`);

/* ---------------------------------------------------------------- */
/*  3. Invoke ESLint (sequential, fail-fast)                         */
/* ---------------------------------------------------------------- */

const eslintArgs = ["eslint", "--max-warnings=0", "--no-warn-ignored", ...lintTargets];
const eslintResult = spawnSync("npx", eslintArgs, {
    cwd: REPO_ROOT,
    stdio: "inherit",
    env: process.env,
});

if (eslintResult.status !== 0) {
    console.error("");
    console.error(`[pre-commit] FAIL — ESLint reported errors or warnings (exit ${eslintResult.status}).`);
    console.error("[pre-commit] Fix the diagnostics above, re-stage, and commit again.");
    console.error("[pre-commit] Bypass (audited in git log): git commit --no-verify");
    process.exit(eslintResult.status ?? 1);
}

console.log("[pre-commit] OK — standalone-scripts lint clean.");

/* ---------------------------------------------------------------- */
/*  4. Hard-pinned scanner: no nested template literals              */
/* ---------------------------------------------------------------- */
// Always run (no staged-file filter) — TARGETS[] is small + scan is
// <100ms. Catches sonarjs-class regressions in pinned files even if
// the developer didn't stage that file (e.g. it was reverted partly
// in a different commit).
const nestedTplResult = spawnSync("node", ["scripts/check-no-nested-template-literals.mjs"], {
    cwd: REPO_ROOT,
    stdio: "inherit",
    env: process.env,
});
if (nestedTplResult.status !== 0) {
    console.error("");
    console.error(`[pre-commit] FAIL — nested-template-literal scanner reported violations (exit ${nestedTplResult.status}).`);
    console.error("[pre-commit] Bypass (audited in git log): git commit --no-verify");
    process.exit(nestedTplResult.status ?? 1);
}

process.exit(0);
