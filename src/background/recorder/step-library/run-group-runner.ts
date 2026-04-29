/**
 * Marco Extension — Run Group Runner
 *
 * Pure orchestration layer that walks a `StepGroup` tree and executes
 * each `Step` in `OrderIndex` order. When it encounters a `RunGroup`
 * step (`StepKindId.RunGroup`), it recursively descends into the
 * referenced child group with the same execution context — so step
 * groups can compose / depend on previously-recorded groups.
 *
 * Why this lives in the step-library layer:
 *   - It only depends on `StepLibraryDb` (sql.js), the canonical
 *     `StepKindId` enum, and an injected leaf-step executor. No DOM,
 *     no chrome.* APIs, no async I/O of its own.
 *   - That makes it directly unit-testable against an in-memory DB
 *     (see `__tests__/run-group-runner.test.ts`), and reusable from
 *     both the background service worker and the Options page preview.
 *
 * Safety invariants enforced here (the DB layer enforces structural
 * ones; this layer enforces RUNTIME ones):
 *   1. `MAX_RUN_GROUP_CALL_DEPTH` (16) — recursive RunGroup chains are
 *      capped to mirror `spec/31-macro-recorder/16-step-group-library.md` §3.1.
 *   2. Cycle detection — a group cannot appear twice in the active
 *      call stack. (Two sibling RunGroup steps invoking the same
 *      group sequentially is fine; only re-entering an *active* frame
 *      is forbidden.)
 *   3. Missing/dangling target — `Step.TargetStepGroupId` may be NULL
 *      (e.g. after the target group was deleted and the FK fired
 *      `ON DELETE SET NULL`). The runner aborts with a structured
 *      failure that points at the offending step.
 *   4. Disabled steps (`IsDisabled = 1`) are skipped silently, BUT
 *      they still appear in the trace as `"Skipped"` so debuggers can
 *      see the recorder's intent.
 *
 * Failure surfacing:
 *   Leaf-step failures bubble up with a `FailureReport` produced by
 *   the injected `executeLeafStep` callback (recorder/replay code is
 *   the canonical source of those reports — see
 *   `mem://standards/verbose-logging-and-failure-diagnostics`). The
 *   runner attaches the call-stack of group names, so the UI can show
 *   "FailedGroup: Login → Submit Order → Confirm".
 *
 * @see ./schema.ts        — StepKindId, MAX_RUN_GROUP_CALL_DEPTH
 * @see ./db.ts            — StepLibraryDb, StepRow, StepGroupRow
 * @see ../failure-logger.ts — FailureReport contract
 * @see spec/31-macro-recorder/16-step-group-library.md §3.1, §5.3
 */

import type { FailureReport } from "../failure-logger";
import type { StepLibraryDb, StepGroupRow, StepRow } from "./db";
import { StepKindId, MAX_RUN_GROUP_CALL_DEPTH } from "./schema";

/* ------------------------------------------------------------------ */
/*  Public types                                                       */
/* ------------------------------------------------------------------ */

/** A single step's fate within a run. Mirrors the RunStepLog row in the spec. */
export interface RunStepTraceEntry {
    readonly StepId: number;
    readonly StepGroupId: number;
    readonly StepKindId: StepKindId;
    readonly Label: string | null;
    readonly OrderIndex: number;
    /** Names of every group from the root down to this step's group. */
    readonly GroupPath: ReadonlyArray<string>;
    readonly Outcome: "Executed" | "Skipped" | "EnteredGroup" | "ExitedGroup" | "Failed";
    /** ISO-8601 timestamp captured at entry (UTC). */
    readonly StartedAt: string;
    readonly DurationMs: number;
}

/**
 * Top-level discriminator for runner-level failures. Leaf-step
 * failures arrive as `Reason: "LeafStepFailed"` carrying the
 * `FailureReport` returned by the executor; structural failures
 * (cycle / depth / missing target) carry no `FailureReport` because
 * no live DOM evaluation occurred — the runner aborted statically.
 */
export type RunGroupFailureReason =
    | "LeafStepFailed"        // executor returned/threw a FailureReport.
    | "RunGroupCycle"         // group already on the active call stack.
    | "RunGroupDepthExceeded" // call stack exceeded MAX_RUN_GROUP_CALL_DEPTH.
    | "MissingTargetGroup"    // RunGroup step has no resolvable target.
    | "MissingRootGroup"      // caller passed a rootGroupId that does not exist.
    | "TargetNotInProject";   // target group lives in a different ProjectId.

