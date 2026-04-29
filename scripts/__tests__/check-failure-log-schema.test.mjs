#!/usr/bin/env node
/**
 * CI test fixture for `scripts/check-failure-log-schema.mjs`.
 *
 * Builds isolated fixture trees under a temp directory and runs the real
 * script as a subprocess against each one with `--root=<fixture>` and
 * `--logger=<rel>`. Asserts the script:
 *
 *   1. Passes (exit 0) on a tree that satisfies the contract.
 *   2. Fails (exit 1) when `FailureReport` drops a required field.
 *   3. Fails (exit 1) when `BuildFailureReportInput.SourceFile` is
 *      marked optional or missing.
 *   4. Fails (exit 1) when a call site omits `SourceFile` / `Phase` /
 *      `Error`.
 *   5. Fails (exit 1) when production code constructs a
 *      `FailureReport` literal with `as FailureReport`.
 *   6. Allows test fixtures (`__tests__/`) and the failure-logger module
 *      itself to forward an opaque input to `buildFailureReport`.
 *
 * Without this self-test, a regression to the script (e.g. a dropped
 * field name in `REQUIRED_REPORT_FIELDS`, an off-by-one in the
 * call-site walker, or accidentally exempting all of `src/`) would
 * silently pass production CI runs because the real repo is clean.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(__dirname, "..", "check-failure-log-schema.mjs");
const LOGGER_REL = "src/recorder/failure-logger.ts";

/* ------------------------------------------------------------------ */
/*  Fixture builders                                                   */
/* ------------------------------------------------------------------ */

function makeTempRoot() {
    return mkdtempSync(join(tmpdir(), "check-failure-log-schema-"));
}

function writeFile(root, rel, content) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
}

/** A `failure-logger.ts` that satisfies the schema contract. */
const VALID_LOGGER = `
export type FailurePhase = "Record" | "Replay";
export type FailureReasonCode = "ZeroMatches" | "Unknown";

export interface SelectorAttempt {
    readonly Strategy: string;
    readonly Expression: string;
    readonly Matched: boolean;
}

export interface VariableContext {
    readonly Name: string;
    readonly Source: string;
    readonly ResolvedValue: unknown;
    readonly FailureReason: string;
}

export interface DomContext {
    readonly TagName: string;
}

export interface FailureReport {
    readonly Phase: FailurePhase;
    readonly Reason: FailureReasonCode;
    readonly ReasonDetail: string;
    readonly StackTrace: string | null;
    readonly StepId: number | null;
    readonly Index: number | null;
    readonly StepKind: string | null;
    readonly Selectors: ReadonlyArray<SelectorAttempt>;
    readonly Variables: ReadonlyArray<VariableContext>;
    readonly DomContext: DomContext | null;
    readonly ResolvedXPath: string | null;
    readonly Timestamp: string;
    readonly SourceFile: string;
    readonly Verbose: boolean;
}

export interface BuildFailureReportInput {
    readonly Phase: FailurePhase;
    readonly Error: unknown;
    readonly Selectors?: ReadonlyArray<SelectorAttempt>;
    readonly Variables?: ReadonlyArray<VariableContext>;
    readonly Verbose?: boolean;
    readonly SourceFile: string;
}

export function buildFailureReport(input: BuildFailureReportInput): FailureReport {
    return {} as FailureReport; // body irrelevant to the static check
}

export function logFailure(input: BuildFailureReportInput): FailureReport {
    return buildFailureReport(input);
}
`;

const VALID_CALLER = `
import { logFailure } from "./failure-logger";
const SOURCE_FILE = "src/recorder/replay.ts";
export function run(): void {
    try { /* ... */ }
    catch (e) {
        logFailure({
            Phase: "Replay",
            Error: e,
            SourceFile: SOURCE_FILE,
        });
    }
}
`;

function setupValidTree(root) {
    writeFile(root, LOGGER_REL, VALID_LOGGER);
    writeFile(root, "src/recorder/replay.ts", VALID_CALLER);
}

