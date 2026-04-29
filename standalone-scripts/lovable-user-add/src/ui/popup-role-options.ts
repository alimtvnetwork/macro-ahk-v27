/**
 * User Add popup — default-role select options.
 *
 * Single source of truth for the popup `<select>`. Editor IS offered
 * here as a UX convenience, but the value is normalized to Member at
 * task-creation time (same Q3 rule as the CSV parser). Owner is the
 * first option so users see the "promote" path is supported.
 */

import { UserAddMembershipRoleCode } from "../migrations/membership-role-seed";

export interface RoleOption {
    Value: string;
    Label: string;
}

export const DEFAULT_ROLE_OPTIONS: ReadonlyArray<RoleOption> = Object.freeze([
    { Value: UserAddMembershipRoleCode.Owner, Label: "Owner (triggers Step B promotion)" },
    { Value: UserAddMembershipRoleCode.Admin, Label: "Admin" },
    { Value: UserAddMembershipRoleCode.Member, Label: "Member" },
    { Value: "Editor", Label: "Editor (normalized to Member)" },
]);

export const DEFAULT_ROLE_VALUE: string = UserAddMembershipRoleCode.Member;
