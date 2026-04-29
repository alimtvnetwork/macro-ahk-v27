#!/usr/bin/env node
/**
 * typecheck-app.mjs — Strict TypeScript gate for the main app
 *
 * Runs `tsc --noEmit` against every project referenced by the root
 * solution-style `tsconfig.json` (currently `tsconfig.app.json` and
 * `tsconfig.node.json`). Exists so a single command — and a single CI
 * job — covers the full app surface that the standalone-script
 * typecheck job (`typecheck-standalone`) does NOT touch.
 *
 * Why a wrapper script (vs `tsc -b --noEmit`):
 *   - We want each project to write its OWN `.tsbuildinfo` into a
 *     known cache path so GitHub Actions can cache them with a
 *     stable key (mirrors the pattern used in typecheck-standalone).
 *     `tsc -b` writes buildinfo next to each tsconfig — harder to
 *     cache, harder to invalidate.
 *   - We want hard-fail with a clear summary: which project errored,
 *     and how long each took. `tsc -b` aggregates output across
 *     projects and is harder to scan.
 *   - Sequential, fail-fast (Core no-retry policy). First project
 *     with errors aborts the run with that project's exit code.
 *
 * USAGE
 *   node scripts/typecheck-app.mjs            # all projects
 *   pnpm run typecheck                        # alias
 *
 * EXIT CODES
 *   0  every project typechecks clean
 *   N  the exit code of the first failing tsc invocation
 *
 * Author: Riseup Asia LLC
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const CACHE_DIR = path.join(REPO_ROOT, ".cache", "tsbuildinfo");

/**
 * Projects covered. Mirrors `references[]` in tsconfig.json. Add new
 * referenced projects here when the solution config grows.
 */
const PROJECTS = [
    { name: "app", tsconfig: "tsconfig.app.json", buildinfo: "app.tsbuildinfo" },
    { name: "node", tsconfig: "tsconfig.node.json", buildinfo: "node.tsbuildinfo" },
];

if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

console.log("[typecheck-app] strict TypeScript gate — sequential, fail-fast");
console.log("");

const totals = [];
for (const proj of PROJECTS) {
    const tsconfigPath = path.join(REPO_ROOT, proj.tsconfig);
    if (!fs.existsSync(tsconfigPath)) {
        console.error(`::error::Missing tsconfig: ${proj.tsconfig} (expected at ${tsconfigPath}). Project entry '${proj.name}' in scripts/typecheck-app.mjs PROJECTS[] points to a file that does not exist on disk; either restore the tsconfig or remove the entry.`);
        process.exit(1);
    }
    const buildinfoPath = path.join(CACHE_DIR, proj.buildinfo);
    const start = Date.now();
    process.stdout.write(`[typecheck-app] ${proj.name.padEnd(8)}  →  tsc --noEmit -p ${proj.tsconfig} ... `);
    const result = spawnSync(
        "npx",
        [
            "tsc",
            "--noEmit",
            "--incremental",
            "--tsBuildInfoFile",
            buildinfoPath,
            "-p",
            tsconfigPath,
        ],
        { stdio: ["ignore", "pipe", "pipe"], cwd: REPO_ROOT, encoding: "utf8" }
    );
    const ms = Date.now() - start;
    if (result.status === 0) {
        console.log(`OK (${ms}ms)`);
        totals.push({ name: proj.name, ms, status: 0 });
        continue;
    }
    console.log(`FAIL (${ms}ms, exit ${result.status})`);
    console.log("");
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    console.error("");
    console.error(`::error::TypeScript errors in project '${proj.name}' (${proj.tsconfig}). Fix every reported diagnostic above. CI runs this gate on every push and PR; the build will not proceed until tsc exits 0.`);
    process.exit(result.status ?? 1);
}

const totalMs = totals.reduce((a, t) => a + t.ms, 0);
console.log("");
console.log(`[typecheck-app] all projects clean (${totals.length}/${totals.length}, ${totalMs}ms total)`);
process.exit(0);
