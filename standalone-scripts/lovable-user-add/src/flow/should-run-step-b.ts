/**
 * User Add — Step B gating predicate.
 *
 * Pure function: returns true iff the row's `RoleCode` is Owner. The
 * per-row state machine (P17) calls this between Step A success and
 * Step B invocation. Centralising the predicate prevents accidental
 * promotion of Admin/Member rows and keeps the policy in one place.
 */

import { UserAddMembershipRoleCode } from "../migrations/membership-role-seed";

export const shouldRunStepB = (roleCode: UserAddMembershipRoleCode): boolean => {
    return roleCode === UserAddMembershipRoleCode.Owner;
};
