/**
 * Tests for `group-inputs` storage + validation. Pure module — no DOM,
 * no React. We mock `localStorage` once for the file.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    clearAllGroupInputs,
    clearGroupInput,
    parseGroupInputJson,
    readAllGroupInputs,
    readGroupInput,
    writeGroupInput,
} from "../group-inputs";

class MemoryStorage implements Storage {
    private map = new Map<string, string>();
    get length(): number { return this.map.size; }
    clear(): void { this.map.clear(); }
    getItem(k: string): string | null { return this.map.get(k) ?? null; }
    key(i: number): string | null { return Array.from(this.map.keys())[i] ?? null; }
    removeItem(k: string): void { this.map.delete(k); }
    setItem(k: string, v: string): void { this.map.set(k, v); }
}

beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
        value: new MemoryStorage(),
        configurable: true,
        writable: true,
    });
});
afterEach(() => { clearAllGroupInputs(); });

describe("parseGroupInputJson", () => {
    it("accepts a plain JSON object", () => {
        const result = parseGroupInputJson('{"Email":"a@b.co","Age":42}');
        expect(result.Ok).toBe(true);
        if (result.Ok) {
            expect(result.Value).toEqual({ Email: "a@b.co", Age: 42 });
        }
    });

    it("rejects an empty string with a friendly hint", () => {
        const result = parseGroupInputJson("   ");
        expect(result.Ok).toBe(false);
        if (!result.Ok) expect(result.Reason).toMatch(/empty/i);
    });

    it("rejects arrays at the top level", () => {
        const result = parseGroupInputJson('[1,2,3]');
        expect(result.Ok).toBe(false);
        if (!result.Ok) expect(result.Reason).toMatch(/array/);
    });

    it("rejects scalars at the top level", () => {
        const result = parseGroupInputJson('"hello"');
        expect(result.Ok).toBe(false);
        if (!result.Ok) expect(result.Reason).toMatch(/string/);
    });

    it("rejects null at the top level", () => {
        const result = parseGroupInputJson('null');
        expect(result.Ok).toBe(false);
        if (!result.Ok) expect(result.Reason).toMatch(/null/);
    });

    it("surfaces a line/column hint for malformed JSON when available", () => {
        const result = parseGroupInputJson('{ "Email": }');
        expect(result.Ok).toBe(false);
        if (!result.Ok) expect(result.Reason).toMatch(/parse error/i);
    });
});

describe("group input storage", () => {
    it("round-trips a single group bag", () => {
        writeGroupInput(7, { Email: "x@y.z" });
        expect(readGroupInput(7)).toEqual({ Email: "x@y.z" });
    });

    it("returns null for an unset group", () => {
        expect(readGroupInput(999)).toBeNull();
    });

    it("overwrites without merging", () => {
        writeGroupInput(7, { A: 1, B: 2 });
        writeGroupInput(7, { B: 3 });
        expect(readGroupInput(7)).toEqual({ B: 3 });
    });

    it("keeps unrelated groups intact", () => {
        writeGroupInput(7, { A: 1 });
        writeGroupInput(8, { B: 2 });
        clearGroupInput(7);
        expect(readGroupInput(7)).toBeNull();
        expect(readGroupInput(8)).toEqual({ B: 2 });
    });

    it("readAllGroupInputs returns every entry as a Map<number, bag>", () => {
        writeGroupInput(1, { A: 1 });
        writeGroupInput(2, { B: 2 });
        const map = readAllGroupInputs();
        expect(map.size).toBe(2);
        expect(map.get(1)).toEqual({ A: 1 });
        expect(map.get(2)).toEqual({ B: 2 });
    });

    it("rejects non-positive stepGroupId on write", () => {
        expect(() => writeGroupInput(0, {})).toThrow(/positive integer/);
        expect(() => writeGroupInput(-3, {})).toThrow(/positive integer/);
    });

    it("ignores corrupted localStorage payloads", () => {
        localStorage.setItem("marco.step-library.inputs.v1", "not json");
        expect(readAllGroupInputs().size).toBe(0);
        // Subsequent writes still work.
        writeGroupInput(5, { ok: true });
        expect(readGroupInput(5)).toEqual({ ok: true });
    });
});
