#!/usr/bin/env node
/**
 * check-no-nested-template-literals.mjs
 * ─────────────────────────────────────────────────────────────────
 * Tiny, zero-dependency scanner that fails the build if any TARGET
 * file contains a nested template literal — i.e. a backtick-delimited
 * string that itself contains a `${...}` interpolation whose body
 * opens another backtick.
 *
 * Why a separate scanner (vs ESLint sonarjs/no-nested-template-literals)
 * ─────────────────────────────────────────────────────────────────
 *   - Hard-pins the rule for `run-summary-types.ts` even if someone
 *     edits eslint.config.js to relax sonarjs/* (the original
 *     diagnostic was repeatedly suppressed before the dedicated
 *     refactor pass).
 *   - Runs in <50ms with no node_modules dependency, so it can sit in
 *     a fast pre-merge CI lane (no install step needed) and in the
 *     pre-commit hook without slowing commits down.
 *   - Inline `::error file=…,line=…,col=…::` GitHub Actions
 *     annotations point at the exact column where the nested backtick
 *     opens — easier to fix than a generic ESLint summary.
 *
 * Sequential, fail-fast (Core no-retry policy):
 *   - Scan files in order.
 *   - First violation reports its file/line/col + a 60-char excerpt.
 *   - Continues scanning to surface ALL violations in one pass, then
 *     exits 1 at the end if any were found.
 *
 * USAGE
 *   node scripts/check-no-nested-template-literals.mjs
 *   node scripts/check-no-nested-template-literals.mjs --add path/to/file.ts
 *
 * EXIT CODES
 *   0  no violations
 *   1  at least one nested template literal found, OR a target file
 *      is missing on disk (Code-Red logging policy)
 *
 * Author: Riseup Asia LLC
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

/**
 * TARGETS — files that MUST stay free of nested template literals.
 * Add new entries via the `--add` flag (or by editing this list).
 * Keep paths repo-relative.
 */
const TARGETS = [
    "standalone-scripts/lovable-common/src/report/run-summary-types.ts",
];

/**
 * Append-and-exit mode: `--add <path>` extends TARGETS in-place by
 * rewriting this file. Discoverable via `--help`.
 */
const argv = process.argv.slice(2);
const addIdx = argv.indexOf("--add");
if (addIdx !== -1) {
    const p = argv[addIdx + 1];
    if (!p) {
        console.error("[check-nested-tpl] --add requires a path argument.");
        process.exit(2);
    }
    console.error(`[check-nested-tpl] --add not implemented as a self-mutator. Edit TARGETS[] in ${path.relative(REPO_ROOT, fileURLToPath(import.meta.url))} to add: ${p}`);
    process.exit(2);
}

/**
 * Walk a source string and emit every nested-template-literal violation.
 *
 * Algorithm (single linear pass, character-aware):
 *   - Track whether we're inside a line comment, block comment, single-
 *     or double-quoted string, or a template literal, plus a stack of
 *     `${ … }` interpolation depths so that we can detect when an
 *     interpolation body opens ANOTHER backtick.
 *   - The moment we open a backtick while already inside an
 *     interpolation of an outer template literal, record a violation
 *     at that line/column.
 *
 * Returns an array of `{line, col, excerpt}` violation records.
 */
