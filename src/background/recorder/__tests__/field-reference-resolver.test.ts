/**
 * Phase 08 — Field Reference Resolver unit tests.
 *
 * Pure resolver — no DOM, no SQLite, no chrome.
 */

import { describe, it, expect } from "vitest";
import {
    resolveFieldReferences,
    extractReferencedColumns,
} from "../field-reference-resolver";

describe("resolveFieldReferences", () => {
    it("substitutes a single token", () => {
        const out = resolveFieldReferences("Hello {{Name}}!", { Name: "Alice" });
        expect(out).toBe("Hello Alice!");
    });

    it("substitutes multiple tokens including repeats", () => {
        const out = resolveFieldReferences(
            "{{Greeting}} {{Name}} — see you {{Greeting}}",
            { Greeting: "Hi", Name: "Bob" },
        );
        expect(out).toBe("Hi Bob — see you Hi");
    });

    it("tolerates whitespace inside braces", () => {
        const out = resolveFieldReferences("{{  Email   }}", { Email: "a@x.io" });
        expect(out).toBe("a@x.io");
    });

    it("emits literal {{Foo}} when token is escaped with backslash", () => {
        const out = resolveFieldReferences("\\{{NotAToken}} {{Real}}", {
            Real: "yes",
        });
        expect(out).toBe("{{NotAToken}} yes");
    });

    it("throws when a referenced column is missing", () => {
        expect(() =>
            resolveFieldReferences("{{Missing}}", { Other: "x" }),
        ).toThrow(/column missing/);
    });

    it("returns the template unchanged when no tokens are present", () => {
        expect(resolveFieldReferences("plain text", {})).toBe("plain text");
    });

    it("is deterministic — same inputs ⇒ identical output", () => {
        const a = resolveFieldReferences("{{X}}/{{Y}}", { X: "1", Y: "2" });
        const b = resolveFieldReferences("{{X}}/{{Y}}", { X: "1", Y: "2" });
        expect(a).toBe(b);
    });
});

describe("extractReferencedColumns", () => {
    it("returns each distinct token name once, in first-seen order", () => {
        const cols = extractReferencedColumns(
            "{{Email}} / {{Name}} / {{Email}} / {{Phone}}",
        );
        expect(cols).toEqual(["Email", "Name", "Phone"]);
    });

    it("ignores escaped tokens", () => {
        const cols = extractReferencedColumns("\\{{Skip}} and {{Use}}");
        expect(cols).toEqual(["Use"]);
    });

    it("returns an empty array when no tokens are present", () => {
        expect(extractReferencedColumns("nothing here")).toEqual([]);
    });
});