export interface RunGroupFailure {
    readonly Ok: false;
    readonly Reason: RunGroupFailureReason;
    readonly ReasonDetail: string;
    readonly FailedStepId: number | null;
    readonly FailedGroupId: number | null;
    readonly CallStack: ReadonlyArray<string>;
    /**
     * Present iff `Reason === "LeafStepFailed"`. The report is the
     * untouched value the executor surfaced — the runner never
     * re-classifies leaf failures.
     */
    readonly FailureReport: FailureReport | null;
    readonly Trace: ReadonlyArray<RunStepTraceEntry>;
}

export interface RunGroupSuccess {
    readonly Ok: true;
    readonly StepsExecuted: number;
    readonly StepsSkipped: number;
    readonly GroupsEntered: number;
    readonly Trace: ReadonlyArray<RunStepTraceEntry>;
}

export type RunGroupResult = RunGroupSuccess | RunGroupFailure;

/**
 * The injected executor for a single leaf step (anything that is NOT
 * `StepKindId.RunGroup`). Returns `null` on success, or a
 * `FailureReport` on failure. Throwing is also accepted — the runner
 * will wrap a plain `Error` into a synthetic FailureReport with
 * `Reason: "Unknown"`.
 */
export type LeafStepExecutor = (
    step: StepRow,
    ctx: LeafStepContext,
) => FailureReport | null | Promise<FailureReport | null>;

export interface LeafStepContext {
    readonly ProjectId: number;
    readonly GroupPath: ReadonlyArray<string>;
    readonly CallStackGroupIds: ReadonlyArray<number>;
}

export interface RunGroupOptions {
    readonly db: StepLibraryDb;
    readonly projectId: number;
    readonly rootGroupId: number;
    readonly executeLeafStep: LeafStepExecutor;
    /** Override for tests; defaults to `() => new Date()`. */
    readonly now?: () => Date;
}

/* ------------------------------------------------------------------ */
/*  Runner                                                             */
/* ------------------------------------------------------------------ */

export async function runGroup(opts: RunGroupOptions): Promise<RunGroupResult> {
    const now = opts.now ?? defaultNow;
    const trace: RunStepTraceEntry[] = [];

    const root = findGroup(opts.db, opts.rootGroupId);
    if (root === null) {
        return {
            Ok: false,
            Reason: "MissingRootGroup",
            ReasonDetail:
                `runGroup: rootGroupId=${opts.rootGroupId} not found in StepGroup table. ` +
                `Caller must pass an existing StepGroupId — was the group deleted between ` +
                `selection and execution?`,
            FailedStepId: null,
            FailedGroupId: opts.rootGroupId,
            CallStack: [],
            FailureReport: null,
            Trace: trace,
        };
    }
    if (root.ProjectId !== opts.projectId) {
        return {
            Ok: false,
            Reason: "TargetNotInProject",
            ReasonDetail:
                `runGroup: rootGroupId=${opts.rootGroupId} belongs to ProjectId=${root.ProjectId}, ` +
                `but caller passed ProjectId=${opts.projectId}. Refusing to cross project boundary.`,
            FailedStepId: null,
            FailedGroupId: opts.rootGroupId,
            CallStack: [],
            FailureReport: null,
            Trace: trace,
        };
    }

    let executed = 0;
    let skipped = 0;
    let entered = 0;

    const counters = {
        bumpExecuted: () => { executed++; },
        bumpSkipped:  () => { skipped++; },
        bumpEntered:  () => { entered++; },
    };

    const failure = await runOne({
        db: opts.db,
        projectId: opts.projectId,
        group: root,
        callStackIds: [],
        callStackNames: [],
        executeLeafStep: opts.executeLeafStep,
        trace,
        now,
        counters,
    });

    if (failure !== null) return failure;

    return {
        Ok: true,
        StepsExecuted: executed,
        StepsSkipped: skipped,
        GroupsEntered: entered,
        Trace: trace,
    };
}

