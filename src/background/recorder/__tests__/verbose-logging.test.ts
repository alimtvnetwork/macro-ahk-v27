/**
 * Verbose-logging store unit tests.
 *
 * The store is per-process and persistent within a single test run, so
 * each test resets state via `_resetVerboseLoggingStore`.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
    resolveVerboseLogging,
    setVerboseLogging,
    snapshotVerboseLoggingStore,
    _resetVerboseLoggingStore,
} from "../verbose-logging";

beforeEach(() => _resetVerboseLoggingStore());

describe("resolveVerboseLogging", () => {
    it("returns false for any unknown project", () => {
        expect(resolveVerboseLogging("project-a")).toBe(false);
        expect(resolveVerboseLogging(null)).toBe(false);
        expect(resolveVerboseLogging(undefined)).toBe(false);
        expect(resolveVerboseLogging("")).toBe(false);
    });

    it("returns true after the project is opted in", () => {
        setVerboseLogging("project-a", true);
        expect(resolveVerboseLogging("project-a")).toBe(true);
    });

    it("does not leak between projects", () => {
        setVerboseLogging("project-a", true);
        expect(resolveVerboseLogging("project-b")).toBe(false);
    });
});

describe("setVerboseLogging", () => {
    it("toggling off removes the entry", () => {
        setVerboseLogging("project-a", true);
        setVerboseLogging("project-a", false);
        expect(resolveVerboseLogging("project-a")).toBe(false);
        expect(snapshotVerboseLoggingStore()).toHaveLength(0);
    });

    it("is idempotent for repeated true calls", () => {
        setVerboseLogging("project-a", true);
        setVerboseLogging("project-a", true);
        const snap = snapshotVerboseLoggingStore();
        expect(snap).toHaveLength(1);
        expect(snap[0]).toEqual({ ProjectId: "project-a", Verbose: true });
    });

    it("normalizes null/undefined/empty to a single fallback bucket", () => {
        setVerboseLogging(null, true);
        expect(resolveVerboseLogging(undefined)).toBe(true);
        expect(resolveVerboseLogging("")).toBe(true);
    });
});
