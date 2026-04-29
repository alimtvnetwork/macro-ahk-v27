import { MembershipRoleApiCode } from "./membership-role-api-code";
import type { MembershipSummary, WorkspaceSummary } from "./lovable-api-types";

/**
 * Wire→Domain mappers. Lovable returns lowercase keys; domain uses
 * PascalCase to match SQLite. Mapping walks the parsed object via
 * `Object.entries`, validating each field's type explicitly — no `as`,
 * no `unknown`, no `any`.
 */

const ROLE_BY_WIRE: Readonly<Record<string, MembershipRoleApiCode>> = Object.freeze({
    owner: MembershipRoleApiCode.Owner,
    admin: MembershipRoleApiCode.Admin,
    member: MembershipRoleApiCode.Member,
});

const collectStringFields = (source: object): Record<string, string> => {
    const out: Record<string, string> = {};

    for (const [key, value] of Object.entries(source)) {
        if (typeof value === "string") {
            out[key] = value;
        }
    }

    return out;
};

const requireString = (fields: Record<string, string>, key: string): string => {
    const value = fields[key];

    if (value === undefined) {
        throw new Error(`Lovable wire response missing string field: ${key}`);
    }

    return value;
};

const requireRole = (fields: Record<string, string>): MembershipRoleApiCode => {
    const raw = requireString(fields, "role");
    const role = ROLE_BY_WIRE[raw];

    if (role === undefined) {
        throw new Error(`Lovable wire response has unknown role: ${raw}`);
    }

    return role;
};

export const mapWorkspace = (wire: object): WorkspaceSummary => {
    const fields = collectStringFields(wire);

    return { Id: requireString(fields, "id"), Name: requireString(fields, "name") };
};

export const mapMembership = (wire: object): MembershipSummary => {
    const fields = collectStringFields(wire);

    return {
        UserId: requireString(fields, "user_id"),
        Email: requireString(fields, "email"),
        Role: requireRole(fields),
    };
};

const requireArray = (wire: object): object[] => {
    if (!Array.isArray(wire)) {
        throw new Error("Lovable wire response expected an array");
    }

    return wire;
};

export const mapWorkspaceArray = (wire: object): WorkspaceSummary[] => requireArray(wire).map(mapWorkspace);

export const mapMembershipArray = (wire: object): MembershipSummary[] => requireArray(wire).map(mapMembership);
