/**
 * Detailed Field Reference Resolver — unit tests.
 *
 * Covers the diagnostic resolver that powers variable-bound failure logs:
 * one VariableContext per token with Name + ResolvedValue + ValueType +
 * FailureReason, never throws.
 */

import { describe, it, expect } from "vitest";
import {
    resolveFieldReferencesDetailed,
    type LooseFieldRow,
} from "../field-reference-resolver";

describe("resolveFieldReferencesDetailed", () => {
    it("resolves a happy-path token and reports type=string", () => {
        const r = resolveFieldReferencesDetailed("Hi {{Name}}!", { Name: "Alice" });
        expect(r.Resolved).toBe("Hi Alice!");
        expect(r.FirstFailure).toBeNull();
        expect(r.Variables).toHaveLength(1);
        expect(r.Variables[0]).toMatchObject({
            Name: "Name", ResolvedValue: "Alice", ValueType: "string",
            FailureReason: "Resolved", FailureDetail: null, Source: "Row",
        });
    });

    it("flags MissingColumn with available column list", () => {
        const r = resolveFieldReferencesDetailed("Hi {{Email}}", { Name: "Alice" } as LooseFieldRow);
        expect(r.Resolved).toBe("Hi ");
        expect(r.FirstFailure?.FailureReason).toBe("MissingColumn");
        expect(r.FirstFailure?.ResolvedValue).toBeNull();
        expect(r.FirstFailure?.ValueType).toBe("undefined");
        expect(r.FirstFailure?.FailureDetail).toContain("Email");
        expect(r.FirstFailure?.FailureDetail).toContain("Name");
    });

    it("flags NullValue when the column is present but null", () => {
        const r = resolveFieldReferencesDetailed("X={{Foo}}", { Foo: null });
        expect(r.FirstFailure?.FailureReason).toBe("NullValue");
        expect(r.FirstFailure?.ValueType).toBe("null");
        expect(r.FirstFailure?.ResolvedValue).toBeNull();
    });

    it("flags UndefinedValue when the column value is undefined", () => {
        const r = resolveFieldReferencesDetailed("X={{Foo}}", { Foo: undefined });
        expect(r.FirstFailure?.FailureReason).toBe("UndefinedValue");
        expect(r.FirstFailure?.ValueType).toBe("undefined");
    });

    it("flags EmptyString when the column is the empty string", () => {
        const r = resolveFieldReferencesDetailed("X={{Foo}}", { Foo: "" });
        expect(r.FirstFailure?.FailureReason).toBe("EmptyString");
        expect(r.FirstFailure?.ResolvedValue).toBe("");
        expect(r.FirstFailure?.ValueType).toBe("string");
    });

    it("flags TypeMismatch when the column is an object but a string is expected", () => {
        const r = resolveFieldReferencesDetailed("X={{Foo}}", { Foo: { nested: 1 } });
        expect(r.FirstFailure?.FailureReason).toBe("TypeMismatch");
        expect(r.FirstFailure?.ValueType).toBe("object");
        expect(r.FirstFailure?.FailureDetail).toContain("expected string but got object");
    });

    it("accepts numbers and booleans as primitives without TypeMismatch", () => {
        const r = resolveFieldReferencesDetailed("Age={{Age}} Active={{Active}}", { Age: 33, Active: true });
        expect(r.Resolved).toBe("Age=33 Active=true");
        expect(r.FirstFailure).toBeNull();
        expect(r.Variables.find((v) => v.Name === "Age")?.ValueType).toBe("number");
        expect(r.Variables.find((v) => v.Name === "Active")?.ValueType).toBe("boolean");
    });

    it("dedupes repeated tokens — one diagnostic per name", () => {
        const r = resolveFieldReferencesDetailed("{{X}} and {{X}} again", { X: "ok" });
        expect(r.Variables).toHaveLength(1);
        expect(r.Resolved).toBe("ok and ok again");
    });

    it("emits literal {{Foo}} for escaped tokens and does NOT diagnose them", () => {
        const r = resolveFieldReferencesDetailed("\\{{NotAToken}} {{Real}}", { Real: "yes" });
        expect(r.Resolved).toBe("{{NotAToken}} yes");
        expect(r.Variables).toHaveLength(1);
        expect(r.Variables[0].Name).toBe("Real");
    });

    it("records caller-supplied Source and RowIndex on every variable", () => {
        const r = resolveFieldReferencesDetailed("{{Email}}", { Email: "a@x.io" }, {
            Source: "DataSource:Customers", RowIndex: 42,
        });
        expect(r.Variables[0].Source).toBe("DataSource:Customers");
        expect(r.Variables[0].RowIndex).toBe(42);
    });

    it("never throws — returns a failure ctx for every problem", () => {
        expect(() =>
            resolveFieldReferencesDetailed("{{A}} {{B}}", { A: null } as LooseFieldRow),
        ).not.toThrow();
    });

    it("FirstFailure is the EARLIEST failing token in source order", () => {
        const r = resolveFieldReferencesDetailed("{{Ok}} {{Bad}} {{Ugly}}", {
            Ok: "ok", Bad: null,
        } as LooseFieldRow);
        expect(r.FirstFailure?.Name).toBe("Bad");
    });
});
