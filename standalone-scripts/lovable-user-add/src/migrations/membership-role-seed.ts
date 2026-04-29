/**
 * User Add — MembershipRole enum (seeded into `MembershipRole` table).
 *
 * Closed set; values are the canonical role codes used by Lovable's
 * membership API. `Editor` is intentionally NOT included — per Q3
 * default, CSV rows with role `Editor` are normalized to `Member` at
 * parse time (P13). The DB only stores accepted roles.
 *
 * `RequiresPromotion: 1` flags roles that need Step B (Owner promotion
 * via shared `LovableApiClient.promoteToOwner` — R12). Only `Owner`
 * triggers Step B.
 */

export enum UserAddMembershipRoleCode {
    Owner = "Owner",
    Admin = "Admin",
    Member = "Member",
}

export interface MembershipRoleSeed {
    Code: UserAddMembershipRoleCode;
    DisplayLabel: string;
    SortOrder: number;
    RequiresPromotion: 0 | 1;
}

export const MEMBERSHIP_ROLE_SEEDS: ReadonlyArray<MembershipRoleSeed> = Object.freeze([
    { Code: UserAddMembershipRoleCode.Owner, DisplayLabel: "Owner", SortOrder: 1, RequiresPromotion: 1 },
    { Code: UserAddMembershipRoleCode.Admin, DisplayLabel: "Admin", SortOrder: 2, RequiresPromotion: 0 },
    { Code: UserAddMembershipRoleCode.Member, DisplayLabel: "Member", SortOrder: 3, RequiresPromotion: 0 },
]);