function runCheck(root) {
    return spawnSync("node", [
        SCRIPT, `--root=${root}`, `--logger=${LOGGER_REL}`,
    ], { encoding: "utf8" });
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

test("passes on a tree that satisfies the contract", () => {
    const root = makeTempRoot();
    try {
        setupValidTree(root);
        const r = runCheck(root);
        assert.equal(r.status, 0,
            `expected exit 0, got ${r.status}\nSTDOUT: ${r.stdout}\nSTDERR: ${r.stderr}`);
        assert.match(r.stdout, /\[OK\] check-failure-log-schema/);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test("fails when FailureReport drops a required field (Selectors)", () => {
    const root = makeTempRoot();
    try {
        setupValidTree(root);
        // Re-write the logger without the `Selectors` field.
        writeFile(root, LOGGER_REL,
            VALID_LOGGER.replace(
                /\s+readonly Selectors: ReadonlyArray<SelectorAttempt>;/, "",
            ),
        );
        const r = runCheck(root);
        assert.equal(r.status, 1, `expected failure; STDOUT:\n${r.stdout}\nSTDERR:\n${r.stderr}`);
        assert.match(r.stderr, /missing-report-field/);
        assert.match(r.stderr, /Selectors/);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test("fails when FailureReport drops Variables", () => {
    const root = makeTempRoot();
    try {
        setupValidTree(root);
        writeFile(root, LOGGER_REL,
            VALID_LOGGER.replace(
                /\s+readonly Variables: ReadonlyArray<VariableContext>;/, "",
            ),
        );
        const r = runCheck(root);
        assert.equal(r.status, 1);
        assert.match(r.stderr, /missing-report-field/);
        assert.match(r.stderr, /Variables/);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test("fails when BuildFailureReportInput.SourceFile is optional", () => {
    const root = makeTempRoot();
    try {
        setupValidTree(root);
        // VALID_LOGGER has TWO `readonly SourceFile: string;` lines (one per
        // interface). Replace ALL occurrences with the optional form so
        // the input-interface check fires.
        writeFile(root, LOGGER_REL,
            VALID_LOGGER.replaceAll(
                "readonly SourceFile: string;",
                "readonly SourceFile?: string;",
            ),
        );
        const r = runCheck(root);
        assert.equal(r.status, 1);
        assert.match(r.stderr, /input-field-must-be-required/);
        assert.match(r.stderr, /SourceFile/);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test("fails when a call site omits SourceFile", () => {
    const root = makeTempRoot();
    try {
        setupValidTree(root);
        writeFile(root, "src/recorder/bad-caller.ts", `
            import { logFailure } from "./failure-logger";
            export function run(e: unknown) {
                logFailure({ Phase: "Replay", Error: e });
            }
        `);
        const r = runCheck(root);
        assert.equal(r.status, 1);
        assert.match(r.stderr, /missing-source-file/);
        assert.match(r.stderr, /bad-caller\.ts/);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test("fails when a call site omits Phase", () => {
    const root = makeTempRoot();
    try {
        setupValidTree(root);
        writeFile(root, "src/recorder/bad-phase.ts", `
            import { logFailure } from "./failure-logger";
            export function run(e: unknown) {
                logFailure({ Error: e, SourceFile: "x" });
            }
        `);
        const r = runCheck(root);
        assert.equal(r.status, 1);
        assert.match(r.stderr, /missing-phase/);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test("fails on `as FailureReport` object-literal bypass in production code", () => {
    const root = makeTempRoot();
    try {
        setupValidTree(root);
        writeFile(root, "src/recorder/bypass.ts", `
            import type { FailureReport } from "./failure-logger";
            export function fake(): FailureReport {
                return {
                    Phase: "Replay",
                } as FailureReport;
            }
        `);
        const r = runCheck(root);
        assert.equal(r.status, 1);
        assert.match(r.stderr, /literal-as-failure-report/);
        assert.match(r.stderr, /bypass\.ts/);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test("allows __tests__ to construct FailureReport fixtures freely", () => {
    const root = makeTempRoot();
    try {
        setupValidTree(root);
        // The walker skips __tests__ entirely (covered by collectTsFiles).
        writeFile(root, "src/recorder/__tests__/fixture.test.ts", `
            import type { FailureReport } from "../failure-logger";
            const fixture = {} as FailureReport;
        `);
        const r = runCheck(root);
        assert.equal(r.status, 0,
            `expected exit 0; STDOUT:\n${r.stdout}\nSTDERR:\n${r.stderr}`);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test("allows the failure-logger itself to wrap buildFailureReport with a forwarded input", () => {
    const root = makeTempRoot();
    try {
        // The VALID_LOGGER fixture already contains:
        //   export function logFailure(input: …) { return buildFailureReport(input); }
        // which is a non-literal-arg call. It must NOT trip the check
        // because it's the canonical wrapper inside the logger module.
        setupValidTree(root);
        const r = runCheck(root);
        assert.equal(r.status, 0,
            `wrapper inside failure-logger.ts must be exempt; got STDOUT:\n${r.stdout}\nSTDERR:\n${r.stderr}`);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});
