/**
 * User Add — Role normalizer (Q3).
 *
 * Maps free-text CSV `Role` cell to `UserAddMembershipRoleCode`:
 *   - case-insensitive match against canonical Owner/Admin/Member
 *   - `Editor` (any case) → `Member` + `WasEditorNormalized: true`
 *   - null → null (caller applies task default at creation time)
 *   - unknown → null + typed error returned
 *
 * Pure function. NO logging here — `WasEditorNormalized` flag is the
 * signal; P19 logs viewer surfaces these as info-level entries.
 */

import { UserAddMembershipRoleCode } from "../migrations/membership-role-seed";

export interface RoleNormalizeResult {
    RoleCode: UserAddMembershipRoleCode | null;
    WasEditorNormalized: boolean;
    Error: string | null;
}

const KNOWN_ROLES: ReadonlyMap<string, UserAddMembershipRoleCode> = new Map([
    ["owner", UserAddMembershipRoleCode.Owner],
    ["admin", UserAddMembershipRoleCode.Admin],
    ["member", UserAddMembershipRoleCode.Member],
]);

const EDITOR_KEY = "editor";

export const normalizeRole = (raw: string | null): RoleNormalizeResult => {
    if (raw === null) {
        return { RoleCode: null, WasEditorNormalized: false, Error: null };
    }

    const key = raw.trim().toLowerCase();

    if (key === EDITOR_KEY) {
        return {
            RoleCode: UserAddMembershipRoleCode.Member,
            WasEditorNormalized: true, Error: null,
        };
    }

    const matched = KNOWN_ROLES.get(key);

    if (matched === undefined) {
        return {
            RoleCode: null, WasEditorNormalized: false,
            Error: `Unknown role: ${raw} (expected Owner/Admin/Member/Editor)`,
        };
    }

    return { RoleCode: matched, WasEditorNormalized: false, Error: null };
};
