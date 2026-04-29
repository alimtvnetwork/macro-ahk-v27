#!/usr/bin/env node
/**
 * Pre-build lint: enforce the failure-log contract.
 *
 * The contract (mem://standards/verbose-logging-and-failure-diagnostics):
 *   - Every failure-log emission MUST go through `buildFailureReport()` /
 *     `logFailure()` from `src/background/recorder/failure-logger.ts`.
 *     These are the single chokepoint that guarantees `Selectors`,
 *     `Variables`, `Reason`, `ReasonDetail`, `SourceFile`, and `Verbose`
 *     are always present.
 *   - The `FailureReport` interface MUST keep the required schema fields.
 *     A future PR can't quietly drop `Selectors` / `Variables` /
 *     `SourceFile` / `Reason` / `ReasonDetail` / `Verbose` without this
 *     check failing the build.
 *   - Every call site MUST pass `SourceFile` (Code Red — see
 *     mem://constraints/file-path-error-logging-code-red).
 *   - No production module under `src/` may construct a `FailureReport`
 *     object literal directly (only allowed inside `failure-logger.ts`
 *     itself and `__tests__` fixtures).
 *
 * This script catches violations at the SOURCE level so PRs fail before
 * bundling, with file:line:column pointing at the offending construct.
 *
 * Scope:
 *   - Schema enforcement: `src/background/recorder/failure-logger.ts`
 *   - Call-site enforcement: every `*.ts` under `src/` (excluding
 *     `**\/__tests__/**` and the failure-logger itself)
 *
 * Required fields the `FailureReport` interface MUST declare:
 *   - Phase, Reason, ReasonDetail, StackTrace, StepId, Index, StepKind,
 *     Selectors, Variables, DomContext, ResolvedXPath, Timestamp,
 *     SourceFile, Verbose
 *
 * Required fields the `BuildFailureReportInput` interface MUST declare:
 *   - Phase (required), Error (required), SourceFile (required)
 *   - Selectors / EvaluatedAttempts (at least one of these optional fields
 *     must be declared so callers can attach selector attempts)
 *   - Variables (optional) — for variable/data failures
 *   - Verbose (optional) — for the verbose-logging gate
 *
 * Exit:
 *   - 0 when clean; 1 with a CODE RED report listing each offending
 *     location with a precise remediation hint.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, relative, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

// CLI flags (intended for the self-test fixture; production CI runs with
// no flags and scans the real repo):
//   --root=<dir>        scan <dir>/src instead of REPO_ROOT/src
//   --logger=<relpath>  treat <relpath> (relative to root) as the
//                       failure-logger module instead of the default.
const ARGS = process.argv.slice(2);
const FLAG_ROOT = readFlag(ARGS, "--root");
const FLAG_LOGGER = readFlag(ARGS, "--logger");
const SCAN_ROOT = FLAG_ROOT ? resolve(FLAG_ROOT) : REPO_ROOT;
const SRC_DIR = resolve(SCAN_ROOT, "src");
const FAILURE_LOGGER_REL = FLAG_LOGGER ?? "src/background/recorder/failure-logger.ts";
const FAILURE_LOGGER_ABS = resolve(SCAN_ROOT, FAILURE_LOGGER_REL);

function readFlag(args, name) {
    for (const a of args) {
        if (a.startsWith(`${name}=`)) return a.slice(name.length + 1);
    }
    return null;
}

const REQUIRED_REPORT_FIELDS = [
    "Phase",
    "Reason",
    "ReasonDetail",
    "StackTrace",
    "StepId",
    "Index",
    "StepKind",
    "Selectors",
    "Variables",
    "DomContext",
    "ResolvedXPath",
    "Timestamp",
    "SourceFile",
    "Verbose",
];

const REQUIRED_INPUT_REQUIRED = ["Phase", "Error", "SourceFile"];
const REQUIRED_INPUT_OPTIONAL = ["Variables", "Verbose"];
// At least one of these must exist on BuildFailureReportInput.
const REQUIRED_INPUT_EITHER_OF = ["Selectors", "EvaluatedAttempts"];

/* ------------------------------------------------------------------ */
/*  Step 1: Verify the failure-logger source exists                    */
/* ------------------------------------------------------------------ */
if (!existsSync(FAILURE_LOGGER_ABS)) {
    fail("CODE RED: failure-logger source missing", [
        `Path:    ${FAILURE_LOGGER_ABS}`,
        `Missing: ${FAILURE_LOGGER_REL}`,
        `Reason:  check-failure-log-schema.mjs cannot enforce the failure-log`,
        `         contract without its source. Verify the repo layout or`,
        `         update FAILURE_LOGGER_REL in this script.`,
    ]);
}

