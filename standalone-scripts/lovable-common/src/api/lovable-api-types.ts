import type { MembershipRoleApiCode } from "./membership-role-api-code";

/**
 * Typed contracts for Lovable membership REST payloads (PascalCase fields
 * map 1:1 to SQLite; wire JSON is built explicitly in the client).
 */

export interface WorkspaceSummary {
    Id: string;
    Name: string;
}

export interface MembershipSummary {
    UserId: string;
    Email: string;
    Role: MembershipRoleApiCode;
}

export interface AddMembershipRequest {
    Email: string;
    Role: MembershipRoleApiCode;
}

export interface UpdateMembershipRoleRequest {
    Role: MembershipRoleApiCode;
}