/* ------------------------------------------------------------------ */
/*  Internal recursion                                                 */
/* ------------------------------------------------------------------ */

interface FrameContext {
    readonly db: StepLibraryDb;
    readonly projectId: number;
    readonly group: StepGroupRow;
    readonly callStackIds: ReadonlyArray<number>;
    readonly callStackNames: ReadonlyArray<string>;
    readonly executeLeafStep: LeafStepExecutor;
    readonly trace: RunStepTraceEntry[];
    readonly now: () => Date;
    readonly counters: {
        bumpExecuted: () => void;
        bumpSkipped: () => void;
        bumpEntered: () => void;
    };
}

async function runOne(frame: FrameContext): Promise<RunGroupFailure | null> {
    // Push this frame.
    const newStackIds = [...frame.callStackIds, frame.group.StepGroupId];
    const newStackNames = [...frame.callStackNames, frame.group.Name];
    frame.counters.bumpEntered();

    const enteredAt = frame.now();
    pushTrace(frame.trace, {
        StepId: -1,
        StepGroupId: frame.group.StepGroupId,
        StepKindId: StepKindId.RunGroup,
        Label: `→ enter "${frame.group.Name}"`,
        OrderIndex: -1,
        GroupPath: newStackNames,
        Outcome: "EnteredGroup",
        StartedAt: enteredAt.toISOString(),
        DurationMs: 0,
    });

    const steps = frame.db.listSteps(frame.group.StepGroupId);

    for (const step of steps) {
        if (step.IsDisabled) {
            frame.counters.bumpSkipped();
            pushTrace(frame.trace, {
                StepId: step.StepId,
                StepGroupId: step.StepGroupId,
                StepKindId: step.StepKindId,
                Label: step.Label,
                OrderIndex: step.OrderIndex,
                GroupPath: newStackNames,
                Outcome: "Skipped",
                StartedAt: frame.now().toISOString(),
                DurationMs: 0,
            });
            continue;
        }

        if (step.StepKindId === StepKindId.RunGroup) {
            const failure = await invokeRunGroupStep(step, {
                ...frame,
                callStackIds: newStackIds,
                callStackNames: newStackNames,
            });
            if (failure !== null) return failure;
            continue;
        }

        const failure = await invokeLeafStep(step, {
            ...frame,
            callStackIds: newStackIds,
            callStackNames: newStackNames,
        });
        if (failure !== null) return failure;
    }

    pushTrace(frame.trace, {
        StepId: -1,
        StepGroupId: frame.group.StepGroupId,
        StepKindId: StepKindId.RunGroup,
        Label: `← exit "${frame.group.Name}"`,
        OrderIndex: -1,
        GroupPath: newStackNames,
        Outcome: "ExitedGroup",
        StartedAt: frame.now().toISOString(),
        DurationMs: 0,
    });

    return null;
}

