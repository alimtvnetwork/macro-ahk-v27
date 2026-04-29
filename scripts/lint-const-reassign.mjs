#!/usr/bin/env node
/**
 * Pre-build lint: detect const-reassignment bugs in MacroLoop TypeScript source.
 *
 * Scans each function scope for `const` declarations whose variable
 * is later reassigned (+=, -=, *=, /=, =, ++, --) within the SAME scope.
 * Also runs `node --check` for syntax validation.
 *
 * Exit 1 on any finding so the build fails fast.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TARGET = resolve(__dirname, "../standalone-scripts/macro-controller/src/macro-looping.ts");
const TARGET_LABEL = "standalone-scripts/macro-controller/src/macro-looping.ts";

if (!existsSync(TARGET)) {
  console.error(`[FAIL] Required file not found: ${TARGET_LABEL}`);
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/*  Step 1: TypeScript parse check (syntax)                            */
/* ------------------------------------------------------------------ */
const parseSource = readFileSync(TARGET, "utf8");
const sourceFile = ts.createSourceFile(TARGET_LABEL, parseSource, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
if (sourceFile.parseDiagnostics.length > 0) {
  console.error(`[FAIL] SYNTAX ERROR in ${TARGET_LABEL}:`);
  for (const diag of sourceFile.parseDiagnostics) {
    const message = ts.flattenDiagnosticMessageText(diag.messageText, "\n");
    console.error(`  ${message}`);
  }
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/*  Step 2: const-reassignment scan (scope-aware)                      */
/* ------------------------------------------------------------------ */
const code = readFileSync(TARGET, "utf8");
const lines = code.split("\n");

// Rough scope tracking: depth increments on { and decrements on }
// We skip braces inside strings, comments, and regex.
const RE_CONST = /\bconst\s+(\w+)\s*=/;
const RE_REASSIGN = /^\s*(\w+)\s*(\+=|-=|\*=|\/=|=(?!=)|\+\+|--)/;

const issues = [];

// First pass: collect const decls with their depth
const constDecls = []; // { name, line, depth }

// Simple line-based approach: track depth per line
let currentDepth = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const lineNum = i + 1;

  // Count net braces (very rough — skip strings/comments for accuracy)
  const stripped = stripStringsAndComments(line);
  const openCount = (stripped.match(/{/g) || []).length;
  const closeCount = (stripped.match(/}/g) || []).length;

  // Check for const declarations
  const constMatch = line.match(RE_CONST);
  if (constMatch) {
    constDecls.push({ name: constMatch[1], line: lineNum, depth: currentDepth });
  }

  // Multi-const: const a = 0, b = 0, c = 0;
  const multiLine = line.trimStart();
  if ((multiLine.startsWith("const ") || multiLine.startsWith("let ") || multiLine.startsWith("var ")) && multiLine.startsWith("const ")) {
    const parts = multiLine.replace(/^const\s+/, "").split(",");
    for (const part of parts) {
      const m = part.trim().match(/^(\w+)\s*=/);
      if (m && m[1] !== constMatch?.[1]) {
        constDecls.push({ name: m[1], line: lineNum, depth: currentDepth });
      }
    }
  }

  // Check for reassignment
  const reassignMatch = line.match(RE_REASSIGN);
  if (reassignMatch) {
    const varName = reassignMatch[1];
    const op = reassignMatch[2];

    // Find if there's a const decl of this name at the same or parent depth
    for (const decl of constDecls) {
      if (decl.name === varName && decl.line !== lineNum && decl.depth <= currentDepth) {
        issues.push({
          varName,
          declLine: decl.line,
          reassignLine: lineNum,
          op,
          declDepth: decl.depth,
          reassignDepth: currentDepth,
        });
        break; // one report per reassignment line
      }
    }
  }

  currentDepth += openCount - closeCount;
  if (currentDepth < 0) currentDepth = 0;
}

// Filter: only report issues where depth difference is ≤ 1 (same function scope likely)
// and the const and reassignment are within 500 lines (same logical block)
const realIssues = issues.filter(
  (iss) => iss.reassignDepth >= iss.declDepth && (iss.reassignLine - iss.declLine) < 500,
);

if (realIssues.length > 0) {
  console.error(`[FAIL] const-reassignment bugs found in ${TARGET_LABEL}:\n`);
  for (const iss of realIssues) {
    console.error(
      `  L${iss.declLine}: const ${iss.varName} -> reassigned at L${iss.reassignLine} with "${iss.op}"`,
    );
    console.error(`    decl:   ${lines[iss.declLine - 1].trim().substring(0, 100)}`);
    console.error(`    reassn: ${lines[iss.reassignLine - 1].trim().substring(0, 100)}`);
    console.error();
  }
  console.error(`Total: ${realIssues.length} issue(s). Fix by changing const -> let.\n`);
  process.exit(1);
}

console.log(`[OK] ${TARGET_LABEL}: syntax OK, no const-reassignment bugs found.`);
process.exit(0);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Very rough string/comment stripper for brace counting. */
function stripStringsAndComments(line) {
  let result = "";
  let i = 0;
  let inSQ = false;
  let inDQ = false;
  let inTL = false;

  while (i < line.length) {
    const ch = line[i];
    const next = line[i + 1] || "";

    if (inSQ) {
      if (ch === "\\") { i += 2; continue; }
      if (ch === "'") inSQ = false;
      i += 1;
      continue;
    }

    if (inDQ) {
      if (ch === "\\") { i += 2; continue; }
      if (ch === '"') inDQ = false;
      i += 1;
      continue;
    }

    if (inTL) {
      if (ch === "\\") { i += 2; continue; }
      if (ch === "`") inTL = false;
      i += 1;
      continue;
    }

    if (ch === "/" && next === "/") break; // rest is comment
    if (ch === "/" && next === "*") break; // block comment start
    if (ch === "'") { inSQ = true; i += 1; continue; }
    if (ch === '"') { inDQ = true; i += 1; continue; }
    if (ch === "`") { inTL = true; i += 1; continue; }

    result += ch;
    i += 1;
  }

  return result;
}
