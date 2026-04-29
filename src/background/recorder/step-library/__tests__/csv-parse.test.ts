import { describe, expect, it } from "vitest";
import { parseCsv, MAX_BYTES, MAX_ROWS } from "../csv-parse";

describe("parseCsv — basics", () => {
    it("parses a simple comma-delimited file with header", () => {
        const r = parseCsv("Name,Email\nAlice,a@b.co\nBob,b@b.co");
        expect(r.Ok).toBe(true);
        if (r.Ok) {
            expect(r.Delimiter).toBe(",");
            expect(r.Headers).toEqual(["Name", "Email"]);
            expect(r.Rows).toEqual([["Alice", "a@b.co"], ["Bob", "b@b.co"]]);
        }
    });

    it("auto-detects semicolon delimiter", () => {
        const r = parseCsv("Name;Age\nAlice;30\nBob;25");
        expect(r.Ok).toBe(true);
        if (r.Ok) expect(r.Delimiter).toBe(";");
    });

    it("strips a UTF-8 BOM from the start", () => {
        const r = parseCsv("\uFEFFA,B\n1,2");
        expect(r.Ok).toBe(true);
        if (r.Ok) expect(r.Headers).toEqual(["A", "B"]);
    });

    it("supports CRLF, LF, and CR line endings", () => {
        const r1 = parseCsv("A,B\r\n1,2\r\n3,4");
        const r2 = parseCsv("A,B\n1,2\n3,4");
        const r3 = parseCsv("A,B\r1,2\r3,4");
        for (const r of [r1, r2, r3]) {
            expect(r.Ok).toBe(true);
            if (r.Ok) expect(r.Rows.length).toBe(2);
        }
    });

    it("handles quoted fields with embedded delimiter and newline", () => {
        const csv = `Name,Bio\n"Doe, John","Line one\nLine two"`;
        const r = parseCsv(csv);
        expect(r.Ok).toBe(true);
        if (r.Ok) {
            expect(r.Rows[0]).toEqual(["Doe, John", "Line one\nLine two"]);
        }
    });

    it("unescapes doubled quotes inside a quoted field", () => {
        const r = parseCsv(`A,B\n"He said ""hi""",ok`);
        expect(r.Ok).toBe(true);
        if (r.Ok) expect(r.Rows[0]).toEqual([`He said "hi"`, "ok"]);
    });

    it("ignores a single trailing blank line", () => {
        const r = parseCsv("A,B\n1,2\n");
        expect(r.Ok).toBe(true);
        if (r.Ok) expect(r.Rows.length).toBe(1);
    });
});

describe("parseCsv — failures", () => {
    it("fails on empty input", () => {
        const r = parseCsv("");
        expect(r.Ok).toBe(false);
    });

    it("fails on duplicate headers", () => {
        const r = parseCsv("A,A\n1,2");
        expect(r.Ok).toBe(false);
        if (!r.Ok) expect(r.Reason).toMatch(/Duplicate column/);
    });

    it("fails on empty header cell", () => {
        const r = parseCsv("A,,B\n1,2,3");
        expect(r.Ok).toBe(false);
        if (!r.Ok) expect(r.Reason).toMatch(/empty column name/);
    });

    it("fails on unterminated quote with line number", () => {
        const r = parseCsv(`A,B\n"oops,2`);
        expect(r.Ok).toBe(false);
        if (!r.Ok) expect(r.Reason).toMatch(/Unterminated/);
    });

    it("rejects files over 5 MB", () => {
        const big = "A,B\n" + "x,y\n".repeat(2_000_000);
        // Sanity: this string is > MAX_BYTES.
        if (big.length > MAX_BYTES) {
            const r = parseCsv(big);
            expect(r.Ok).toBe(false);
            if (!r.Ok) expect(r.Reason).toMatch(/in-memory limit/);
        }
    });

    it("rejects files over 10k rows", () => {
        const lines = ["A,B"];
        for (let i = 0; i < MAX_ROWS + 5; i++) lines.push(`${i},x`);
        const r = parseCsv(lines.join("\n"));
        expect(r.Ok).toBe(false);
        if (!r.Ok) expect(r.Reason).toMatch(/limit is 10000/);
    });
});

describe("parseCsv — alignment warnings", () => {
    it("pads short rows and warns", () => {
        const r = parseCsv("A,B,C\n1,2\n3,4,5");
        expect(r.Ok).toBe(true);
        if (r.Ok) {
            expect(r.Rows[0]).toEqual(["1", "2", ""]);
            expect(r.Warnings.some((w) => /padded/.test(w))).toBe(true);
        }
    });

    it("truncates long rows and warns", () => {
        const r = parseCsv("A,B\n1,2,3,4");
        expect(r.Ok).toBe(true);
        if (r.Ok) {
            expect(r.Rows[0]).toEqual(["1", "2"]);
            expect(r.Warnings.some((w) => /dropped/.test(w))).toBe(true);
        }
    });
});