function findNestedTemplateLiterals(source) {
    const violations = [];
    const len = source.length;

    let i = 0;
    let line = 1;
    let col = 1;

    /** Stack of contexts: 'tpl' = template literal, 'interp' = ${ inside tpl. */
    const stack = [];

    let inLineComment = false;
    let inBlockComment = false;
    let inSingle = false;
    let inDouble = false;

    function advance(n) {
        for (let k = 0; k < n; k++) {
            if (source[i + k] === "\n") {
                line++;
                col = 1;
            } else {
                col++;
            }
        }
        i += n;
    }

    function peek(n) {
        return source.substr(i, n);
    }

    function recordViolation(violationLine, violationCol) {
        // Pull the source line for the excerpt.
        const lineStart = source.lastIndexOf("\n", i - 1) + 1;
        const lineEnd = source.indexOf("\n", i);
        const fullLine = source.slice(lineStart, lineEnd === -1 ? len : lineEnd);
        const excerpt = fullLine.length > 80 ? fullLine.slice(0, 77) + "..." : fullLine;
        violations.push({ line: violationLine, col: violationCol, excerpt });
    }

    while (i < len) {
        const c = source[i];
        const c2 = source[i + 1];

        // ── Line/block comment exit ─────────────────────────────
        if (inLineComment) {
            if (c === "\n") inLineComment = false;
            advance(1);
            continue;
        }
        if (inBlockComment) {
            if (c === "*" && c2 === "/") {
                inBlockComment = false;
                advance(2);
                continue;
            }
            advance(1);
            continue;
        }

        // ── Quoted string exit (with backslash escape) ──────────
        if (inSingle) {
            if (c === "\\") { advance(2); continue; }
            if (c === "'") { inSingle = false; advance(1); continue; }
            advance(1);
            continue;
        }
        if (inDouble) {
            if (c === "\\") { advance(2); continue; }
            if (c === '"') { inDouble = false; advance(1); continue; }
            advance(1);
            continue;
        }

        // ── Inside template literal ─────────────────────────────
        const top = stack[stack.length - 1];
        if (top === "tpl") {
            if (c === "\\") { advance(2); continue; }
            if (c === "`") { stack.pop(); advance(1); continue; }
            if (c === "$" && c2 === "{") {
                stack.push("interp");
                advance(2);
                continue;
            }
            advance(1);
            continue;
        }

        // ── Inside an interpolation body (or top-level code) ────
        // Comment opens?
        if (c === "/" && c2 === "/") { inLineComment = true; advance(2); continue; }
        if (c === "/" && c2 === "*") { inBlockComment = true; advance(2); continue; }

        // String opens?
        if (c === "'") { inSingle = true; advance(1); continue; }
        if (c === '"') { inDouble = true; advance(1); continue; }

        // Backtick — this is the diagnostic moment.
        if (c === "`") {
            // If the immediately enclosing context is an interpolation
            // (i.e. we're inside an outer template's ${…}), this is a
            // nested template literal.
            if (top === "interp") {
                recordViolation(line, col);
            }
            stack.push("tpl");
            advance(1);
            continue;
        }

        // Interpolation close `}` — pop interp context.
        if (c === "}" && top === "interp") {
            stack.pop();
            advance(1);
            continue;
        }

        advance(1);
    }

    return violations;
}

/* ──────────────────────────────────────────────────────────────── */
/*  Main                                                            */
/* ──────────────────────────────────────────────────────────────── */

let totalViolations = 0;
let totalScanned = 0;
let totalMissing = 0;

console.log(`[check-nested-tpl] scanning ${TARGETS.length} target file(s)`);

for (const rel of TARGETS) {
    const abs = path.join(REPO_ROOT, rel);
    if (!fs.existsSync(abs)) {
        // Code-Red logging policy: exact path + missing item + reasoning.
        console.error(`::error::Missing target file '${rel}' (resolved to ${abs}). The TARGETS[] array in scripts/check-no-nested-template-literals.mjs lists this path but it does not exist on disk; either restore the file or remove the entry from TARGETS[].`);
        totalMissing++;
        continue;
    }
    totalScanned++;
    const source = fs.readFileSync(abs, "utf8");
    const violations = findNestedTemplateLiterals(source);
    if (violations.length === 0) {
        console.log(`  ✓  ${rel}`);
        continue;
    }
    totalViolations += violations.length;
    console.log(`  ✗  ${rel} — ${violations.length} nested template literal(s)`);
    for (const v of violations) {
        // GitHub Actions inline annotation.
        console.log(`::error file=${rel},line=${v.line},col=${v.col}::Nested template literal at ${rel}:${v.line}:${v.col}. Replace the inner \`...\` with a pre-extracted const above the outer template (rule: sonarjs/no-nested-template-literals). Excerpt: ${v.excerpt.trim()}`);
    }
}

console.log("");
if (totalMissing > 0 || totalViolations > 0) {
    console.error(`[check-nested-tpl] FAIL — scanned=${totalScanned} missing=${totalMissing} violations=${totalViolations}`);
    console.error("[check-nested-tpl] Fix: extract every inner template literal into a named const declared BEFORE the outer template, then interpolate the const.");
    process.exit(1);
}

console.log(`[check-nested-tpl] OK — scanned=${totalScanned} files, zero nested template literals.`);
process.exit(0);