async function invokeRunGroupStep(
    step: StepRow,
    frame: FrameContext,
): Promise<RunGroupFailure | null> {
    if (step.TargetStepGroupId === null) {
        return failure(frame, {
            Reason: "MissingTargetGroup",
            ReasonDetail:
                `Step ${step.StepId} (kind=RunGroup) has TargetStepGroupId=NULL. ` +
                `The referenced group was likely deleted (FK ON DELETE SET NULL fired). ` +
                `Re-link this step to a valid group or remove it.`,
            failedStepId: step.StepId,
            failedGroupId: frame.group.StepGroupId,
        });
    }

    const target = findGroup(frame.db, step.TargetStepGroupId);
    if (target === null) {
        return failure(frame, {
            Reason: "MissingTargetGroup",
            ReasonDetail:
                `Step ${step.StepId} (kind=RunGroup) targets StepGroupId=${step.TargetStepGroupId} ` +
                `but no such group exists. Database is inconsistent — expected FK to have ` +
                `enforced this; check PRAGMA foreign_keys is ON.`,
            failedStepId: step.StepId,
            failedGroupId: frame.group.StepGroupId,
        });
    }
    if (target.ProjectId !== frame.projectId) {
        return failure(frame, {
            Reason: "TargetNotInProject",
            ReasonDetail:
                `Step ${step.StepId} targets group "${target.Name}" (ProjectId=${target.ProjectId}) ` +
                `but the runner is bound to ProjectId=${frame.projectId}. ` +
                `Cross-project RunGroup is forbidden — re-import the dependency into this project.`,
            failedStepId: step.StepId,
            failedGroupId: frame.group.StepGroupId,
        });
    }

    // Cycle: target already on the active stack.
    if (frame.callStackIds.includes(target.StepGroupId)) {
        const cycle = [...frame.callStackNames, target.Name].join(" → ");
        return failure(frame, {
            Reason: "RunGroupCycle",
            ReasonDetail:
                `RunGroup cycle detected: ${cycle}. Group "${target.Name}" is already ` +
                `executing higher up the call stack. Recursion is not supported — break ` +
                `the cycle by extracting the shared steps into a leaf-only group.`,
            failedStepId: step.StepId,
            failedGroupId: frame.group.StepGroupId,
        });
    }

    // Depth: pushing this frame would exceed the limit.
    if (frame.callStackIds.length + 1 > MAX_RUN_GROUP_CALL_DEPTH) {
        return failure(frame, {
            Reason: "RunGroupDepthExceeded",
            ReasonDetail:
                `RunGroup call stack would reach depth ${frame.callStackIds.length + 1}, ` +
                `exceeding MAX_RUN_GROUP_CALL_DEPTH=${MAX_RUN_GROUP_CALL_DEPTH}. ` +
                `Flatten deeply nested compositions or raise the limit in schema.ts.`,
            failedStepId: step.StepId,
            failedGroupId: frame.group.StepGroupId,
        });
    }

    return runOne({
        ...frame,
        group: target,
    });
}

