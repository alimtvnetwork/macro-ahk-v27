/**
 * User Add — Step A orchestrator.
 *
 * Two-step chain: extract WorkspaceId from URL → POST membership via
 * shared `LovableApiClient.addMembership(...)`. Returns the created
 * `MembershipSummary` so the per-row state machine (P17) can hand the
 * fresh `UserId` straight to Step B (P16) without an extra GET.
 *
 * Owner rows are POSTed as Member at this layer; promotion to Owner
 * happens in Step B (R12 — single PUT site). Non-Owner rows skip
 * Step B entirely.
 *
 * Single attempt, no retry (mem://constraints/no-retry-policy).
 */

import { LovableApiClient } from "../../../lovable-common/src/api/lovable-api-client";
import { extractWorkspaceId } from "./extract-workspace-id";
import { toStepAApiRole } from "./role-api-mapper";
import { StepAStepCode } from "./step-a-types";
import type { StepARequest, StepAResult, StepAStepOutcome } from "./step-a-types";
import type { MembershipSummary } from "../../../lovable-common/src/api/lovable-api-types";

const measure = async <T>(run: () => Promise<T>): Promise<{ Value: T; DurationMs: number }> => {
    const startedAt = Date.now();
    const value = await run();

    return { Value: value, DurationMs: Date.now() - startedAt };
};

interface ChainState {
    Outcomes: StepAStepOutcome[];
    Membership: MembershipSummary;
    WorkspaceId: string;
}

const runChain = async (api: LovableApiClient, request: StepARequest): Promise<ChainState> => {
    const wsStart = Date.now();
    const workspaceId = extractWorkspaceId(request.WorkspaceUrl);
    const wsMs = Date.now() - wsStart;
    const apiRole = toStepAApiRole(request.RoleCode);
    const post = await measure(() => api.addMembership(workspaceId, {
        Email: request.MemberEmail, Role: apiRole,
    }));

    return {
        Outcomes: [
            { Step: StepAStepCode.ResolveWorkspaceId, DurationMs: wsMs, WorkspaceId: workspaceId, UserId: null },
            { Step: StepAStepCode.PostMembership, DurationMs: post.DurationMs, WorkspaceId: workspaceId, UserId: post.Value.UserId },
        ],
        Membership: post.Value,
        WorkspaceId: workspaceId,
    };
};

const failureFrom = (caught: unknown): StepAResult => ({
    Outcomes: [], Membership: null, WorkspaceId: null,
    Error: caught instanceof Error ? caught.message : String(caught),
});

export const runStepA = async (
    api: LovableApiClient, request: StepARequest,
): Promise<StepAResult> => {
    try {
        const chain = await runChain(api, request);

        return {
            Outcomes: chain.Outcomes, Membership: chain.Membership,
            WorkspaceId: chain.WorkspaceId, Error: null,
        };
    } catch (caught: unknown) {
        return failureFrom(caught);
    }
};
