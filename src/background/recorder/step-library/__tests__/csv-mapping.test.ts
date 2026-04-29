import { describe, expect, it } from "vitest";
import {
    buildBagFromRow,
    suggestVariableName,
    validateVariableName,
    type ColumnMapping,
} from "../csv-mapping";

describe("suggestVariableName", () => {
    it("strips invalid chars and trims separators", () => {
        expect(suggestVariableName("First Name")).toBe("First_Name");
        expect(suggestVariableName("  user-id  ")).toBe("user_id");
        expect(suggestVariableName("$$value")).toBe("value");
    });
    it("prefixes underscore when leading char is a digit", () => {
        expect(suggestVariableName("1stCol")).toBe("_1stCol");
    });
    it("falls back to Var when nothing usable remains", () => {
        expect(suggestVariableName("@@@")).toBe("Var");
    });
    it("caps at 64 chars", () => {
        expect(suggestVariableName("x".repeat(200)).length).toBe(64);
    });
});

describe("validateVariableName", () => {
    it("accepts good names", () => {
        expect(validateVariableName("Email")).toBeNull();
        expect(validateVariableName("_value1")).toBeNull();
    });
    it("rejects empties / digits-first / weird chars", () => {
        expect(validateVariableName("")).not.toBeNull();
        expect(validateVariableName("1abc")).not.toBeNull();
        expect(validateVariableName("a-b")).not.toBeNull();
    });
});

describe("buildBagFromRow", () => {
    const headers = ["Email", "Age", "Active", "Meta"];
    const row    = ["a@b.co", "42", "true", '{"plan":"pro"}'];

    it("maps every column with auto coercion by default", () => {
        const m: ColumnMapping[] = [
            { Column: "Email",  Variable: "Email",  Coerce: "auto" },
            { Column: "Age",    Variable: "Age",    Coerce: "auto" },
            { Column: "Active", Variable: "Active", Coerce: "auto" },
            { Column: "Meta",   Variable: "MetaStr", Coerce: "string" },
        ];
        const r = buildBagFromRow({ Headers: headers, Row: row, Mappings: m });
        expect(r.Ok).toBe(true);
        if (r.Ok) {
            expect(r.Bag).toEqual({
                Email: "a@b.co",
                Age: 42,
                Active: true,
                MetaStr: '{"plan":"pro"}',
            });
        }
    });

    it("respects explicit json coercion", () => {
        const m: ColumnMapping[] = [
            { Column: "Meta", Variable: "Meta", Coerce: "json" },
        ];
        const r = buildBagFromRow({ Headers: headers, Row: row, Mappings: m });
        expect(r.Ok).toBe(true);
        if (r.Ok) expect(r.Bag).toEqual({ Meta: { plan: "pro" } });
    });

    it("skips columns with Variable=null", () => {
        const m: ColumnMapping[] = [
            { Column: "Email", Variable: "Email", Coerce: "auto" },
            { Column: "Age",   Variable: null,    Coerce: "auto" },
        ];
        const r = buildBagFromRow({ Headers: headers, Row: row, Mappings: m });
        expect(r.Ok).toBe(true);
        if (r.Ok) {
            expect(Object.keys(r.Bag)).toEqual(["Email"]);
            expect(r.UsedColumns).toBe(1);
        }
    });

    it("fails when no columns are mapped", () => {
        const m: ColumnMapping[] = [
            { Column: "Email", Variable: null, Coerce: "auto" },
        ];
        const r = buildBagFromRow({ Headers: headers, Row: row, Mappings: m });
        expect(r.Ok).toBe(false);
    });

    it("fails on duplicate variable names", () => {
        const m: ColumnMapping[] = [
            { Column: "Email", Variable: "X", Coerce: "string" },
            { Column: "Age",   Variable: "X", Coerce: "string" },
        ];
        const r = buildBagFromRow({ Headers: headers, Row: row, Mappings: m });
        expect(r.Ok).toBe(false);
    });

    it("fails on bad number coercion with the offending column", () => {
        const m: ColumnMapping[] = [
            { Column: "Email", Variable: "Email", Coerce: "number" },
        ];
        const r = buildBagFromRow({ Headers: headers, Row: row, Mappings: m });
        expect(r.Ok).toBe(false);
        if (!r.Ok) {
            expect(r.Column).toBe("Email");
            expect(r.Reason).toMatch(/number/);
        }
    });

    it("fails when mapping references a missing column", () => {
        const m: ColumnMapping[] = [
            { Column: "Nope", Variable: "X", Coerce: "auto" },
        ];
        const r = buildBagFromRow({ Headers: headers, Row: row, Mappings: m });
        expect(r.Ok).toBe(false);
        if (!r.Ok) expect(r.Column).toBe("Nope");
    });
});
