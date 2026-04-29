/**
 * Phase 07 — Recorder Data Source Parsers unit tests.
 *
 * Pure parsers — no DOM, no SQLite, no chrome.
 */

import { describe, it, expect } from "vitest";
import { parseCsv, parseJsonRows } from "../data-source-parsers";
import { DataSourceKindId } from "../../recorder-db-schema";

describe("parseCsv", () => {
    it("extracts header columns and counts rows", () => {
        const csv = "Name,Email,Age\nAlice,a@x.io,30\nBob,b@x.io,40\n";
        const result = parseCsv(csv);

        expect(result.DataSourceKindId).toBe(DataSourceKindId.Csv);
        expect(result.Columns).toEqual(["Name", "Email", "Age"]);
        expect(result.RowCount).toBe(2);
    });

    it("handles CRLF line endings", () => {
        const csv = "A,B\r\n1,2\r\n3,4\r\n";
        const result = parseCsv(csv);
        expect(result.RowCount).toBe(2);
        expect(result.Columns).toEqual(["A", "B"]);
    });

    it("handles quoted fields with embedded commas and escaped quotes", () => {
        const csv = `Name,Bio\n"Doe, John","Said ""hi"""`;
        const result = parseCsv(csv);
        expect(result.Columns).toEqual(["Name", "Bio"]);
        expect(result.RowCount).toBe(1);
    });

    it("ignores blank lines when counting rows", () => {
        const csv = "A,B\n\n1,2\n\n\n3,4\n";
        const result = parseCsv(csv);
        expect(result.RowCount).toBe(2);
    });

    it("throws on empty input", () => {
        expect(() => parseCsv("")).toThrow(/empty/);
        expect(() => parseCsv("   \n  \n")).toThrow(/empty/);
    });
});

describe("parseJsonRows", () => {
    it("parses an array of objects and unions keys preserving first-seen order", () => {
        const json = JSON.stringify([
            { Name: "Alice", Age: 30 },
            { Name: "Bob", Email: "b@x.io" },
        ]);
        const result = parseJsonRows(json);

        expect(result.DataSourceKindId).toBe(DataSourceKindId.Json);
        expect(result.Columns).toEqual(["Name", "Age", "Email"]);
        expect(result.RowCount).toBe(2);
    });

    it("rejects non-array JSON", () => {
        expect(() => parseJsonRows('{"x":1}')).toThrow(/array of objects/);
    });

    it("rejects empty arrays", () => {
        expect(() => parseJsonRows("[]")).toThrow(/empty/);
    });

    it("rejects arrays containing non-objects", () => {
        expect(() => parseJsonRows("[1,2,3]")).toThrow(/plain objects/);
        expect(() => parseJsonRows('[{"a":1},[1,2]]')).toThrow(/plain objects/);
        expect(() => parseJsonRows('[{"a":1},null]')).toThrow(/plain objects/);
    });
});
