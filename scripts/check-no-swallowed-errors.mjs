#!/usr/bin/env node
/**
 * CI guard — flags swallowed errors.
 *
 * Empty catch blocks and no-op promise `.catch()` handlers are the
 * single biggest source of silently-lost diagnostics in this repo
 * (see `mem://standards/error-logging-via-namespace-logger`,
 * `mem://constraints/file-path-error-logging-code-red`,
 * `mem://standards/error-logging-requirements`).
 *
 * This guard is the automated counterpart to those rules: every
 * caught error MUST either be re-thrown, logged via
 * `RiseupAsiaMacroExt.Logger.error()` / `console.error` /
 * `Logger.error`, or explicitly waived with a trailing comment of
 * the form:
 *
 *     } catch (err) { // allow-swallow: <reason>
 *
 * or, for promise chains:
 *
 *     .catch(() => {}) // allow-swallow: <reason>
 *
 * Detected patterns:
 *   1. `catch (...) { }` with a whitespace-only body
 *   2. `catch { }`        (TS optional-binding, whitespace-only body)
 *   3. `.catch(() => {})` and `.catch((_) => {})`
 *   4. `.catch(() => null|undefined|void 0|"")`
 *   5. `.catch(() => 0|false)`
 *   6. `.catch(noop)` where `noop` is a literal identifier from the
 *      explicit NO_OP_IDENTIFIERS list below
 *
 * NOT detected (intentionally, to avoid false positives):
 *   - catch blocks containing any statement, even a bare comment;
 *     spec/02-coding-guidelines explicitly allows comment-only
 *     blocks as documented intentional swallows.
 *   - `.catch(handler)` where `handler` is a non-trivial reference;
 *     the static analysis can't follow it. Use the waiver if needed.
 *
 * Usage:
 *   node scripts/check-no-swallowed-errors.mjs            # repo scan
 *   node scripts/check-no-swallowed-errors.mjs --json     # machine output
 *   node scripts/check-no-swallowed-errors.mjs --root=<d> # test isolation
 */

