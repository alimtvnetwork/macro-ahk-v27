/**
 * User Add — run summary builder unit tests.
 *
 * Covers:
 *   • Succeeded Owner row → 2 actions (AddMembership ok, PromoteToOwner ok).
 *   • Member row (no Step B) → AddMembership ok + PromoteToOwner skipped.
 *   • StepBFailedMemberAdded → PartiallySucceeded + replay hint exposes
 *     WorkspaceId/UserId so re-run can SKIP Step A.
 *   • StepAFailed → Failed + replay hint says "re-run entire row".
 */

import { describe, expect, it } from "vitest";
import { buildUserAddRunSummary } from "../run-summary-builder";
import { UserAddRowOutcomeCode } from "../row-types";
import { UserAddLogPhase, UserAddLogSeverity } from "../log-sink";
import { RunSummaryRowStatus, RunSummaryScriptCode } from "../../../../lovable-common/src/report/run-summary-types";
import type { UserAddRowResult } from "../row-types";
import type { UserAddLogEntry } from "../log-sink";

const ownerOk: UserAddRowResult = {
    RowIndex: 1, Outcome: UserAddRowOutcomeCode.Succeeded,
    IsDone: true, HasError: false, LastError: null, DurationMs: 90,
    StepBRan: true, StepASucceeded: true, WorkspaceId: "ws-9", UserId: "u-9",
};

const memberOk: UserAddRowResult = {
    RowIndex: 2, Outcome: UserAddRowOutcomeCode.Succeeded,
    IsDone: true, HasError: false, LastError: null, DurationMs: 60,
    StepBRan: false, StepASucceeded: true, WorkspaceId: "ws-9", UserId: "u-10",
};

const stepBFailed: UserAddRowResult = {
    RowIndex: 3, Outcome: UserAddRowOutcomeCode.StepBFailedMemberAdded,
    IsDone: false, HasError: true, LastError: "PUT 500 server error", DurationMs: 110,
    StepBRan: true, StepASucceeded: true, WorkspaceId: "ws-123", UserId: "u-456",
};

const stepAFailed: UserAddRowResult = {
    RowIndex: 4, Outcome: UserAddRowOutcomeCode.StepAFailed,
    IsDone: false, HasError: true, LastError: "POST 409 conflict", DurationMs: 40,
    StepBRan: false, StepASucceeded: false, WorkspaceId: null, UserId: null,
};

const warn: UserAddLogEntry = {
    TaskId: "t1", RowIndex: 3, Phase: UserAddLogPhase.StepB,
    Severity: UserAddLogSeverity.Warn,
    Message: "No rollback performed", TimestampUtc: "2026-04-26T00:00:00Z",
};

describe("buildUserAddRunSummary", () => {
    it("counts Succeeded / Failed / PartiallySucceeded correctly", () => {
        const summary = buildUserAddRunSummary({
            TaskId: "t1", Results: [ownerOk, memberOk, stepBFailed, stepAFailed], LogEntries: [warn],
        });

        expect(summary.Script).toBe(RunSummaryScriptCode.UserAdd);
        expect(summary.Counts).toEqual({
            Total: 4, Succeeded: 2, Failed: 1, PartiallySucceeded: 1,
        });
    });

    it("Owner happy path produces AddMembership + PromoteToOwner ok actions", () => {
        const summary = buildUserAddRunSummary({
            TaskId: "t1", Results: [ownerOk], LogEntries: [],
        });
        const row = summary.Rows[0];

        expect(row.Status).toBe(RunSummaryRowStatus.Succeeded);
        expect(row.Actions).toHaveLength(2);
        expect(row.Actions[0]).toMatchObject({ Code: "AddMembership", Outcome: "ok" });
        expect(row.Actions[1]).toMatchObject({ Code: "PromoteToOwner", Outcome: "ok" });
    });

    it("Member row reports PromoteToOwner as skipped", () => {
        const summary = buildUserAddRunSummary({
            TaskId: "t1", Results: [memberOk], LogEntries: [],
        });
        const row = summary.Rows[0];

        expect(row.Actions[1]).toMatchObject({ Code: "PromoteToOwner", Outcome: "skipped" });
    });

    it("StepBFailedMemberAdded → PartiallySucceeded + replay hint with IDs", () => {
        const summary = buildUserAddRunSummary({
            TaskId: "t1", Results: [stepBFailed], LogEntries: [warn],
        });
        const row = summary.Rows[0];

        expect(row.Status).toBe(RunSummaryRowStatus.PartiallySucceeded);
        expect(row.Actions[0]).toMatchObject({ Code: "AddMembership", Outcome: "ok" });
        expect(row.Actions[1]).toMatchObject({ Code: "PromoteToOwner", Outcome: "failed" });
        expect(row.ReplayHint.StepASucceeded).toBe(true);
        expect(row.ReplayHint.WorkspaceId).toBe("ws-123");
        expect(row.ReplayHint.UserId).toBe("u-456");
        expect(String(row.ReplayHint.ReplayInstruction)).toContain("SKIP Step A");
    });

    it("StepAFailed → Failed status + only AddMembership action (failed)", () => {
        const summary = buildUserAddRunSummary({
            TaskId: "t1", Results: [stepAFailed], LogEntries: [],
        });
        const row = summary.Rows[0];

        expect(row.Status).toBe(RunSummaryRowStatus.Failed);
        expect(row.Actions).toHaveLength(1);
        expect(row.Actions[0]).toMatchObject({ Code: "AddMembership", Outcome: "failed" });
        expect(row.ReplayHint.StepASucceeded).toBe(false);
        expect(String(row.ReplayHint.ReplayInstruction)).toContain("entire row");
    });
});
