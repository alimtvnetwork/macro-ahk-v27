/**
 * Unit test for logging-handler.normalizeRow.
 *
 * Verifies the PascalCase → camelCase column normalization contract used to
 * bridge SQLite rows (PascalCase) to the UI (camelCase) without dropping the
 * original keys for callers that already expect PascalCase.
 */

import { describe, it, expect } from "vitest";
import { normalizeRow } from "./logging-handler";
import type { SqlRow } from "./handler-types";

describe("normalizeRow", () => {
    it("returns a Record<string, SqlValue> with camelCased keys", () => {
        const row: SqlRow = {
            Timestamp: "2026-04-27T00:00:00.000Z",
            Level: "INFO",
            Source: "background",
            StackTrace: null,
        };

        const result = normalizeRow(row);

        expect(result).toEqual({
            Timestamp: "2026-04-27T00:00:00.000Z",
            timestamp: "2026-04-27T00:00:00.000Z",
            Level: "INFO",
            level: "INFO",
            Source: "background",
            source: "background",
            StackTrace: null,
            stackTrace: null,
        });
    });

    it("only lowercases the first character (preserves rest of key)", () => {
        const row: SqlRow = { ScriptId: "abc", ProjectId: "p1", ConfigId: "c1" };
        const result = normalizeRow(row);

        expect(result.scriptId).toBe("abc");
        expect(result.projectId).toBe("p1");
        expect(result.configId).toBe("c1");
        // Originals retained
        expect(result.ScriptId).toBe("abc");
        expect(result.ProjectId).toBe("p1");
        expect(result.ConfigId).toBe("c1");
    });

    it("does not duplicate keys that are already camelCase", () => {
        const row: SqlRow = { foo: "bar" };
        const result = normalizeRow(row);

        expect(result).toEqual({ foo: "bar" });
        expect(Object.keys(result)).toHaveLength(1);
    });

    it("preserves SqlValue types (number, null, Uint8Array)", () => {
        const blob = new Uint8Array([1, 2, 3]);
        const row: SqlRow = { SessionId: 42, Detail: null, Blob: blob };
        const result = normalizeRow(row);

        expect(result.sessionId).toBe(42);
        expect(result.detail).toBeNull();
        expect(result.blob).toBe(blob);
    });

    it("returns an empty object for an empty row", () => {
        expect(normalizeRow({})).toEqual({});
    });
});
