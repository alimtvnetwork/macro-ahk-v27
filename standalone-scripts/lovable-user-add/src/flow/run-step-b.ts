/**
 * User Add — Step B orchestrator (Owner promotion).
 *
 * Single-step chain: PUT membership role → Owner via the SHARED
 * `LovableApiClient.promoteToOwner(...)` — the SAME method Owner
 * Switch's `runPromote` uses (R12 invariant: only one PUT call site
 * across `standalone-scripts/lovable-*`).
 *
 * Inputs (`WorkspaceId`, `UserId`) flow directly from Step A's
 * returned `MembershipSummary`. No GET /memberships needed.
 *
 * Single attempt, no retry (mem://constraints/no-retry-policy).
 */

import { LovableApiClient } from "../../../lovable-common/src/api/lovable-api-client";
import { StepBStepCode } from "./step-b-types";
import type { StepBRequest, StepBResult, StepBStepOutcome } from "./step-b-types";
import type { MembershipSummary } from "../../../lovable-common/src/api/lovable-api-types";

interface MeasuredMembership {
    DurationMs: number;
    Value: MembershipSummary;
}

const measurePromote = async (
    api: LovableApiClient, request: StepBRequest,
): Promise<MeasuredMembership> => {
    const startedAt = Date.now();
    const value = await api.promoteToOwner(request.WorkspaceId, request.UserId);

    return { DurationMs: Date.now() - startedAt, Value: value };
};

const buildOutcome = (
    request: StepBRequest, measured: MeasuredMembership,
): StepBStepOutcome => ({
    Step: StepBStepCode.PromoteToOwner,
    DurationMs: measured.DurationMs,
    WorkspaceId: request.WorkspaceId,
    UserId: request.UserId,
});

const failureFrom = (caught: unknown): StepBResult => ({
    Outcomes: [], Membership: null,
    Error: caught instanceof Error ? caught.message : String(caught),
});

export const runStepB = async (
    api: LovableApiClient, request: StepBRequest,
): Promise<StepBResult> => {
    try {
        const measured = await measurePromote(api, request);

        return {
            Outcomes: [buildOutcome(request, measured)],
            Membership: measured.Value,
            Error: null,
        };
    } catch (caught: unknown) {
        return failureFrom(caught);
    }
};