import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from "node:fs";
import { resolve, dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT_DEFAULT = resolve(__dirname, "..");

/* ------------------------------------------------------------------ */
/*  CLI                                                                */
/* ------------------------------------------------------------------ */

const args = process.argv.slice(2);
const jsonMode = args.includes("--json");
const FLAG_UPDATE_BASELINE = args.includes("--update-baseline");
const FLAG_STRICT = args.includes("--strict");
const rootArg = args.find((a) => a.startsWith("--root="));
const ROOT = rootArg ? resolve(rootArg.slice("--root=".length)) : REPO_ROOT_DEFAULT;
const BASELINE_PATH = resolve(ROOT, "scripts/check-no-swallowed-errors.baseline.json");
const BASELINE_LABEL = "scripts/check-no-swallowed-errors.baseline.json";

/* ------------------------------------------------------------------ */
/*  Configuration                                                      */
/* ------------------------------------------------------------------ */

const SCAN_DIRS = ["src", "standalone-scripts"];
const SCAN_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts", ".cts"]);
const SKIP_DIR_NAMES = new Set([
    "node_modules", "dist", "build", ".release", "skipped",
    "__tests__", "__mocks__", "test_reports", ".turbo", ".vite",
    "coverage",
]);
const SKIP_FILENAME_PATTERNS = [
    /\.test\.[mc]?[jt]sx?$/,
    /\.spec\.[mc]?[jt]sx?$/,
    /\.d\.ts$/,
];
const NO_OP_IDENTIFIERS = new Set(["noop", "NOOP", "noOp", "swallow", "ignore", "ignoreError"]);
const WAIVER_RE = /\/\/\s*allow-swallow\s*:/;

/* ------------------------------------------------------------------ */
/*  File walking                                                       */
/* ------------------------------------------------------------------ */

function walk(dir, out) {
    let entries;
    try {
        entries = readdirSync(dir);
    } catch {
        return;
    }
    for (const name of entries) {
        if (SKIP_DIR_NAMES.has(name)) continue;
        const full = join(dir, name);
        let st;
        try { st = statSync(full); } catch { continue; }
        if (st.isDirectory()) {
            walk(full, out);
            continue;
        }
        if (!st.isFile()) continue;
        if (SKIP_FILENAME_PATTERNS.some((re) => re.test(name))) continue;
        const dot = name.lastIndexOf(".");
        if (dot < 0) continue;
        const ext = name.slice(dot);
        if (!SCAN_EXTENSIONS.has(ext)) continue;
        out.push(full);
    }
}

function collectFiles() {
    const files = [];
    for (const rel of SCAN_DIRS) {
        const abs = join(ROOT, rel);
        try {
            if (statSync(abs).isDirectory()) walk(abs, files);
        } catch {
            // Directory absent in some test fixtures — skip.
        }
    }
    return files;
}

/* ------------------------------------------------------------------ */
/*  Source preprocessing                                               */
/* ------------------------------------------------------------------ */

/**
 * Strip block comments and string/template/regex literal contents
 * (replacing them with same-length spaces to preserve offsets) so the
 * pattern matcher doesn't fire on the word `catch` inside a string or
 * a regex like `/catch\s*\(/`.
 *
 * This is a deliberately small, hand-rolled lexer — we never need a
 * full parser for this guard, and pulling in a TS AST package would
 * make the scanner orders of magnitude slower and add a heavy dep.
 */
// eslint-disable-next-line max-lines-per-function
function stripStringsAndComments(src) {
    const out = new Array(src.length);
    let i = 0;
    let inLine = false;
    let inBlock = false;
    let inStr = null;       // '"' | "'" | "`"
    while (i < src.length) {
        const c = src[i];
        const n = src[i + 1];
        if (inLine) {
            if (c === "\n") { inLine = false; out[i] = c; }
            else { out[i] = " "; }
            i += 1; continue;
        }
        if (inBlock) {
            if (c === "*" && n === "/") { out[i] = " "; out[i + 1] = " "; inBlock = false; i += 2; continue; }
            out[i] = c === "\n" ? c : " "; i += 1; continue;
        }
        if (inStr !== null) {
            if (c === "\\" && i + 1 < src.length) { out[i] = " "; out[i + 1] = src[i + 1] === "\n" ? "\n" : " "; i += 2; continue; }
            if (c === inStr) { out[i] = c; inStr = null; i += 1; continue; }
            out[i] = c === "\n" ? c : " "; i += 1; continue;
        }
        if (c === "/" && n === "/") { inLine = true; out[i] = " "; out[i + 1] = " "; i += 2; continue; }
        if (c === "/" && n === "*") { inBlock = true; out[i] = " "; out[i + 1] = " "; i += 2; continue; }
        if (c === '"' || c === "'" || c === "`") { inStr = c; out[i] = c; i += 1; continue; }
        out[i] = c; i += 1;
    }
    return out.join("");
}

function lineNumberAt(src, index) {
    let line = 1;
    for (let i = 0; i < index && i < src.length; i += 1) {
        if (src.charCodeAt(i) === 10) line += 1;
    }
    return line;
}

function rawLineAt(rawSrc, lineNo) {
    const lines = rawSrc.split("\n");
    return lines[lineNo - 1] ?? "";
}

function hasWaiverForLine(rawSrc, lineNo) {
    // Waiver may appear on the same line as the catch keyword, or on
    // the immediately preceding line (so reviewers can split long
    // signatures across lines).
    if (WAIVER_RE.test(rawLineAt(rawSrc, lineNo))) return true;
    if (lineNo > 1 && WAIVER_RE.test(rawLineAt(rawSrc, lineNo - 1))) return true;
    return false;
}

/* ------------------------------------------------------------------ */
/*  Pattern matching                                                   */
/* ------------------------------------------------------------------ */

const CATCH_HEAD_RE = /\bcatch\s*(?:\([^)]*\)\s*)?\{/g;
const PROMISE_CATCH_NOOP_RE =
    /\.catch\s*\(\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*(?:\{\s*\}|null\b|undefined\b|void\s+0\b|""|''|``|0\b|false\b)\s*\)/g;
const PROMISE_CATCH_IDENT_RE = /\.catch\s*\(\s*([A-Za-z_$][\w$]*)\s*\)/g;

function findEmptyCatches(stripped) {
    const hits = [];
    let m;
    CATCH_HEAD_RE.lastIndex = 0;
    while ((m = CATCH_HEAD_RE.exec(stripped)) !== null) {
        const openBrace = m.index + m[0].length - 1;
        // Find the matching closing brace; track nested braces inside
        // (a body containing nested braces is by definition non-empty).
        let depth = 1;
        let j = openBrace + 1;
        let sawNonWhitespace = false;
        while (j < stripped.length && depth > 0) {
            const ch = stripped[j];
            if (ch === "{") { depth += 1; sawNonWhitespace = true; j += 1; continue; }
            if (ch === "}") { depth -= 1; if (depth === 0) break; j += 1; continue; }
            if (!sawNonWhitespace && ch !== " " && ch !== "\t" && ch !== "\n" && ch !== "\r") {
                sawNonWhitespace = true;
            }
            j += 1;
        }
        if (depth !== 0) continue; // unbalanced — bail rather than false-positive
        if (!sawNonWhitespace) {
            hits.push({ index: m.index, kind: "empty-catch", snippet: m[0].replace(/\s+/g, " ") });
        }
    }
    return hits;
}

function findPromiseCatchNoops(stripped) {
    const hits = [];
    let m;
    PROMISE_CATCH_NOOP_RE.lastIndex = 0;
    while ((m = PROMISE_CATCH_NOOP_RE.exec(stripped)) !== null) {
        hits.push({ index: m.index, kind: "promise-catch-noop", snippet: m[0].replace(/\s+/g, " ") });
    }
    PROMISE_CATCH_IDENT_RE.lastIndex = 0;
    while ((m = PROMISE_CATCH_IDENT_RE.exec(stripped)) !== null) {
        if (NO_OP_IDENTIFIERS.has(m[1])) {
            hits.push({ index: m.index, kind: "promise-catch-noop-ident", snippet: m[0].replace(/\s+/g, " ") });
        }
    }
    return hits;
}

/* ------------------------------------------------------------------ */
/*  File scan                                                          */
/* ------------------------------------------------------------------ */

function scanFile(absPath) {
    let raw;
    try { raw = readFileSync(absPath, "utf-8"); } catch { return []; }
    const stripped = stripStringsAndComments(raw);
    const findings = [];
    for (const hit of [...findEmptyCatches(stripped), ...findPromiseCatchNoops(stripped)]) {
        const line = lineNumberAt(stripped, hit.index);
        if (hasWaiverForLine(raw, line)) continue;
        findings.push({
            file: relative(ROOT, absPath).split(sep).join("/"),
            line,
            kind: hit.kind,
            snippet: hit.snippet.length > 120 ? `${hit.snippet.slice(0, 117)}...` : hit.snippet,
        });
    }
    return findings;
}

/* ------------------------------------------------------------------ */
/*  Baseline (allow-list) — line-agnostic so reformatting won't break  */
/*  the allow-list. Match key: file + kind + snippet.                  */
/* ------------------------------------------------------------------ */

function findingKey(f) {
    return `${f.file}|${f.kind}|${f.snippet}`;
}

function loadBaseline() {
    if (!existsSync(BASELINE_PATH)) return { entries: [] };
    try {
        const parsed = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
        const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
        return { entries };
    } catch (err) {
        console.error("");
        console.error("CODE RED: baseline file is invalid JSON");
        console.error(`  Path:    ${BASELINE_PATH}`);
        console.error(`  Missing: parseable JSON object with an "entries" array`);
        console.error(`  Reason:  ${err instanceof Error ? err.message : String(err)}`);
        console.error(`           Fix the file by hand, or regenerate it via:`);
        console.error(`             npm run check:no-swallowed-errors -- --update-baseline`);
        process.exit(1);
        return { entries: [] };
    }
}

function writeBaseline(currentFindings) {
    const payload = {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        description:
            "Allow-list of pre-existing swallowed-error sites. Each entry is matched on "
            + "file + kind + snippet (line-agnostic). NEVER use this to silence new "
            + "violations — fix the catch block, then run --update-baseline to drop the entry.",
        generatedAt: new Date().toISOString(),
        entries: currentFindings.map((f) => ({
            file: f.file,
            line: f.line,
            kind: f.kind,
            snippet: f.snippet,
            reason: "TODO: explain why this catch silently swallows, or fix it.",
        })),
    };
    writeFileSync(BASELINE_PATH, JSON.stringify(payload, null, 2) + "\n", "utf8");
    console.log(`[OK] Wrote ${currentFindings.length} entries to ${BASELINE_LABEL}`);
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

function main() {
    const files = collectFiles();
    const findings = [];
    for (const f of files) {
        for (const hit of scanFile(f)) findings.push(hit);
    }

    if (FLAG_UPDATE_BASELINE) {
        writeBaseline(findings);
        process.exit(0);
        return;
    }

    const baseline = FLAG_STRICT ? { entries: [] } : loadBaseline();
    const baselineKeys = new Set(baseline.entries.map(findingKey));
    const currentKeys = new Set(findings.map(findingKey));
    const allowed = [];
    const blocking = [];
    for (const f of findings) {
        if (baselineKeys.has(findingKey(f))) allowed.push(f);
        else blocking.push(f);
    }
    const stale = baseline.entries.filter((e) => !currentKeys.has(findingKey(e)));

    if (jsonMode) {
        process.stdout.write(JSON.stringify({
            Root: ROOT,
            ScannedFiles: files.length,
            FindingCount: findings.length,
            BlockingCount: blocking.length,
            AllowedCount: allowed.length,
            StaleBaselineCount: stale.length,
            Findings: findings,
            Blocking: blocking,
            StaleBaseline: stale,
        }, null, 2) + "\n");
        process.exit(blocking.length === 0 && stale.length === 0 ? 0 : 1);
        return;
    }

    if (blocking.length === 0 && stale.length === 0) {
        if (allowed.length > 0) {
            console.log(
                `✓ check:no-swallowed-errors — ${files.length} files scanned, `
                + `${allowed.length} pre-existing site(s) allow-listed via ${BASELINE_LABEL}.`,
            );
            console.log(`  Refactor these and shrink the baseline whenever possible.`);
        } else {
            console.log(`✓ check:no-swallowed-errors — ${files.length} files scanned, no swallowed errors found.`);
        }
        process.exit(0);
        return;
    }

    if (blocking.length > 0) {
        console.error(`✗ check:no-swallowed-errors — ${blocking.length} NEW swallowed error(s):\n`);
        for (const f of blocking) {
            console.error(`  ${f.file}:${f.line}  [${f.kind}]  ${f.snippet}`);
        }
        console.error(
            `\nEvery caught error MUST either be re-thrown, logged via Logger.error()/console.error,`
            + `\nor explicitly waived with a trailing comment:`
            + `\n    } catch (err) { // allow-swallow: <reason>`
            + `\n    .catch(() => {}) // allow-swallow: <reason>`
            + `\nSee: mem://standards/error-logging-requirements`,
        );
    }
    if (stale.length > 0) {
        console.error(`\n⚠ Baseline drift: ${stale.length} entr${stale.length === 1 ? "y is" : "ies are"} no longer present.`);
        console.error(`  Remove from ${BASELINE_LABEL} or regenerate via:`);
        console.error(`    npm run check:no-swallowed-errors -- --update-baseline`);
        for (const e of stale) console.error(`    • ${e.file}:${e.line}  [${e.kind}]  ${e.snippet}`);
    }
    process.exit(1);
}

main();

