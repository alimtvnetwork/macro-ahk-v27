/**
 * Owner Switch — promote step types.
 *
 * Closed enums + typed inputs/outputs so the per-row driver (P10) and
 * the shared logger never deal in magic strings.
 */

export enum PromoteStepCode {
    ResolveWorkspace = "ResolveWorkspace",
    ResolveUserId = "ResolveUserId",
    PromoteToOwner = "PromoteToOwner",
}

export interface PromoteRowRequest {
    LoginEmail: string;
    OwnerEmail: string;
}

export interface PromoteRowOutcome {
    Step: PromoteStepCode;
    DurationMs: number;
    WorkspaceId: string | null;
    UserId: string | null;
}

export interface PromoteRowResult {
    Outcomes: ReadonlyArray<PromoteRowOutcome>;
    FailedStep: PromoteStepCode | null;
    Error: string | null;
}
