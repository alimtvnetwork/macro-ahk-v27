/**
 * User Add — Step B failure marking + replay safety tests.
 *
 * Verifies the no-rollback contract for the user-add flow:
 *   1. Step A succeeds + Step B fails →
 *      Outcome = StepBFailedMemberAdded, StepASucceeded = true,
 *      WorkspaceId/UserId persisted (so re-run can skip Step A).
 *   2. A WARN log line explicitly states no rollback was performed.
 *   3. Step A failure → Outcome = StepAFailed, StepASucceeded = false,
 *      no rollback warning (nothing was added).
 */

import { describe, expect, it, vi } from "vitest";
import { runUserAddRow } from "../run-row";
import { UserAddRowOutcomeCode } from "../row-types";
import { UserAddLogPhase, UserAddLogSeverity } from "../log-sink";
import { UserAddMembershipRoleCode } from "../../migrations/membership-role-seed";
import { MembershipRoleApiCode } from "../../../../lovable-common/src/api/membership-role-api-code";
import type { UserAddLogEntry, UserAddLogSink } from "../log-sink";
import type { UserAddRowContext } from "../row-types";
import type { UserAddRowStateStore, UserAddRowStateUpdate } from "../row-state-store";
import type { UserAddCsvRow } from "../../csv/csv-types";
import * as stepAModule from "../run-step-a";
import * as stepBModule from "../run-step-b";

const collectingSink = (): { sink: UserAddLogSink; entries: UserAddLogEntry[] } => {
    const entries: UserAddLogEntry[] = [];

    return { sink: { write: (e) => entries.push(e) }, entries };
};

const collectingStore = (): { store: UserAddRowStateStore; updates: UserAddRowStateUpdate[] } => {
    const updates: UserAddRowStateUpdate[] = [];

    return { store: { update: (u) => updates.push(u) }, updates };
};

const buildRow = (roleCode: UserAddMembershipRoleCode): UserAddCsvRow => ({
    RowIndex: 1,
    WorkspaceUrl: "https://lovable.dev/projects/abc",
    MemberEmail: "[email protected]",
    RawRole: roleCode,
    RoleCode: roleCode,
    WasEditorNormalized: false,
    Notes: null,
});

const buildCtx = (roleCode: UserAddMembershipRoleCode): UserAddRowContext => ({
    Task: { TaskId: "task-1", DefaultRoleCode: UserAddMembershipRoleCode.Member },
    Row: buildRow(roleCode),
    Api: {} as UserAddRowContext["Api"],
});

describe("runUserAddRow — failure marking, no rollback", () => {
    it("Step A ok + Step B fail → StepBFailedMemberAdded + warn + persisted IDs", async () => {
        const stepASpy = vi.spyOn(stepAModule, "runStepA").mockResolvedValue({
            Outcomes: [], Error: null,
            WorkspaceId: "ws-123",
            Membership: {
                UserId: "u-456", Email: "[email protected]",
                Role: MembershipRoleApiCode.Member,
            },
        });
        const stepBSpy = vi.spyOn(stepBModule, "runStepB").mockResolvedValue({
            Outcomes: [], Membership: null, Error: "PUT 500 server error",
        });

        const { sink, entries } = collectingSink();
        const { store, updates } = collectingStore();
        const result = await runUserAddRow(buildCtx(UserAddMembershipRoleCode.Owner), sink, store);

        expect(result.Outcome).toBe(UserAddRowOutcomeCode.StepBFailedMemberAdded);
        expect(result.StepASucceeded).toBe(true);
        expect(result.WorkspaceId).toBe("ws-123");
        expect(result.UserId).toBe("u-456");
        expect(result.HasError).toBe(true);

        const warnEntry = entries.find(
            (e) => e.Phase === UserAddLogPhase.StepB && e.Severity === UserAddLogSeverity.Warn,
        );
        expect(warnEntry).toBeDefined();
        expect(warnEntry?.Message).toMatch(/No rollback performed/);
        expect(warnEntry?.Message).toMatch(/u-456/);
        expect(warnEntry?.Message).toMatch(/SKIP Step A/);

        expect(updates).toHaveLength(1);
        expect(updates[0]).toMatchObject({
            Outcome: UserAddRowOutcomeCode.StepBFailedMemberAdded,
            StepASucceeded: true, WorkspaceId: "ws-123", UserId: "u-456",
            IsDone: false, HasError: true,
        });

        stepASpy.mockRestore();
        stepBSpy.mockRestore();
    });

    it("Step A fails → StepAFailed, no warn, IDs null", async () => {
        const stepASpy = vi.spyOn(stepAModule, "runStepA").mockResolvedValue({
            Outcomes: [], Error: "POST 409 conflict", WorkspaceId: null, Membership: null,
        });

        const { sink, entries } = collectingSink();
        const { store, updates } = collectingStore();
        const result = await runUserAddRow(buildCtx(UserAddMembershipRoleCode.Member), sink, store);

        expect(result.Outcome).toBe(UserAddRowOutcomeCode.StepAFailed);
        expect(result.StepASucceeded).toBe(false);
        expect(result.WorkspaceId).toBeNull();
        expect(result.UserId).toBeNull();

        const warnEntries = entries.filter((e) => e.Severity === UserAddLogSeverity.Warn);
        expect(warnEntries).toHaveLength(0);

        expect(updates[0].StepASucceeded).toBe(false);
        expect(updates[0].UserId).toBeNull();

        stepASpy.mockRestore();
    });

    it("happy path Owner: both steps succeed → IDs persisted, no warn", async () => {
        const stepASpy = vi.spyOn(stepAModule, "runStepA").mockResolvedValue({
            Outcomes: [], Error: null,
            WorkspaceId: "ws-9",
            Membership: {
                UserId: "u-9", Email: "[email protected]",
                Role: MembershipRoleApiCode.Member,
            },
        });
        const stepBSpy = vi.spyOn(stepBModule, "runStepB").mockResolvedValue({
            Outcomes: [], Membership: null, Error: null,
        });

        const { sink } = collectingSink();
        const { store, updates } = collectingStore();
        const result = await runUserAddRow(buildCtx(UserAddMembershipRoleCode.Owner), sink, store);

        expect(result.Outcome).toBe(UserAddRowOutcomeCode.Succeeded);
        expect(result.StepASucceeded).toBe(true);
        expect(result.StepBRan).toBe(true);
        expect(updates[0].WorkspaceId).toBe("ws-9");
        expect(updates[0].UserId).toBe("u-9");
        expect(updates[0].IsDone).toBe(true);

        stepASpy.mockRestore();
        stepBSpy.mockRestore();
    });
});
