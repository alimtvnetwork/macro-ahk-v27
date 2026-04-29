/**
 * User Add — csv-validator tests.
 *
 * Covers row-level (workspace URL strictness, Notes cap) and file-level
 * (duplicate WorkspaceUrl + MemberEmail pair) rules added during the
 * stricter-validation pass.
 */

import { describe, it, expect } from "vitest";
import { validateRow, validateFile } from "../csv-validator";
import { UserAddCsvColumn } from "../csv-column";
import type { UserAddCsvRow } from "../csv-types";
import { UserAddMembershipRoleCode } from "../../migrations/membership-role-seed";

const baseRow = (overrides: Partial<UserAddCsvRow> = {}): UserAddCsvRow => ({
    RowIndex: 1,
    WorkspaceUrl: "https://lovable.dev/projects/abc-123",
    MemberEmail: "user@example.com",
    RawRole: "Member",
    RoleCode: UserAddMembershipRoleCode.Member,
    WasEditorNormalized: false,
    Notes: null,
    ...overrides,
});

describe("validateRow (user-add) — workspace URL", () => {
    it("accepts a Lovable workspace URL with a path segment", () => {
        expect(validateRow(baseRow())).toEqual([]);
    });

    it("accepts a Lovable subdomain workspace URL", () => {
        const errs = validateRow(baseRow({
            WorkspaceUrl: "https://my-team.lovable.dev/projects/abc",
        }));
        expect(errs).toEqual([]);
    });

    it.each([
        ["https://lovable.dev/", "bare host with trailing slash"],
        ["https://lovable.dev", "bare host"],
        ["https://example.com/projects/abc", "non-Lovable host"],
        ["ftp://lovable.dev/projects/abc", "wrong protocol"],
        ["not-a-url", "unparseable"],
    ])("rejects: %s (%s)", (url) => {
        const errs = validateRow(baseRow({ WorkspaceUrl: url }));
        expect(errs).toHaveLength(1);
        expect(errs[0].Column).toBe(UserAddCsvColumn.WorkspaceUrl);
    });
});

describe("validateRow (user-add) — Notes cap", () => {
    it("flags Notes > 500 chars", () => {
        const errs = validateRow(baseRow({ Notes: "x".repeat(501) }));
        expect(errs).toHaveLength(1);
        expect(errs[0].Column).toBe(UserAddCsvColumn.Notes);
    });
});

describe("validateFile (user-add)", () => {
    it("returns no errors for unique pairs", () => {
        const errs = validateFile([
            baseRow({ RowIndex: 1, MemberEmail: "a@example.com" }),
            baseRow({ RowIndex: 2, MemberEmail: "b@example.com" }),
        ]);
        expect(errs).toEqual([]);
    });

    it("flags duplicate (WorkspaceUrl, MemberEmail) pairs (case-insensitive)", () => {
        const errs = validateFile([
            baseRow({ RowIndex: 1, MemberEmail: "User@Example.com" }),
            baseRow({ RowIndex: 2, MemberEmail: "user@example.com" }),
        ]);
        expect(errs).toHaveLength(1);
        expect(errs[0].RowIndex).toBe(2);
        expect(errs[0].Message).toContain("first seen on row 1");
    });

    it("does NOT flag the same email under a different workspace", () => {
        const errs = validateFile([
            baseRow({ RowIndex: 1, WorkspaceUrl: "https://lovable.dev/projects/a", MemberEmail: "u@example.com" }),
            baseRow({ RowIndex: 2, WorkspaceUrl: "https://lovable.dev/projects/b", MemberEmail: "u@example.com" }),
        ]);
        expect(errs).toEqual([]);
    });
});
