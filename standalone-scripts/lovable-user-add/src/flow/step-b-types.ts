/**
 * User Add — Step B types.
 *
 * Step B is the PUT /memberships/{userId} call that promotes a member
 * to Owner. It only runs when the row's `RoleCode === Owner` AND Step
 * A succeeded. Inputs come straight from Step A's `MembershipSummary`
 * — no extra resolution needed, so the chain has a single step.
 *
 * Q8 default: single attempt, no retry per
 * `mem://constraints/no-retry-policy`.
 */

import type { MembershipSummary } from "../../../lovable-common/src/api/lovable-api-types";

export enum StepBStepCode {
    PromoteToOwner = "PromoteToOwner",
}

export interface StepBRequest {
    WorkspaceId: string;
    UserId: string;
}

export interface StepBStepOutcome {
    Step: StepBStepCode;
    DurationMs: number;
    WorkspaceId: string;
    UserId: string;
}

export interface StepBResult {
    Outcomes: ReadonlyArray<StepBStepOutcome>;
    Membership: MembershipSummary | null;
    Error: string | null;
}
