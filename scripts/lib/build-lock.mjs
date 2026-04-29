/**
 * Build lock sentinel — sequential gate for in-flight file writes.
 *
 * Writers (uploaders, IDE sync agents, scripted file installers) can
 * create `.lovable/build.lock` to signal "files in flight; do not run
 * verification yet". They MUST delete the file when their writes are
 * fully flushed.
 *
 * `waitForBuildLock()` is called at the top of the prebuild verifier.
 * It is a SINGLE fail-fast gate, not a retry/backoff loop:
 *   - If the lock file does not exist → return immediately.
 *   - If it exists → poll for its disappearance every POLL_MS until
 *     either the lock is gone (success) or the absolute DEADLINE_MS
 *     elapses (hard failure with full diagnostic message).
 *
 * Compatible with `mem://constraints/no-retry-policy`: this is a
 * sequential wait on an external readiness signal, not a recursive or
 * exponentially-backed-off retry of the verifier itself.
 */

import { existsSync, readFileSync, statSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..", "..");
export const BUILD_LOCK_PATH = resolve(REPO_ROOT, ".lovable/build.lock");

const POLL_MS = 250;
const DEFAULT_DEADLINE_MS = 60_000;

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Block until the build lock file is gone, or fail fast at the deadline.
 *
 * @param {object} [opts]
 * @param {number} [opts.deadlineMs] absolute wait budget (default 60s)
 * @param {string} [opts.lockPath]   override path (test isolation)
 * @returns {Promise<{ waited: boolean; waitedMs: number }>}
 */
export async function waitForBuildLock(opts = {}) {
    const lockPath = opts.lockPath ?? BUILD_LOCK_PATH;
    const deadlineMs = opts.deadlineMs ?? DEFAULT_DEADLINE_MS;

    if (!existsSync(lockPath)) {
        return { waited: false, waitedMs: 0 };
    }

    const startMs = Date.now();
    const holderInfo = readLockHolder(lockPath);
    console.log(
        "🔒 [build-lock] Waiting for in-flight writes to settle…\n"
        + `   Lock file   : ${lockPath}\n`
        + `   Holder      : ${holderInfo.holder}\n`
        + `   Created at  : ${holderInfo.createdAt}\n`
        + `   Deadline    : ${(deadlineMs / 1000).toFixed(0)}s\n`
        + `   Poll        : every ${POLL_MS}ms`
    );

    while (existsSync(lockPath)) {
        const elapsed = Date.now() - startMs;
        if (elapsed >= deadlineMs) {
            const finalHolder = readLockHolder(lockPath);
            const msg =
                "Build lock not released within deadline — refusing to run prebuild verification.\n"
                + `   Lock file     : ${lockPath}\n`
                + `   Holder        : ${finalHolder.holder}\n`
                + `   Created at    : ${finalHolder.createdAt}\n`
                + `   Waited        : ${(elapsed / 1000).toFixed(1)}s (deadline ${(deadlineMs / 1000).toFixed(0)}s)\n`
                + `   Reason        : The lock writer never deleted the sentinel file. Either the\n`
                + `                   uploader crashed, or the writer forgot to release the lock.\n`
                + `   Fix           : Confirm the writer process exited cleanly, then remove the\n`
                + `                   stale lock manually:  rm "${lockPath}"`;
            console.error(`\n❌ [build-lock] ${msg}\n`);
            const err = new Error("build-lock deadline exceeded");
            err.code = "EBUILDLOCK";
            throw err;
        }
        await sleep(POLL_MS);
    }

    const waitedMs = Date.now() - startMs;
    console.log(`✅ [build-lock] Lock released after ${waitedMs}ms — proceeding.`);
    return { waited: true, waitedMs };
}

/**
 * Acquire the build lock (writer side). Idempotent on the same holder;
 * fails fast if a different holder already owns the lock.
 *
 * @param {string} holder  identifier (e.g. "uploader:foo", PID-based)
 * @param {object} [opts]  { lockPath? }
 */
export function acquireBuildLock(holder, opts = {}) {
    const lockPath = opts.lockPath ?? BUILD_LOCK_PATH;
    if (existsSync(lockPath)) {
        const existing = readLockHolder(lockPath);
        if (existing.holder === holder) return; // idempotent
        throw new Error(
            `[build-lock] Lock already held by "${existing.holder}" since ${existing.createdAt}; `
            + `cannot acquire as "${holder}". Lock path: ${lockPath}`
        );
    }
    mkdirSync(dirname(lockPath), { recursive: true });
    writeFileSync(lockPath, JSON.stringify({
        Holder: holder,
        Pid: process.pid,
        CreatedAt: new Date().toISOString(),
    }, null, 2) + "\n", "utf8");
}

/** Release the build lock. Safe to call when no lock is held. */
export function releaseBuildLock(opts = {}) {
    const lockPath = opts.lockPath ?? BUILD_LOCK_PATH;
    if (!existsSync(lockPath)) return;
    try { unlinkSync(lockPath); } catch (err) { // allow-swallow: best-effort lock release; reported via console
        console.warn(`[build-lock] Could not remove ${lockPath}: ${err?.message ?? err}`);
    }
}

/* ------------------------------------------------------------------ */
/*  Internals                                                          */
/* ------------------------------------------------------------------ */

function sleep(ms) {
    return new Promise((r) => { setTimeout(r, ms); });
}

function readLockHolder(lockPath) {
    try {
        const raw = readFileSync(lockPath, "utf8");
        const parsed = JSON.parse(raw);
        return {
            holder: typeof parsed.Holder === "string" ? parsed.Holder : "(unknown)",
            createdAt: typeof parsed.CreatedAt === "string" ? parsed.CreatedAt : "(unknown)",
        };
    } catch {
        try {
            const s = statSync(lockPath);
            return { holder: "(unparseable lock file)", createdAt: s.mtime.toISOString() };
        } catch {
            return { holder: "(lock vanished)", createdAt: "(unknown)" };
        }
    }
}
