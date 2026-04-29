#!/usr/bin/env node
/**
 * Pre-build lint: forbid dynamic `import()` calls in background entrypoints.
 *
 * Why:
 *   Chrome MV3 service workers cannot evaluate dynamic `import()` reliably —
 *   any await import() in the background bundle crashes the SW on cold start
 *   and trips the existing Vite `validate-no-bg-dynamic-import` plugin.
 *   This script catches violations at the SOURCE level so PRs fail before
 *   bundling, with file:line:column pointing at the offending call.
 *
 * Scope:
 *   - src/background/**\/*.ts  (excluding **\/__tests__/**)
 *
 * Allowed:
 *   - Static `import x from "y"` declarations
 *   - Type-only `import type` (parsed as ImportDeclaration, not call)
 *   - String literals containing the word "import(" (not parsed as calls)
 *
 * Forbidden:
 *   - Any CallExpression whose expression is `ImportKeyword` (i.e. `import(...)`).
 *
 * Exit:
 *   - 0 when clean; 1 with a CODE RED report listing each offending location.
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { resolve, dirname, relative, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const TARGET_DIR = resolve(REPO_ROOT, "src/background");
const TARGET_LABEL = "src/background";
const BASELINE_PATH = resolve(REPO_ROOT, "scripts/check-no-bg-dynamic-import.baseline.json");
const BASELINE_LABEL = "scripts/check-no-bg-dynamic-import.baseline.json";

/* ------------------------------------------------------------------ */
/*  CLI flags                                                          */
/*    --update-baseline   write the current findings to the baseline   */
/*                        file and exit 0                              */
/*    --strict            ignore the baseline (fail on any finding)    */
/* ------------------------------------------------------------------ */
const ARGS = new Set(process.argv.slice(2));
const FLAG_UPDATE_BASELINE = ARGS.has("--update-baseline");
const FLAG_STRICT = ARGS.has("--strict");

/* ------------------------------------------------------------------ */
/*  Step 1: Verify target directory exists (CODE RED on miss)         */
/* ------------------------------------------------------------------ */
if (!existsSync(TARGET_DIR)) {
  console.error("");
  console.error("╔══════════════════════════════════════════════════════════════╗");
  console.error("║  CODE RED: background source directory missing              ║");
  console.error("╚══════════════════════════════════════════════════════════════╝");
  console.error(`  Path:    ${TARGET_DIR}`);
  console.error(`  Missing: ${TARGET_LABEL}/ (expected TypeScript sources)`);
  console.error(`  Reason:  check-no-bg-dynamic-import.mjs cannot scan a`);
  console.error(`           non-existent directory. Verify the repo layout`);
  console.error(`           or update TARGET_DIR in this script.`);
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/*  Step 2: Collect *.ts files (skip __tests__)                        */
/* ------------------------------------------------------------------ */
function collectTsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "__tests__") continue;
      out.push(...collectTsFiles(full));
      continue;
    }
    if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

const files = collectTsFiles(TARGET_DIR);

