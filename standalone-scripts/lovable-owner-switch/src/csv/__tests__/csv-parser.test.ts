/**
 * Owner Switch — csv-parser file-level guard tests.
 *
 * Covers BOM stripping, empty/whitespace-only rejection, and the
 * MAX_ROWS hard cap added during the stricter-validation pass.
 */

import { describe, it, expect } from "vitest";
import { parseOwnerSwitchCsv } from "../csv-parser";

const HEADER = "LoginEmail,OwnerEmail1";

describe("parseOwnerSwitchCsv — file-level guards", () => {
    it("rejects empty input with a clear message", () => {
        const result = parseOwnerSwitchCsv("");
        expect(result.Rows).toEqual([]);
        expect(result.Errors[0].Message).toContain("empty");
    });

    it("rejects whitespace-only input", () => {
        const result = parseOwnerSwitchCsv("   \n\t\r\n");
        expect(result.Rows).toEqual([]);
        expect(result.Errors[0].Message).toContain("empty");
    });

    it("strips a leading BOM before parsing", () => {
        const csv = `\uFEFF${HEADER}\nadmin@example.com,owner@example.com`;
        const result = parseOwnerSwitchCsv(csv);
        expect(result.Errors).toEqual([]);
        expect(result.Rows).toHaveLength(1);
        expect(result.Rows[0].LoginEmail).toBe("admin@example.com");
    });

    it("rejects files exceeding MAX_ROWS (1000)", () => {
        const rows = Array.from({ length: 1001 }, (_, i) => `a${i}@example.com,owner${i}@example.com`);
        const csv = `${HEADER}\n${rows.join("\n")}`;
        const result = parseOwnerSwitchCsv(csv);
        expect(result.Rows).toEqual([]);
        expect(result.Errors.some((e) => e.Message.includes("Too many rows"))).toBe(true);
    });

    it("accepts exactly MAX_ROWS rows", () => {
        const rows = Array.from({ length: 1000 }, (_, i) => `a${i}@example.com,owner${i}@example.com`);
        const csv = `${HEADER}\n${rows.join("\n")}`;
        const result = parseOwnerSwitchCsv(csv);
        expect(result.Rows).toHaveLength(1000);
        expect(result.Errors.some((e) => e.Message.includes("Too many rows"))).toBe(false);
    });
});
