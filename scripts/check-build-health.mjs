#!/usr/bin/env node
/**
 * check-build-health.mjs
 *
 * Aggregate build-health gate: runs the DB diagram drift check
 * plus the step-library file checks and prints ONE pass/fail summary.
 *
 * Sequential fail-fast aware: each sub-check runs to completion (so the
 * summary lists every check), but the overall exit code is non-zero if
 * any sub-check fails. No retries, no backoff.
 *
 * Usage:
 *   node scripts/check-build-health.mjs
 *   pnpm run check:build-health
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

/** @type {{ name: string; script: string; args: string[] }[]} */
const CHECKS = [
    {
        name: "DB diagram drift",
        script: "render-db-diagrams.mjs",
        args: ["--check"],
    },
    {
        name: "Step-library files present",
        script: "check-step-library-files.mjs",
        args: [],
    },
    {
        name: "result-webhook.ts present",
        script: "check-result-webhook.mjs",
        args: [],
    },
    {
        name: "result-webhook imports valid",
        script: "check-result-webhook-imports.mjs",
        args: [],
    },
];

/**
 * Run a single sub-check and return a result record.
 *
 * @param {{ name: string; script: string; args: string[] }} check
 * @returns {{ name: string; ok: boolean; code: number; durationMs: number }}
 */
function runCheck(check) {
    const scriptPath = path.join(SCRIPT_DIR, check.script);
    const startedAt = Date.now();

    process.stdout.write(`\n▶ ${check.name}  (${check.script})\n`);

    const result = spawnSync(process.execPath, [scriptPath, ...check.args], {
        stdio: "inherit",
    });

    const durationMs = Date.now() - startedAt;
    const code = typeof result.status === "number" ? result.status : 1;
    const ok = code === 0 && result.error === undefined;

    return { name: check.name, ok, code, durationMs };
}

const results = CHECKS.map(runCheck);
const failed = results.filter((entry) => entry.ok === false);

process.stdout.write("\n──────────── Build Health Summary ────────────\n");
for (const entry of results) {
    const icon = entry.ok ? "✓" : "✗";
    const status = entry.ok ? "PASS" : `FAIL (exit ${entry.code})`;
    process.stdout.write(
        `  ${icon}  ${entry.name.padEnd(36, " ")} ${status}  [${entry.durationMs}ms]\n`,
    );
}
process.stdout.write("──────────────────────────────────────────────\n");

if (failed.length > 0) {
    process.stdout.write(
        `\n✗ Build health: FAIL — ${failed.length}/${results.length} check(s) failed.\n`,
    );
    process.stdout.write(
        `  Failing: ${failed.map((entry) => entry.name).join(", ")}\n`,
    );
    process.exit(1);
}

process.stdout.write(
    `\n✓ Build health: PASS — ${results.length}/${results.length} checks passed.\n`,
);
process.exit(0);