if (files.length === 0) {
  console.error(`[FAIL] No *.ts files found under ${TARGET_LABEL}/ — refusing to silently pass.`);
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/*  Step 3: Walk each AST and record dynamic import() call sites       */
/*                                                                     */
/*  For every offending `import("…")` we capture:                       */
/*    • file / line / column                                            */
/*    • enclosing function name (or "<module scope>")                   */
/*    • specifier (the string literal arg, when statically resolvable)  */
/*    • bindings imported from it (destructure / default / namespace)   */
/*  …so the report can suggest the EXACT refactor.                      */
/* ------------------------------------------------------------------ */
const findings = [];

/** Returns a human-readable name for the nearest enclosing function-like scope. */
function getEnclosingFunctionName(node) {
    let current = node.parent;
    while (current) {
        if (ts.isFunctionDeclaration(current) || ts.isMethodDeclaration(current)) {
            return current.name ? current.name.getText() : "<anonymous function>";
        }
        if (ts.isFunctionExpression(current) || ts.isArrowFunction(current)) {
            // Try to recover a name from `const foo = () => …` / property assignments.
            const parent = current.parent;
            if (parent && ts.isVariableDeclaration(parent) && parent.name) {
                return parent.name.getText();
            }
            if (parent && ts.isPropertyAssignment(parent) && parent.name) {
                return `${parent.name.getText()} (callback)`;
            }
            if (parent && ts.isPropertyDeclaration(parent) && parent.name) {
                return parent.name.getText();
            }
            return "<inline callback>";
        }
        if (ts.isConstructorDeclaration(current)) {
            return "constructor";
        }
        if (ts.isGetAccessor(current) || ts.isSetAccessor(current)) {
            return current.name ? current.name.getText() : "<accessor>";
        }
        current = current.parent;
    }
    return "<module scope>";
}

/**
 * Inspects the parent of the `import(…)` call to learn what bindings the
 * caller actually consumes, so we can suggest the matching static import.
 *
 * Handles:
 *   const { a, b } = await import("…")    → ["a", "b"]
 *   const ns       = await import("…")    → "* as ns"
 *   const x        = (await import("…")).default  → "default as x"
 *   plain expression statement            → null (no destructure to mirror)
 */
function getImportBindings(callNode) {
    let target = callNode.parent;
    if (target && target.kind === ts.SyntaxKind.AwaitExpression) {
        target = target.parent;
    }
    // Property access: (await import("…")).default / .foo
    if (target && (ts.isPropertyAccessExpression(target) || ts.isElementAccessExpression(target))) {
        const accessor = ts.isPropertyAccessExpression(target)
            ? target.name.getText()
            : (target.argumentExpression ? target.argumentExpression.getText().replace(/['"]/g, "") : null);
        if (accessor) {
            return { kind: "named", names: [accessor] };
        }
    }
    if (target && ts.isVariableDeclaration(target) && target.name) {
        if (ts.isObjectBindingPattern(target.name)) {
            const names = target.name.elements.map((el) => {
                const propertyName = el.propertyName ? el.propertyName.getText() : null;
                const localName = el.name.getText();
                return propertyName && propertyName !== localName
                    ? `${propertyName} as ${localName}`
                    : localName;
            });
            return { kind: "named", names };
        }
        if (ts.isIdentifier(target.name)) {
            return { kind: "namespace", localName: target.name.getText() };
        }
    }
    return { kind: "unknown" };
}

function walk(node, sourceFile, filePath) {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        const arg = node.arguments[0];
        const isStringLiteral = arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg));
        const specifier = isStringLiteral ? arg.text : null;
        const argText = arg ? arg.getText(sourceFile).slice(0, 80) : "<no arg>";

        findings.push({
            file: relative(REPO_ROOT, filePath).split(sep).join("/"),
            line: line + 1,
            column: character + 1,
            snippet: `import(${argText})`,
            functionName: getEnclosingFunctionName(node),
            specifier,
            bindings: getImportBindings(node),
        });
    }
    ts.forEachChild(node, (child) => walk(child, sourceFile, filePath));
}

for (const filePath of files) {
    const text = readFileSync(filePath, "utf8");
    const sourceFile = ts.createSourceFile(filePath, text, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
    walk(sourceFile, sourceFile, filePath);
}

/* ------------------------------------------------------------------ */
/*  Step 4: Build a concrete refactor suggestion per finding           */
/* ------------------------------------------------------------------ */
function suggestionFor(finding) {
    const { specifier, bindings, functionName, file } = finding;
    const where = `in \`${file}\` (function: ${functionName})`;

    if (!specifier) {
        return [
            `Resolve the import specifier to a string literal, then hoist it to a static import ${where}.`,
            `Dynamic specifiers cannot be statically bundled and must be eliminated.`,
        ];
    }

    if (bindings.kind === "named" && bindings.names.length > 0) {
        const list = bindings.names.join(", ");
        return [
            `Add at the top of \`${file}\`:`,
            `    import { ${list} } from "${specifier}";`,
            `Then delete the \`await import("${specifier}")\` call inside \`${functionName}\` and use \`${bindings.names[0].split(" as ").pop()}\` directly.`,
        ];
    }

    if (bindings.kind === "namespace") {
        return [
            `Add at the top of \`${file}\`:`,
            `    import * as ${bindings.localName} from "${specifier}";`,
            `Then delete the \`await import("${specifier}")\` call inside \`${functionName}\`.`,
        ];
    }

    return [
        `Add at the top of \`${file}\`:`,
        `    import "${specifier}";   // side-effect import (or pick a named binding to import)`,
        `Then delete the \`await import("${specifier}")\` call inside \`${functionName}\`.`,
        `If you only need a single export, prefer \`import { name } from "${specifier}"\` instead.`,
    ];
}

/* ------------------------------------------------------------------ */
/*  Step 5: Apply baseline (allow-list) before deciding pass/fail      */
/*                                                                     */
/*  Baseline shape (scripts/check-no-bg-dynamic-import.baseline.json): */
/*    {                                                                */
/*      "$schema": "...",                                              */
/*      "generatedAt": "ISO timestamp",                                */
/*      "entries": [                                                   */
/*        { "file": "...", "specifier": "...",                         */
/*          "functionName": "...", "reason": "..." }                   */
/*      ]                                                              */
/*    }                                                                */
/*                                                                     */
/*  Match key: file + specifier + functionName (line-agnostic so       */
/*  re-formatting won't break the allow-list). Anything in `entries`   */
/*  that doesn't match a current finding is reported as STALE so the   */
/*  baseline cannot drift silently.                                    */
/* ------------------------------------------------------------------ */
function findingKey(f) {
    return `${f.file}|${f.specifier ?? "<dynamic>"}|${f.functionName}`;
}

function loadBaseline() {
    if (!existsSync(BASELINE_PATH)) return { entries: [] };
    try {
        const parsed = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
        const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
        return { entries };
    } catch (err) {
        console.error("");
        console.error("╔══════════════════════════════════════════════════════════════╗");
        console.error("║  CODE RED: baseline file is invalid JSON                    ║");
        console.error("╚══════════════════════════════════════════════════════════════╝");
        console.error(`  Path:    ${BASELINE_PATH}`);
        console.error(`  Missing: parseable JSON object with an "entries" array`);
        console.error(`  Reason:  ${err instanceof Error ? err.message : String(err)}`);
        console.error(`           Fix the file by hand, or regenerate it via:`);
        console.error(`             pnpm run lint:no-bg-dynamic-import -- --update-baseline`);
        process.exit(1);
    }
}

function writeBaseline(currentFindings) {
    const payload = {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        description: "Allow-list of known dynamic import() call sites in src/background/. "
            + "Each entry is matched on file + specifier + functionName. "
            + "Refactor to a static import and remove the entry — never silence new violations here.",
        generatedAt: new Date().toISOString(),
        entries: currentFindings.map((f) => ({
            file: f.file,
            specifier: f.specifier,
            functionName: f.functionName,
            line: f.line,
            reason: "TODO: explain why this dynamic import cannot be hoisted yet, or schedule the refactor.",
        })),
    };
    writeFileSync(BASELINE_PATH, JSON.stringify(payload, null, 2) + "\n", "utf8");
    console.log(`[OK] Wrote ${currentFindings.length} entries to ${BASELINE_LABEL}`);
}

/* ------------------------------------------------------------------ */
/*  Step 6: Report                                                     */
/* ------------------------------------------------------------------ */
if (FLAG_UPDATE_BASELINE) {
    writeBaseline(findings);
    process.exit(0);
}

const baseline = FLAG_STRICT ? { entries: [] } : loadBaseline();
const baselineKeys = new Set(baseline.entries.map(findingKey));
const currentKeys = new Set(findings.map(findingKey));

const allowed = [];
const blocking = [];
for (const f of findings) {
    if (baselineKeys.has(findingKey(f))) {
        allowed.push(f);
    } else {
        blocking.push(f);
    }
}

const staleBaselineEntries = baseline.entries.filter((e) => !currentKeys.has(findingKey(e)));

if (blocking.length === 0 && staleBaselineEntries.length === 0) {
    if (allowed.length > 0) {
        console.log(`[OK] ${TARGET_LABEL}/: ${files.length} files scanned, `
            + `${allowed.length} dynamic import() call(s) allow-listed via ${BASELINE_LABEL}.`);
        console.log(`     Refactor these and shrink the baseline whenever possible.`);
    } else {
        console.log(`[OK] ${TARGET_LABEL}/: no dynamic import() calls (${files.length} files scanned)`);
    }
    process.exit(0);
}

console.error("");
console.error("╔══════════════════════════════════════════════════════════════╗");
console.error("║  BLOCKED: dynamic import() in background source             ║");
console.error("╚══════════════════════════════════════════════════════════════╝");

if (blocking.length > 0) {
    console.error(`  Found ${blocking.length} NEW dynamic import() call(s) under ${TARGET_LABEL}/`);
    console.error(`  not present in ${BASELINE_LABEL}.`);
    console.error(`  MV3 service workers cannot evaluate import() reliably —`);
    console.error(`  hoist each call to a static \`import\` declaration at the top of the file.`);
    if (allowed.length > 0) {
        console.error(`  (${allowed.length} other call(s) are temporarily allow-listed.)`);
    }
    console.error("");

    blocking.forEach((f, idx) => {
        console.error(`  [${idx + 1}/${blocking.length}] ✗ ${f.file}:${f.line}:${f.column}`);
        console.error(`        function: ${f.functionName}`);
        console.error(`        call:     ${f.snippet}`);
        console.error(`        suggested fix:`);
        for (const line of suggestionFor(f)) {
            console.error(`          • ${line}`);
        }
        console.error("");
    });
}

if (staleBaselineEntries.length > 0) {
    console.error(`  ⚠ Baseline drift: ${staleBaselineEntries.length} entr${staleBaselineEntries.length === 1 ? "y is" : "ies are"} `
        + `no longer present in the source.`);
    console.error(`    Remove the stale entr${staleBaselineEntries.length === 1 ? "y" : "ies"} from ${BASELINE_LABEL}, or regenerate via:`);
    console.error(`      pnpm run lint:no-bg-dynamic-import -- --update-baseline`);
    for (const e of staleBaselineEntries) {
        console.error(`      • ${e.file}  ${e.specifier ? `→ ${e.specifier}` : ""}  (function: ${e.functionName})`);
    }
    console.error("");
}

console.error(`  To intentionally allow a NEW finding (last resort), run:`);
console.error(`    pnpm run lint:no-bg-dynamic-import -- --update-baseline`);
console.error(`  …then add a "reason" to each new entry in ${BASELINE_LABEL}.`);
console.error("");
process.exit(1);