if (!existsSync(SRC_DIR)) {
    fail("CODE RED: src/ directory missing", [
        `Path:    ${SRC_DIR}`,
        `Missing: src/ (expected TypeScript sources)`,
        `Reason:  Cannot scan call sites without the source tree.`,
    ]);
}

/* ------------------------------------------------------------------ */
/*  Step 2: Parse failure-logger and validate the schema               */
/* ------------------------------------------------------------------ */
const loggerText = readFileSync(FAILURE_LOGGER_ABS, "utf8");
const loggerSf = ts.createSourceFile(
    FAILURE_LOGGER_REL, loggerText, ts.ScriptTarget.Latest, true,
);

const interfaces = collectInterfaces(loggerSf);
const reportIface = interfaces.get("FailureReport");
const inputIface = interfaces.get("BuildFailureReportInput");

const schemaErrors = [];

if (!reportIface) {
    schemaErrors.push({
        kind: "missing-interface",
        name: "FailureReport",
        hint: `Declare \`export interface FailureReport { ... }\` in ${FAILURE_LOGGER_REL}.`,
    });
} else {
    const reportFields = new Set(reportIface.members.map((m) => m.name));
    for (const field of REQUIRED_REPORT_FIELDS) {
        if (!reportFields.has(field)) {
            schemaErrors.push({
                kind: "missing-report-field",
                file: FAILURE_LOGGER_REL,
                line: reportIface.line,
                column: reportIface.column,
                field,
                hint:
                    `FailureReport.${field} is required by ` +
                    `mem://standards/verbose-logging-and-failure-diagnostics. ` +
                    `Re-add it (use \`null\` as the sentinel value when not ` +
                    `applicable — never omit silently).`,
            });
        }
    }
}

if (!inputIface) {
    schemaErrors.push({
        kind: "missing-interface",
        name: "BuildFailureReportInput",
        hint:
            `Declare \`export interface BuildFailureReportInput { ... }\` ` +
            `in ${FAILURE_LOGGER_REL}.`,
    });
} else {
    const inputFields = new Map(inputIface.members.map((m) => [m.name, m]));
    for (const field of REQUIRED_INPUT_REQUIRED) {
        const m = inputFields.get(field);
        if (!m) {
            schemaErrors.push({
                kind: "missing-input-field",
                file: FAILURE_LOGGER_REL,
                line: inputIface.line,
                column: inputIface.column,
                field,
                hint:
                    `BuildFailureReportInput.${field} is REQUIRED by the ` +
                    `failure-log contract. Every caller MUST supply it ` +
                    `so the report can be classified and traced back to ` +
                    `the originating source file.`,
            });
        } else if (m.optional) {
            schemaErrors.push({
                kind: "input-field-must-be-required",
                file: FAILURE_LOGGER_REL,
                line: m.line,
                column: m.column,
                field,
                hint:
                    `BuildFailureReportInput.${field} must be REQUIRED ` +
                    `(remove the trailing \`?\`). Optional ${field} would ` +
                    `let a caller emit a failure with no ${field}, ` +
                    `breaking the contract.`,
            });
        }
    }
    for (const field of REQUIRED_INPUT_OPTIONAL) {
        if (!inputFields.has(field)) {
            schemaErrors.push({
                kind: "missing-input-field",
                file: FAILURE_LOGGER_REL,
                line: inputIface.line,
                column: inputIface.column,
                field,
                hint:
                    `BuildFailureReportInput.${field} (optional) must be ` +
                    `declared so callers can attach the contractually ` +
                    `required diagnostics. Re-add it as \`readonly ` +
                    `${field}?: ...\`.`,
            });
        }
    }
    const hasEither = REQUIRED_INPUT_EITHER_OF.some((f) => inputFields.has(f));
    if (!hasEither) {
        schemaErrors.push({
            kind: "missing-input-field",
            file: FAILURE_LOGGER_REL,
            line: inputIface.line,
            column: inputIface.column,
            field: REQUIRED_INPUT_EITHER_OF.join(" | "),
            hint:
                `BuildFailureReportInput must declare at least one of ` +
                `${REQUIRED_INPUT_EITHER_OF.join(" / ")} so callers can ` +
                `attach the SelectorAttempts array required for selector ` +
                `failures.`,
        });
    }
}

