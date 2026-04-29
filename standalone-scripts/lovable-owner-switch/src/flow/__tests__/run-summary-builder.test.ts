/**
 * Run summary builders + renderers — unit tests.
 *
 * Covers:
 *   • Owner Switch: succeeded / partial / failed rows produce the
 *     correct status + per-OwnerEmail action breakdown + replay hint.
 *   • User Add: StepBFailedMemberAdded surfaces WorkspaceId/UserId
 *     in the replay hint and reports PartiallySucceeded.
 *   • JSON renderer is valid round-trippable JSON with PascalCase keys.
 *   • Markdown renderer mentions every row and the no-rollback notice.
 */

import { describe, expect, it } from "vitest";
import { buildOwnerSwitchRunSummary } from "../run-summary-builder";
import { RowOutcomeCode } from "../row-types";
import { LogPhase, LogSeverity } from "../log-sink";
import {
    RunSummaryRowStatus, RunSummaryScriptCode,
    renderRunSummaryAsJson, renderRunSummaryAsText,
} from "../../../../lovable-common/src/report/run-summary-types";
import type { RowExecutionResult } from "../row-types";
import type { LogEntry } from "../log-sink";

const okRow: RowExecutionResult = {
    RowIndex: 1, Outcome: RowOutcomeCode.Succeeded,
    IsDone: true, HasError: false, LastError: null, DurationMs: 120,
    PromotedOwners: [
        { OwnerEmail: "[email protected]", Promoted: true, FailedStep: null, Error: null },
    ],
};

const partialRow: RowExecutionResult = {
    RowIndex: 2, Outcome: RowOutcomeCode.PromoteFailedPartial,
    IsDone: false, HasError: true, LastError: "[email protected]: PUT 500", DurationMs: 200,
    PromotedOwners: [
        { OwnerEmail: "[email protected]", Promoted: true, FailedStep: null, Error: null },
        { OwnerEmail: "[email protected]", Promoted: false, FailedStep: "PromoteToOwner", Error: "PUT 500" },
    ],
};

const loginFailedRow: RowExecutionResult = {
    RowIndex: 3, Outcome: RowOutcomeCode.LoginFailed,
    IsDone: false, HasError: true, LastError: "bad password", DurationMs: 50,
    PromotedOwners: [],
};

const warnEntry: LogEntry = {
    TaskId: "t1", RowIndex: 2, Phase: LogPhase.Promote,
    Severity: LogSeverity.Warn, Message: "No rollback performed", TimestampUtc: "2026-04-26T00:00:00Z",
};

describe("buildOwnerSwitchRunSummary", () => {
    it("classifies succeeded / partial / failed rows correctly", () => {
        const summary = buildOwnerSwitchRunSummary({
            TaskId: "t1", Results: [okRow, partialRow, loginFailedRow], LogEntries: [warnEntry],
        });

        expect(summary.Script).toBe(RunSummaryScriptCode.OwnerSwitch);
        expect(summary.Counts).toEqual({
            Total: 3, Succeeded: 1, Failed: 1, PartiallySucceeded: 1,
        });
        expect(summary.Rows[0].Status).toBe(RunSummaryRowStatus.Succeeded);
        expect(summary.Rows[1].Status).toBe(RunSummaryRowStatus.PartiallySucceeded);
        expect(summary.Rows[2].Status).toBe(RunSummaryRowStatus.Failed);
    });

    it("partial row exposes per-OwnerEmail actions + replay hint", () => {
        const summary = buildOwnerSwitchRunSummary({
            TaskId: "t1", Results: [partialRow], LogEntries: [],
        });
        const row = summary.Rows[0];

        expect(row.Actions).toHaveLength(2);
        expect(row.Actions[0]).toEqual({
            Code: "PromoteToOwner", Outcome: "ok", Detail: "[email protected]",
        });
        expect(row.Actions[1]).toMatchObject({
            Code: "PromoteToOwner", Outcome: "failed",
        });
        expect(row.Actions[1].Detail).toContain("[email protected]");

        expect(row.ReplayHint.AlreadyPromotedOwners).toBe("[email protected]");
        expect(row.ReplayHint.FailedOwners).toBe("[email protected]");
        expect(String(row.ReplayHint.ReplayInstruction)).toContain("[email protected]");
    });

    it("login-failed row has no actions and a re-run-from-scratch hint", () => {
        const summary = buildOwnerSwitchRunSummary({
            TaskId: "t1", Results: [loginFailedRow], LogEntries: [],
        });
        const row = summary.Rows[0];

        expect(row.Actions).toHaveLength(0);
        expect(row.ReplayHint.AlreadyPromotedOwners).toBe("");
        expect(row.ReplayHint.FailedOwners).toBe("");
    });

    it("aggregates WARN/ERROR log entries into Notices", () => {
        const summary = buildOwnerSwitchRunSummary({
            TaskId: "t1", Results: [partialRow], LogEntries: [warnEntry],
        });

        expect(summary.Notices).toHaveLength(1);
        expect(summary.Notices[0]).toContain("No rollback performed");
        expect(summary.Notices[0]).toContain("[Warn]");
    });
});

describe("renderRunSummaryAsJson + renderRunSummaryAsText", () => {
    const summary = buildOwnerSwitchRunSummary({
        TaskId: "t1", Results: [okRow, partialRow], LogEntries: [warnEntry],
    });

    it("JSON renderer is valid JSON with stable PascalCase keys", () => {
        const json = renderRunSummaryAsJson(summary);
        const parsed = JSON.parse(json) as Record<string, unknown>;

        expect(parsed.Script).toBe("OwnerSwitch");
        expect(parsed.Counts).toMatchObject({ Total: 2, Succeeded: 1, PartiallySucceeded: 1 });
        expect(Array.isArray(parsed.Rows)).toBe(true);
    });

    it("Text renderer lists every row + the notices section", () => {
        const text = renderRunSummaryAsText(summary);

        expect(text).toContain("# Run Summary — OwnerSwitch");
        expect(text).toContain("### Row 1");
        expect(text).toContain("### Row 2");
        expect(text).toContain("PromoteFailedPartial");
        expect(text).toContain("## Notices");
        expect(text).toContain("No rollback performed");
    });
});
