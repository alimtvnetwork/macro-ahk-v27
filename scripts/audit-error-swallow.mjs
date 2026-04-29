#!/usr/bin/env node
/**
 * Marco Extension — Error-Swallowing Audit Generator
 *
 * Produces `public/error-swallow-audit.json` consumed by the
 * Options ▸ "Error-swallowing audit" panel
 * (`src/components/options/ErrorSwallowAuditView.tsx`).
 *
 * Implementation strategy:
 *   1. Reuse `scripts/check-no-swallowed-errors.mjs --json` as the
 *      single source of truth for raw findings — that scanner is
 *      already the CI guard, so we never diverge from what blocks
 *      builds.
 *   2. Classify each finding into P0 / P1 / P2 based on path:
 *        P0 — auth, bridge, injection, boot, logging-handler        (silent failure here = lost user data / broken extension)
 *        P1 — background handlers, recorder, content scripts        (impacts feature reliability)
 *        P2 — UI components, hooks, popup, options                  (defensive UX layer)
 *   3. Emit the report shape declared in the view’s data contract:
 *        { GeneratedAt, Items: [{ Id, Severity, File, Line, Rule, Message, Snippet }] }
 *
 * Usage:
 *   node scripts/audit-error-swallow.mjs                     # writes public/error-swallow-audit.json
 *   node scripts/audit-error-swallow.mjs --out=<path>        # custom output
 *   node scripts/audit-error-swallow.mjs --stdout            # print, do not write
 */

import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const DEFAULT_OUT = join(REPO_ROOT, "public", "error-swallow-audit.json");

/* ------------------------------------------------------------------ */
/*  CLI                                                                */
/* ------------------------------------------------------------------ */

const args = process.argv.slice(2);
const stdoutMode = args.includes("--stdout");
const outArg = args.find((a) => a.startsWith("--out="));
const outPath = stdoutMode ? null : (outArg ? resolve(REPO_ROOT, outArg.slice("--out=".length)) : DEFAULT_OUT);

/* ------------------------------------------------------------------ */
/*  Severity classification                                            */
/* ------------------------------------------------------------------ */

const P0_PATTERNS = [
    /^src\/background\/(auth|bridge|boot|service-worker)/,
    /^src\/background\/handlers\/(logging|injection|auth)/,
    /^src\/background\/script-resolver\.ts$/,
    /^src\/background\/auto-injector\.ts$/,
    /^src\/lib\/auth\//,
];

const P1_PATTERNS = [
    /^src\/background\//,
    /^src\/content-scripts\//,
    /^standalone-scripts\/macro-controller\//,
    /^src\/lib\/recorder/,
];

function classifySeverity(file) {
    for (const re of P0_PATTERNS) if (re.test(file)) return "P0";
    for (const re of P1_PATTERNS) if (re.test(file)) return "P1";
    return "P2";
}

/* ------------------------------------------------------------------ */
/*  Rule + message mapping                                             */
/* ------------------------------------------------------------------ */

function ruleFor(kind) {
    if (kind === "empty-catch") return "no-empty-catch";
    if (kind === "promise-catch-noop") return "no-noop-promise-catch";
    return `swallow-${kind}`;
}

function messageFor(kind) {
    if (kind === "empty-catch") return "Empty catch block — error is silently dropped, no Logger.error() call.";
    if (kind === "promise-catch-noop") return "Promise .catch() handler is a no-op — rejection is silently swallowed.";
    return "Caught error is not surfaced via Logger.error() or console.error().";
}

/* ------------------------------------------------------------------ */
/*  Stable Id                                                          */
/* ------------------------------------------------------------------ */

function stableId(file, line, kind, snippet) {
    return createHash("sha1")
        .update(`${file}|${line}|${kind}|${snippet ?? ""}`)
        .digest("hex")
        .slice(0, 12);
}

/* ------------------------------------------------------------------ */
/*  Run scanner                                                        */
/* ------------------------------------------------------------------ */

function runScanner() {
    const scanner = join(REPO_ROOT, "scripts", "check-no-swallowed-errors.mjs");
    const result = spawnSync(process.execPath, [scanner, "--json"], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024,
    });
    // Scanner exits 0 when all findings are baselined, non-zero when there are
    // new violations. Either way stdout is the JSON we want.
    if (!result.stdout || result.stdout.trim() === "") {
        const stderr = (result.stderr ?? "").trim();
        throw new Error(
            `Path: ${scanner}\nMissing: stdout JSON payload\nReason: scanner produced no output (exit=${result.status}, stderr=${stderr || "<empty>"})`,
        );
    }
    try {
        return JSON.parse(result.stdout);
    } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        throw new Error(
            `Path: ${scanner}\nMissing: parseable JSON\nReason: JSON.parse failed — ${reason}`,
        );
    }
}

/* ------------------------------------------------------------------ */
/*  Build report                                                       */
/* ------------------------------------------------------------------ */

function buildReport(scan) {
    const findings = Array.isArray(scan?.Findings) ? scan.Findings : [];
    const items = findings.map((f) => {
        const file = String(f.file ?? "");
        const line = Number.isInteger(f.line) ? f.line : 0;
        const kind = String(f.kind ?? "unknown");
        const snippet = typeof f.snippet === "string" ? f.snippet : null;
        return {
            Id: stableId(file, line, kind, snippet),
            Severity: classifySeverity(file),
            File: file,
            Line: line,
            Rule: ruleFor(kind),
            Message: messageFor(kind),
            Snippet: snippet,
        };
    });

    // Stable sort: severity (P0→P2), then file, then line.
    const order = { P0: 0, P1: 1, P2: 2 };
    items.sort((a, b) => {
        const sd = order[a.Severity] - order[b.Severity];
        if (sd !== 0) return sd;
        const fd = a.File.localeCompare(b.File);
        if (fd !== 0) return fd;
        return a.Line - b.Line;
    });

    return {
        GeneratedAt: new Date().toISOString(),
        Items: items,
    };
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

function main() {
    const scan = runScanner();
    const report = buildReport(scan);
    const json = JSON.stringify(report, null, 2) + "\n";

    if (stdoutMode) {
        process.stdout.write(json);
        return;
    }

    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, json, "utf8");

    const counts = report.Items.reduce(
        (acc, it) => { acc[it.Severity] += 1; acc.total += 1; return acc; },
        { P0: 0, P1: 1 - 1, P2: 0, total: 0 },
    );
    process.stdout.write(
        `Wrote ${outPath}\n  Total: ${counts.total}  P0: ${counts.P0}  P1: ${counts.P1}  P2: ${counts.P2}\n`,
    );
}

main();
