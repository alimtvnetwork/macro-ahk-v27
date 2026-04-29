#!/usr/bin/env node
/**
 * run-with-env.mjs — Cross-platform env-var-then-command runner
 *
 * Replaces the need for `cross-env` (not installed) inside package.json
 * scripts. Sets one or more KEY=VALUE pairs into process.env, then spawns
 * the command after the `--` separator with those env vars inherited.
 *
 * Sequential, fail-fast: exits with the child's exit code (no retry).
 *
 * USAGE
 *   node scripts/run-with-env.mjs KEY=VAL [KEY2=VAL2 ...] -- <command> [args...]
 *
 * EXAMPLE
 *   node scripts/run-with-env.mjs STANDALONE_BUILD_NO_CACHE=1 -- pnpm run build:extension
 *
 * Author: Riseup Asia LLC
 */

import { spawn } from "node:child_process";

const argv = process.argv.slice(2);
const sep = argv.indexOf("--");
if (sep === -1 || sep === argv.length - 1) {
    console.error("[run-with-env] Missing `--` separator or command.");
    console.error("Usage: run-with-env.mjs KEY=VAL [KEY2=VAL2 ...] -- <command> [args...]");
    process.exit(2);
}

const envPairs = argv.slice(0, sep);
const commandParts = argv.slice(sep + 1);

const childEnv = { ...process.env };
for (const pair of envPairs) {
    const eq = pair.indexOf("=");
    if (eq <= 0) {
        console.error(`[run-with-env] Invalid env pair: '${pair}' (expected KEY=VALUE).`);
        process.exit(2);
    }
    const key = pair.slice(0, eq);
    const value = pair.slice(eq + 1);
    childEnv[key] = value;
}

const [cmd, ...args] = commandParts;
const child = spawn(cmd, args, { stdio: "inherit", env: childEnv, shell: process.platform === "win32" });
child.on("exit", (code, signal) => {
    if (signal) {
        console.error(`[run-with-env] Child terminated by signal ${signal}.`);
        process.exit(1);
    }
    process.exit(code ?? 0);
});
child.on("error", (err) => {
    console.error(`[run-with-env] Failed to spawn '${cmd}': ${err.message}`);
    process.exit(1);
});