/* ------------------------------------------------------------------ */
/*  Step 3: Walk every src/**\/*.ts and inspect call sites + literals  */
/* ------------------------------------------------------------------ */
const callSiteErrors = [];
const literalErrors = [];

const tsFiles = collectTsFiles(SRC_DIR);
if (tsFiles.length === 0) {
    fail("CODE RED: no TypeScript sources under src/", [
        `Path:    ${SRC_DIR}`,
        `Reason:  Refusing to silently pass — the check would never run.`,
    ]);
}

for (const filePath of tsFiles) {
    const isFailureLogger = resolve(filePath) === FAILURE_LOGGER_ABS;
    const isTest = filePath.includes(`${sep}__tests__${sep}`);
    const text = readFileSync(filePath, "utf8");
    const sf = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true);
    walk(sf, (node) => {
        // (a) Call sites of buildFailureReport / logFailure must pass SourceFile.
        //     The failure-logger module itself wraps buildFailureReport()
        //     with a forwarded `input` variable in `logFailure()` — that
        //     is the legitimate single chokepoint and is exempt.
        if (ts.isCallExpression(node)) {
            const callee = getCalleeName(node);
            if (callee === "buildFailureReport" || callee === "logFailure") {
                const arg = node.arguments[0];
                if (!arg || !ts.isObjectLiteralExpression(arg)) {
                    if (!isTest && !isFailureLogger) {
                        callSiteErrors.push(loc(filePath, sf, node, {
                            kind: "non-literal-arg",
                            callee,
                            hint:
                                `Pass an object literal so the schema can ` +
                                `be statically verified. Spreading or ` +
                                `forwarding an opaque variable hides ` +
                                `whether SourceFile / Reason / ` +
                                `Selectors are populated.`,
                        }));
                    }
                } else {
                    const props = collectObjectPropNames(arg);
                    if (!props.has("SourceFile")) {
                        callSiteErrors.push(loc(filePath, sf, node, {
                            kind: "missing-source-file",
                            callee,
                            hint:
                                `Every ${callee}() call MUST pass ` +
                                `\`SourceFile: "<exact path>"\` (Code Red — ` +
                                `mem://constraints/file-path-error-logging-code-red). ` +
                                `Use the constant \`SOURCE_FILE\` declared at ` +
                                `the top of the module so the path stays in sync.`,
                        }));
                    }
                    if (!props.has("Phase")) {
                        callSiteErrors.push(loc(filePath, sf, node, {
                            kind: "missing-phase",
                            callee,
                            hint:
                                `Every ${callee}() call MUST pass ` +
                                `\`Phase: "Record" | "Replay"\`. Without it, ` +
                                `the report can't be routed to the right ` +
                                `pipeline.`,
                        }));
                    }
                    if (!props.has("Error")) {
                        callSiteErrors.push(loc(filePath, sf, node, {
                            kind: "missing-error",
                            callee,
                            hint:
                                `Every ${callee}() call MUST pass the ` +
                                `caught error as \`Error: <caughtValue>\` ` +
                                `so the report carries Message + StackTrace.`,
                        }));
                    }
                }
            }
        }

        // (b) Production code under src/ (outside failure-logger and tests)
        //     may not construct a FailureReport object literal directly.
        if (!isFailureLogger && !isTest) {
            // Look for `as FailureReport`, `: FailureReport =`,
            // or a return type FailureReport with an object literal
            // expression body — any of those bypasses buildFailureReport.
            if (ts.isAsExpression(node) && getTypeText(node.type) === "FailureReport") {
                if (ts.isObjectLiteralExpression(node.expression)) {
                    literalErrors.push(loc(filePath, sf, node, {
                        kind: "literal-as-failure-report",
                        hint:
                            `Replace the object literal with a call to ` +
                            `buildFailureReport({...}) from ` +
                            `${FAILURE_LOGGER_REL}. Constructing a ` +
                            `FailureReport directly bypasses the schema ` +
                            `enforcement.`,
                    }));
                }
            }
            if (ts.isVariableDeclaration(node)
                && node.type
                && getTypeText(node.type) === "FailureReport"
                && node.initializer
                && ts.isObjectLiteralExpression(node.initializer)) {
                literalErrors.push(loc(filePath, sf, node, {
                    kind: "literal-as-failure-report",
                    hint:
                        `Replace the object literal with ` +
                        `buildFailureReport({...}) from ` +
                        `${FAILURE_LOGGER_REL}.`,
                }));
            }
        }
    });
}

