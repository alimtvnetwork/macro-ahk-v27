#!/usr/bin/env node
/**
 * verify-worktree-fresh.mjs
 *
 * Confirms the build sandbox is observing a stable, post-checkout working
 * tree before Rollup runs. Prevents the "transient ENOENT / stale content"
 * class of false negatives where a file is mid-write (or freshly checked
 * out but not yet flushed) when the bundler starts.
 *
 * Strategy (no retries — sequential fail-fast per the no-retry policy):
 *   1. Force a fresh `fs.readFileSync` of every critical source file
 *      (bypassing any module/import cache) and hash the bytes.
 *   2. Settle for SETTLE_MS, then re-read and re-hash the same files.
 *   3. If size, mtime, or hash changed between the two reads → the working
 *      tree is still being mutated; abort with an actionable report so CI
 *      can fail loudly instead of feeding stale bytes to Rollup.
 *   4. Also fail if any critical file is missing, empty, or zero-mtime.
 *
 * Critical-file list intentionally narrow: the modules whose absence has
 * historically produced the `vite:load-fallback` ENOENT error, plus their
 * directory index. Extend EXPECTED_FILES below as new hot-spots appear.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SETTLE_MS = 250;

const STEP_LIB_DIR = "src/background/recorder/step-library";
const EXPECTED_FILES = [
    `${STEP_LIB_DIR}/index.ts`,
    `${STEP_LIB_DIR}/result-webhook.ts`,
    `${STEP_LIB_DIR}/run-batch.ts`,
    `${STEP_LIB_DIR}/run-group-runner.ts`,
    `${STEP_LIB_DIR}/replay-bridge.ts`,
    `${STEP_LIB_DIR}/schema.ts`,
];

function fail(msg) {
    console.error("\n❌ [verify-worktree-fresh] " + msg + "\n");
    process.exit(1);
}

function snapshotFile(rel) {
    const abs = join(ROOT, rel);
    if (!existsSync(abs)) {
        return { rel, abs, present: false };
    }
    const stat = statSync(abs);
    if (!stat.isFile()) {
        return { rel, abs, present: true, isFile: false };
    }
    // Bypass any V8 / loader / require cache by reading raw bytes from disk.
    const bytes = readFileSync(abs);
    const hash = createHash("sha256").update(bytes).digest("hex");
    return {
        rel,
        abs,
        present: true,
        isFile: true,
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        sha256: hash,
        bytesRead: bytes.length,
    };
}

function describeSnap(s) {
    if (!s.present) return "missing";
    if (!s.isFile) return "not-a-file";
    return `size=${s.size}B mtimeMs=${s.mtimeMs} sha256=${s.sha256.slice(0, 12)}…`;
}

async function main() {
    console.log("🔬 [verify-worktree-fresh] Snapshotting critical source files (pass 1)…");
    const first = EXPECTED_FILES.map(snapshotFile);

    // Hard failures from pass 1 (don't bother with the settle).
    const missing = first.filter((s) => !s.present);
    const notFiles = first.filter((s) => s.present && !s.isFile);
    const empty = first.filter((s) => s.present && s.isFile && s.size === 0);

    if (missing.length > 0 || notFiles.length > 0 || empty.length > 0) {
        const lines = [];
        lines.push("Working tree validation failed before settle.");
        for (const s of missing) {
            lines.push("   • MISSING : " + s.rel);
            lines.push("       checked path : " + s.abs);
            lines.push("       file:// URL  : " + pathToFileURL(s.abs).href);
            lines.push("       reason       : file does not exist on disk; Rollup will throw ENOENT.");
        }
        for (const s of notFiles) {
            lines.push("   • NOT A FILE : " + s.rel + " (" + s.abs + ")");
        }
        for (const s of empty) {
            lines.push("   • EMPTY : " + s.rel);
            lines.push("       size         : 0 bytes");
            lines.push("       reason       : empty module cannot expose its expected exports.");
        }
        lines.push("");
        lines.push("   Fix: ensure the checkout completed (`git status` clean) and re-run.");
        fail(lines.join("\n"));
    }

    console.log(`   pass 1 ok — ${first.length} files present, settling ${SETTLE_MS}ms…`);
    await sleep(SETTLE_MS);

    console.log("🔬 [verify-worktree-fresh] Re-snapshotting critical source files (pass 2)…");
    const second = EXPECTED_FILES.map(snapshotFile);

    const drifts = [];
    for (let i = 0; i < first.length; i++) {
        const a = first[i];
        const b = second[i];
        if (!b.present || !b.isFile) {
            drifts.push({ rel: a.rel, kind: "vanished", a, b });
            continue;
        }
        if (a.size !== b.size || a.mtimeMs !== b.mtimeMs || a.sha256 !== b.sha256) {
            drifts.push({ rel: a.rel, kind: "mutated", a, b });
        }
    }

    if (drifts.length > 0) {
        const lines = [];
        lines.push("Working tree is still being mutated — refusing to feed unstable files to Rollup.");
        for (const d of drifts) {
            lines.push("   • " + d.kind.toUpperCase() + " : " + d.rel);
            lines.push("       path        : " + d.a.abs);
            lines.push("       pass 1      : " + describeSnap(d.a));
            lines.push("       pass 2      : " + describeSnap(d.b));
            lines.push("       reason      : file changed between snapshots " + SETTLE_MS + "ms apart " +
                "(active checkout, hot-reload, or concurrent writer).");
        }
        lines.push("");
        lines.push("   Fix: wait for the checkout / writer to finish (or increase SETTLE_MS) and re-run.");
        fail(lines.join("\n"));
    }

    console.log(`   ✓ ${second.length} files stable across ${SETTLE_MS}ms settle (size + mtime + sha256 match)`);
    console.log("✅ [verify-worktree-fresh] Working tree is fresh and stable — safe to bundle.\n");
}

main().catch((err) => {
    fail("Unexpected validator error: " + (err?.stack ?? err));
});
