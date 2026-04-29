/**
 * User Add — Step A types.
 *
 * Step A is the POST /workspaces/{id}/memberships call. The result
 * includes the new `MembershipSummary` so Step B (P16) can pull the
 * fresh `UserId` directly without a second GET /memberships.
 *
 * Q8 default applied at orchestration time (P17): single attempt,
 * no retry per `mem://constraints/no-retry-policy`.
 */

import type { UserAddMembershipRoleCode } from "../migrations/membership-role-seed";
import type { MembershipSummary } from "../../../lovable-common/src/api/lovable-api-types";

export enum StepAStepCode {
    ResolveWorkspaceId = "ResolveWorkspaceId",
    PostMembership = "PostMembership",
}

export interface StepARequest {
    WorkspaceUrl: string;
    MemberEmail: string;
    RoleCode: UserAddMembershipRoleCode;
}

export interface StepAStepOutcome {
    Step: StepAStepCode;
    DurationMs: number;
    WorkspaceId: string;
    UserId: string | null;
}

export interface StepAResult {
    Outcomes: ReadonlyArray<StepAStepOutcome>;
    Membership: MembershipSummary | null;
    WorkspaceId: string | null;
    Error: string | null;
}