async function invokeLeafStep(
    step: StepRow,
    frame: FrameContext,
): Promise<RunGroupFailure | null> {
    const startedAt = frame.now();
    const ctx: LeafStepContext = {
        ProjectId: frame.projectId,
        GroupPath: frame.callStackNames,
        CallStackGroupIds: frame.callStackIds,
    };

    let report: FailureReport | null = null;
    try {
        report = await frame.executeLeafStep(step, ctx);
    } catch (e) {
        // Executor threw raw — synthesize a minimal FailureReport so
        // the contract holds for downstream UI/logging.
        report = synthesizeFailureReport(step, e, startedAt);
    }

    const duration = frame.now().getTime() - startedAt.getTime();
    frame.counters.bumpExecuted();

    pushTrace(frame.trace, {
        StepId: step.StepId,
        StepGroupId: step.StepGroupId,
        StepKindId: step.StepKindId,
        Label: step.Label,
        OrderIndex: step.OrderIndex,
        GroupPath: frame.callStackNames,
        Outcome: report === null ? "Executed" : "Failed",
        StartedAt: startedAt.toISOString(),
        DurationMs: Math.max(0, duration),
    });

    if (report === null) return null;

    return {
        Ok: false,
        Reason: "LeafStepFailed",
        ReasonDetail:
            `Leaf step ${step.StepId} (kind=${stepKindName(step.StepKindId)}) failed at ` +
            `"${frame.callStackNames.join(" → ")}". See FailureReport for selectors / variables / DOM context.`,
        FailedStepId: step.StepId,
        FailedGroupId: frame.group.StepGroupId,
        CallStack: frame.callStackNames,
        FailureReport: report,
        Trace: frame.trace,
    };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function findGroup(db: StepLibraryDb, stepGroupId: number): StepGroupRow | null {
    const stmt = db.raw.prepare(
        `SELECT StepGroupId, ProjectId, ParentStepGroupId, Name, Description,
                OrderIndex, IsArchived, CreatedAt, UpdatedAt
         FROM StepGroup WHERE StepGroupId = ?;`,
    );
    try {
        stmt.bind([stepGroupId]);
        if (!stmt.step()) return null;
        const r = stmt.getAsObject() as unknown as StepGroupRow;
        return { ...r, IsArchived: Boolean(r.IsArchived) };
    } finally {
        stmt.free();
    }
}

function failure(
    frame: FrameContext,
    input: {
        Reason: RunGroupFailureReason;
        ReasonDetail: string;
        failedStepId: number | null;
        failedGroupId: number | null;
    },
): RunGroupFailure {
    return {
        Ok: false,
        Reason: input.Reason,
        ReasonDetail: input.ReasonDetail,
        FailedStepId: input.failedStepId,
        FailedGroupId: input.failedGroupId,
        CallStack: frame.callStackNames,
        FailureReport: null,
        Trace: frame.trace,
    };
}

function pushTrace(buf: RunStepTraceEntry[], entry: RunStepTraceEntry): void {
    buf.push(entry);
}

function defaultNow(): Date {
    return new Date();
}

function stepKindName(kind: StepKindId): string {
    switch (kind) {
        case StepKindId.Click:    return "Click";
        case StepKindId.Type:     return "Type";
        case StepKindId.Select:   return "Select";
        case StepKindId.JsInline: return "JsInline";
        case StepKindId.Wait:     return "Wait";
        case StepKindId.RunGroup: return "RunGroup";
        default:                  return `Unknown(${String(kind)})`;
    }
}

function synthesizeFailureReport(step: StepRow, error: unknown, startedAt: Date): FailureReport {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? (error.stack ?? null) : null;
    return {
        Phase: "Replay",
        Message: message,
        Reason: "Unknown",
        ReasonDetail:
            `Leaf executor threw a raw error instead of returning a FailureReport. ` +
            `The runner synthesized this report so downstream consumers receive the canonical shape.`,
        StackTrace: stack,
        StepId: step.StepId,
        Index: step.OrderIndex,
        StepKind: stepKindName(step.StepKindId),
        Selectors: [],
        Variables: [],
        DomContext: null,
        DataRow: null,
        ResolvedXPath: null,
        Timestamp: startedAt.toISOString(),
        SourceFile: "src/background/recorder/step-library/run-group-runner.ts",
        Verbose: false,
        CapturedHtml: null,
        FormSnapshot: null,
    };
}

/* ================================================================== */
/*  Static expansion (RunGroup → linear plan)                          */
/* ================================================================== */

/**
 * One leaf step in the flattened execution plan produced by
 * `expandRunGroups`. RunGroup steps NEVER appear here — they are
 * dereferenced into the steps they invoke. The `GroupPath` records
 * the call-stack of group names at expansion time so a UI can render
 * "Login → Submit Order → Type 'email'" without re-walking the tree.
 */
export interface ExpandedStep {
    readonly Step: StepRow;
    readonly GroupPath: ReadonlyArray<string>;
    readonly CallStackGroupIds: ReadonlyArray<number>;
    /** Position in the flattened plan, 0-based. */
    readonly PlanIndex: number;
}

export interface ExpansionSuccess {
    readonly Ok: true;
    readonly Steps: ReadonlyArray<ExpandedStep>;
    readonly GroupsVisited: number;
    readonly DisabledSkipped: number;
}

export interface ExpansionFailure {
    readonly Ok: false;
    readonly Reason: Exclude<RunGroupFailureReason, "LeafStepFailed">;
    readonly ReasonDetail: string;
    readonly FailedStepId: number | null;
    readonly FailedGroupId: number | null;
    readonly CallStack: ReadonlyArray<string>;
    /** Steps successfully expanded before the failure was hit. */
    readonly PartialSteps: ReadonlyArray<ExpandedStep>;
}

export type ExpansionResult = ExpansionSuccess | ExpansionFailure;

export interface ExpandOptions {
    readonly db: StepLibraryDb;
    readonly projectId: number;
    readonly rootGroupId: number;
    /**
     * When `true` (default), disabled steps are dropped from the plan.
     * When `false`, they remain in the plan with their `IsDisabled`
     * flag intact so a previewer can render them greyed-out.
     */
    readonly skipDisabled?: boolean;
}

/**
 * Pure resolver: walk a group tree, dereference every RunGroup step,
 * and return a linear plan. Shares the SAME safety guards as
 * `runGroup` (cycle, depth, missing target, cross-project) so a
 * preview cannot show a plan that the runner would refuse to execute.
 */
export function expandRunGroups(opts: ExpandOptions): ExpansionResult {
    const skipDisabled = opts.skipDisabled !== false;
    const plan: ExpandedStep[] = [];
    let groupsVisited = 0;
    let disabledSkipped = 0;

    const root = findGroup(opts.db, opts.rootGroupId);
    if (root === null) {
        return {
            Ok: false,
            Reason: "MissingRootGroup",
            ReasonDetail:
                `expandRunGroups: rootGroupId=${opts.rootGroupId} not found in StepGroup. ` +
                `Cannot build an execution plan for a group that does not exist.`,
            FailedStepId: null,
            FailedGroupId: opts.rootGroupId,
            CallStack: [],
            PartialSteps: plan,
        };
    }
    if (root.ProjectId !== opts.projectId) {
        return {
            Ok: false,
            Reason: "TargetNotInProject",
            ReasonDetail:
                `expandRunGroups: rootGroupId=${opts.rootGroupId} belongs to ProjectId=${root.ProjectId}, ` +
                `not the requested ProjectId=${opts.projectId}.`,
            FailedStepId: null,
            FailedGroupId: opts.rootGroupId,
            CallStack: [],
            PartialSteps: plan,
        };
    }

    const failure = walkForExpansion({
        db: opts.db,
        projectId: opts.projectId,
        group: root,
        callStackIds: [],
        callStackNames: [],
        plan,
        skipDisabled,
        onGroupEnter: () => { groupsVisited++; },
        onDisabledSkipped: () => { disabledSkipped++; },
    });

    if (failure !== null) return failure;

    return { Ok: true, Steps: plan, GroupsVisited: groupsVisited, DisabledSkipped: disabledSkipped };
}

interface ExpansionFrame {
    readonly db: StepLibraryDb;
    readonly projectId: number;
    readonly group: StepGroupRow;
    readonly callStackIds: ReadonlyArray<number>;
    readonly callStackNames: ReadonlyArray<string>;
    readonly plan: ExpandedStep[];
    readonly skipDisabled: boolean;
    readonly onGroupEnter: () => void;
    readonly onDisabledSkipped: () => void;
}

function walkForExpansion(frame: ExpansionFrame): ExpansionFailure | null {
    const newStackIds = [...frame.callStackIds, frame.group.StepGroupId];
    const newStackNames = [...frame.callStackNames, frame.group.Name];
    frame.onGroupEnter();

    for (const step of frame.db.listSteps(frame.group.StepGroupId)) {
        if (step.IsDisabled && frame.skipDisabled) {
            frame.onDisabledSkipped();
            continue;
        }

        if (step.StepKindId !== StepKindId.RunGroup) {
            frame.plan.push({
                Step: step,
                GroupPath: newStackNames,
                CallStackGroupIds: newStackIds,
                PlanIndex: frame.plan.length,
            });
            continue;
        }

        const guard = validateRunGroupTarget(frame, step, newStackIds, newStackNames);
        if (guard !== null) return guard;

        const target = findGroup(frame.db, step.TargetStepGroupId as number);
        if (target === null) {
            return {
                Ok: false,
                Reason: "MissingTargetGroup",
                ReasonDetail: `Internal: target vanished between validation and recursion (StepId=${step.StepId})`,
                FailedStepId: step.StepId,
                FailedGroupId: frame.group.StepGroupId,
                CallStack: newStackNames,
                PartialSteps: frame.plan,
            };
        }

        const nested = walkForExpansion({
            ...frame,
            group: target,
            callStackIds: newStackIds,
            callStackNames: newStackNames,
        });
        if (nested !== null) return nested;
    }

    return null;
}

function validateRunGroupTarget(
    frame: ExpansionFrame,
    step: StepRow,
    stackIds: ReadonlyArray<number>,
    stackNames: ReadonlyArray<string>,
): ExpansionFailure | null {
    if (step.TargetStepGroupId === null) {
        return {
            Ok: false,
            Reason: "MissingTargetGroup",
            ReasonDetail:
                `Step ${step.StepId} (kind=RunGroup) has TargetStepGroupId=NULL. Re-link or remove.`,
            FailedStepId: step.StepId,
            FailedGroupId: frame.group.StepGroupId,
            CallStack: stackNames,
            PartialSteps: frame.plan,
        };
    }
    const target = findGroup(frame.db, step.TargetStepGroupId);
    if (target === null) {
        return {
            Ok: false,
            Reason: "MissingTargetGroup",
            ReasonDetail:
                `Step ${step.StepId} targets StepGroupId=${step.TargetStepGroupId} but no such group exists.`,
            FailedStepId: step.StepId,
            FailedGroupId: frame.group.StepGroupId,
            CallStack: stackNames,
            PartialSteps: frame.plan,
        };
    }
    if (target.ProjectId !== frame.projectId) {
        return {
            Ok: false,
            Reason: "TargetNotInProject",
            ReasonDetail:
                `Step ${step.StepId} targets group "${target.Name}" in ProjectId=${target.ProjectId}; ` +
                `expansion is bound to ProjectId=${frame.projectId}.`,
            FailedStepId: step.StepId,
            FailedGroupId: frame.group.StepGroupId,
            CallStack: stackNames,
            PartialSteps: frame.plan,
        };
    }
    if (stackIds.includes(target.StepGroupId)) {
        const cycle = [...stackNames, target.Name].join(" → ");
        return {
            Ok: false,
            Reason: "RunGroupCycle",
            ReasonDetail: `RunGroup cycle detected during expansion: ${cycle}`,
            FailedStepId: step.StepId,
            FailedGroupId: frame.group.StepGroupId,
            CallStack: stackNames,
            PartialSteps: frame.plan,
        };
    }
    if (stackIds.length + 1 > MAX_RUN_GROUP_CALL_DEPTH) {
        return {
            Ok: false,
            Reason: "RunGroupDepthExceeded",
            ReasonDetail:
                `Expansion would reach depth ${stackIds.length + 1}, exceeding ` +
                `MAX_RUN_GROUP_CALL_DEPTH=${MAX_RUN_GROUP_CALL_DEPTH}.`,
            FailedStepId: step.StepId,
            FailedGroupId: frame.group.StepGroupId,
            CallStack: stackNames,
            PartialSteps: frame.plan,
        };
    }
    return null;
}

/* ================================================================== */
/*  Uniform FailureReport entrypoint                                   */
/* ================================================================== */

export interface ExecuteRunGroupSuccess {
    readonly Ok: true;
    readonly Result: RunGroupSuccess;
}

export interface ExecuteRunGroupFailure {
    readonly Ok: false;
    readonly Result: RunGroupFailure;
    /** Canonical FailureReport — synthesized for runner-level failures. */
    readonly FailureReport: FailureReport;
}

export type ExecuteRunGroupOutcome = ExecuteRunGroupSuccess | ExecuteRunGroupFailure;

/**
 * Production entrypoint. Wraps `runGroup` and guarantees that every
 * failure path produces a `FailureReport` with the canonical schema —
 * runner-level failures (cycle, depth, missing target, missing root,
 * cross-project) are mapped to synthesized reports tagged with
 * `Reason: "Unknown"` (the failure-logger enum has no dedicated codes
 * for graph-level errors) and a `ReasonDetail` that names the
 * specific runner reason for AI/log consumers.
 *
 * Use this from background callers; reach for raw `runGroup` only
 * when you need the discriminated `RunGroupFailure` for trace UIs.
 */
export async function executeRunGroup(opts: RunGroupOptions): Promise<ExecuteRunGroupOutcome> {
    const result = await runGroup(opts);
    if (result.Ok) return { Ok: true, Result: result };

    const report: FailureReport =
        result.FailureReport ?? buildRunnerLevelFailureReport(result, opts);

    return { Ok: false, Result: result, FailureReport: report };
}

function buildRunnerLevelFailureReport(
    failure: RunGroupFailure,
    opts: RunGroupOptions,
): FailureReport {
    const now = (opts.now ?? defaultNow)();
    return {
        Phase: "Replay",
        Message: `RunGroup failed: ${failure.Reason}`,
        Reason: "Unknown",
        ReasonDetail:
            `RunnerReason=${failure.Reason}. ${failure.ReasonDetail} ` +
            `CallStack=[${failure.CallStack.join(" → ")}]`,
        StackTrace: null,
        StepId: failure.FailedStepId,
        Index: null,
        StepKind: failure.FailedStepId === null ? null : "RunGroup",
        Selectors: [],
        Variables: [],
        DomContext: null,
        DataRow: null,
        ResolvedXPath: null,
        Timestamp: now.toISOString(),
        SourceFile: "src/background/recorder/step-library/run-group-runner.ts",
        Verbose: false,
        CapturedHtml: null,
        FormSnapshot: null,
    };
}