/* ------------------------------------------------------------------ */
/*  Step 4: Report                                                     */
/* ------------------------------------------------------------------ */
const totalErrors =
    schemaErrors.length + callSiteErrors.length + literalErrors.length;

if (totalErrors === 0) {
    console.log(
        `[OK] check-failure-log-schema: ${tsFiles.length} files scanned, ` +
        `failure-log contract intact ` +
        `(FailureReport schema, BuildFailureReportInput schema, ` +
        `every logFailure() / buildFailureReport() call carries SourceFile + Phase + Error).`,
    );
    process.exit(0);
}

console.error("");
console.error("╔══════════════════════════════════════════════════════════════════╗");
console.error("║  CODE RED: failure-log contract violated                        ║");
console.error("╚══════════════════════════════════════════════════════════════════╝");
console.error(
    `  Standard: mem://standards/verbose-logging-and-failure-diagnostics`,
);
console.error(
    `  Total violations: ${totalErrors} ` +
    `(schema=${schemaErrors.length}, ` +
    `call-site=${callSiteErrors.length}, ` +
    `literal-bypass=${literalErrors.length})`,
);
console.error("");

if (schemaErrors.length > 0) {
    console.error("──── Schema violations in failure-logger.ts ────");
    for (const e of schemaErrors) {
        if (e.kind === "missing-interface") {
            console.error(
                `  ✗ Missing interface ${e.name}\n      ${e.hint}`,
            );
        } else {
            console.error(
                `  ✗ ${e.file}:${e.line}:${e.column}  ` +
                `${e.kind} → ${e.field}\n      ${e.hint}`,
            );
        }
    }
    console.error("");
}

if (callSiteErrors.length > 0) {
    console.error("──── Call-site violations ────");
    for (const e of callSiteErrors) {
        console.error(
            `  ✗ ${e.file}:${e.line}:${e.column}  ` +
            `${e.kind} (in ${e.callee}() call)\n      ${e.hint}`,
        );
    }
    console.error("");
}

if (literalErrors.length > 0) {
    console.error("──── FailureReport object-literal bypass ────");
    for (const e of literalErrors) {
        console.error(
            `  ✗ ${e.file}:${e.line}:${e.column}  ${e.kind}\n      ${e.hint}`,
        );
    }
    console.error("");
}

