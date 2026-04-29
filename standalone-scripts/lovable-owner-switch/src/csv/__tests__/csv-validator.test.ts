/**
 * Owner Switch — csv-validator tests.
 *
 * Covers row-level (length caps, owner-pair distinctness, optional
 * email format) and file-level (duplicate LoginEmail) rules added
 * during the stricter-validation pass.
 */

import { describe, it, expect } from "vitest";
import { validateRow, validateFile } from "../csv-validator";
import { OwnerSwitchCsvColumn } from "../csv-column";
import type { OwnerSwitchCsvRow } from "../csv-types";

const baseRow = (overrides: Partial<OwnerSwitchCsvRow> = {}): OwnerSwitchCsvRow => ({
    RowIndex: 1,
    LoginEmail: "admin@example.com",
    Password: null,
    OwnerEmail1: "owner1@example.com",
    OwnerEmail2: null,
    Notes: null,
    ...overrides,
});

describe("validateRow (owner-switch)", () => {
    it("returns no errors for a well-formed row", () => {
        expect(validateRow(baseRow())).toEqual([]);
    });

    it("flags invalid LoginEmail", () => {
        const errs = validateRow(baseRow({ LoginEmail: "not-an-email" }));
        expect(errs).toHaveLength(1);
        expect(errs[0].Column).toBe(OwnerSwitchCsvColumn.LoginEmail);
    });

    it("flags duplicate OwnerEmail1 / OwnerEmail2 (case-insensitive)", () => {
        const errs = validateRow(baseRow({
            OwnerEmail1: "Same@Example.com",
            OwnerEmail2: "same@example.com",
        }));
        expect(errs).toHaveLength(1);
        expect(errs[0].Column).toBe(OwnerSwitchCsvColumn.OwnerEmail2);
        expect(errs[0].Message).toContain("duplicates OwnerEmail1");
    });

    it("flags Notes exceeding max length", () => {
        const errs = validateRow(baseRow({ Notes: "x".repeat(501) }));
        expect(errs).toHaveLength(1);
        expect(errs[0].Column).toBe(OwnerSwitchCsvColumn.Notes);
    });

    it("flags Password exceeding max length", () => {
        const errs = validateRow(baseRow({ Password: "p".repeat(201) }));
        expect(errs).toHaveLength(1);
        expect(errs[0].Column).toBe(OwnerSwitchCsvColumn.Password);
    });

    it("does NOT flag distinct owner emails", () => {
        const errs = validateRow(baseRow({
            OwnerEmail1: "a@example.com",
            OwnerEmail2: "b@example.com",
        }));
        expect(errs).toEqual([]);
    });
});

describe("validateFile (owner-switch)", () => {
    it("returns no errors for unique LoginEmails", () => {
        const errs = validateFile([
            baseRow({ RowIndex: 1, LoginEmail: "a@example.com" }),
            baseRow({ RowIndex: 2, LoginEmail: "b@example.com" }),
        ]);
        expect(errs).toEqual([]);
    });

    it("flags duplicate LoginEmail rows (case-insensitive)", () => {
        const errs = validateFile([
            baseRow({ RowIndex: 1, LoginEmail: "Same@Example.com" }),
            baseRow({ RowIndex: 2, LoginEmail: "same@example.com" }),
            baseRow({ RowIndex: 3, LoginEmail: "SAME@example.com" }),
        ]);
        expect(errs).toHaveLength(2);
        expect(errs[0].RowIndex).toBe(2);
        expect(errs[0].Message).toContain("first seen on row 1");
        expect(errs[1].RowIndex).toBe(3);
    });
});