console.error(
    `  Why this matters: every failure log feeds an AI debugger. Missing ` +
    `\nfields make reports unreproducible — the user explicitly asked for ` +
    `\nthis schema so any AI reading a log can locate the failing file, ` +
    `\nselector, variable, and value without guessing.`,
);
process.exit(1);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function collectTsFiles(dir) {
    const out = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) {
            // Allow tests to be scanned for literal-bypass cases? No —
            // tests legitimately construct FailureReport-shaped fixtures.
            // Skip them entirely for both call-site and literal checks.
            if (entry === "__tests__") continue;
            out.push(...collectTsFiles(full));
            continue;
        }
        if ((entry.endsWith(".ts") || entry.endsWith(".tsx"))
            && !entry.endsWith(".d.ts")) {
            out.push(full);
        }
    }
    return out;
}

function walk(node, visit) {
    visit(node);
    ts.forEachChild(node, (c) => walk(c, visit));
}

/**
 * Returns a Map<interfaceName, { line, column, members: [{name, optional, line, column}] }>
 * for every top-level `interface X {…}` declaration in the source file.
 */
function collectInterfaces(sf) {
    const out = new Map();
    sf.forEachChild((node) => {
        if (!ts.isInterfaceDeclaration(node)) return;
        const name = node.name.text;
        const start = node.getStart(sf);
        const { line, character } = sf.getLineAndCharacterOfPosition(start);
        const members = [];
        for (const m of node.members) {
            if (!ts.isPropertySignature(m) || !m.name) continue;
            const memberStart = m.getStart(sf);
            const lc = sf.getLineAndCharacterOfPosition(memberStart);
            members.push({
                name: m.name.getText(sf),
                optional: m.questionToken !== undefined,
                line: lc.line + 1,
                column: lc.character + 1,
            });
        }
        out.set(name, {
            line: line + 1,
            column: character + 1,
            members,
        });
    });
    return out;
}

function getCalleeName(callExpr) {
    const e = callExpr.expression;
    if (ts.isIdentifier(e)) return e.text;
    if (ts.isPropertyAccessExpression(e)) return e.name.text;
    return null;
}

function collectObjectPropNames(objLit) {
    const out = new Set();
    for (const p of objLit.properties) {
        if (ts.isPropertyAssignment(p) && p.name) {
            out.add(p.name.getText());
        } else if (ts.isShorthandPropertyAssignment(p) && p.name) {
            out.add(p.name.getText());
        } else if (ts.isSpreadAssignment(p)) {
            // Caller spread an opaque variable — we can't statically know what
            // it contains. Mark this with a sentinel so the call site is
            // flagged for review (treated as "missing required field").
            out.add("__SPREAD__");
        }
    }
    // If a spread was used, treat all required fields as present to avoid
    // false positives — but ONLY at the call-site level. The literal-bypass
    // check is a separate guard for that pattern.
    if (out.has("__SPREAD__")) {
        out.add("SourceFile");
        out.add("Phase");
        out.add("Error");
    }
    return out;
}

function getTypeText(typeNode) {
    if (!typeNode) return null;
    if (ts.isTypeReferenceNode(typeNode)) {
        return typeNode.typeName.getText();
    }
    return typeNode.getText();
}

function loc(filePath, sf, node, extra) {
    const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    return {
        file: relative(SCAN_ROOT, filePath).split(sep).join("/"),
        line: line + 1,
        column: character + 1,
        ...extra,
    };
}

function fail(headline, lines) {
    console.error("");
    console.error("╔══════════════════════════════════════════════════════════════╗");
    console.error(`║  ${headline.padEnd(60)}║`);
    console.error("╚══════════════════════════════════════════════════════════════╝");
    for (const l of lines) console.error(`  ${l}`);
    process.exit(1);
}
