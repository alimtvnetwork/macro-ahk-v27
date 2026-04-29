/**
 * Marco Extension — Keyword Event Search Filter — unit tests
 */

import { describe, it, expect } from "vitest";
import type { KeywordEvent } from "@/hooks/use-keyword-events";
import {
    filterKeywordEvents,
    tokenizeSearch,
} from "@/lib/keyword-event-search";

function ev(over: Partial<KeywordEvent>): KeywordEvent {
    return {
        Id: over.Id ?? "id",
        Keyword: over.Keyword ?? "",
        Description: over.Description ?? "",
        Steps: over.Steps ?? [],
        Enabled: over.Enabled ?? true,
        Tags: over.Tags,
        Category: over.Category,
        ...over,
    };
}

const SAMPLE: readonly KeywordEvent[] = [
    ev({ Id: "1", Keyword: "submit-form", Description: "Hits the green button" }),
    ev({ Id: "2", Keyword: "open-menu",   Description: "Opens nav drawer", Tags: ["nav", "ui"] }),
    ev({ Id: "3", Keyword: "logout",      Description: "Sign out flow",    Category: "Auth" }),
    ev({ Id: "4", Keyword: "Login",       Description: "Username + password" }),
];

describe("tokenizeSearch", () => {
    it("returns [] for empty / whitespace input", () => {
        expect(tokenizeSearch("")).toEqual([]);
        expect(tokenizeSearch("   ")).toEqual([]);
    });

    it("splits on whitespace and lowercases", () => {
        expect(tokenizeSearch("Login Form")).toEqual(["login", "form"]);
    });
});

describe("filterKeywordEvents", () => {
    it("returns the input array reference when query is empty", () => {
        expect(filterKeywordEvents(SAMPLE, "")).toBe(SAMPLE);
        expect(filterKeywordEvents(SAMPLE, "   ")).toBe(SAMPLE);
    });

    it("matches Keyword case-insensitively", () => {
        const result = filterKeywordEvents(SAMPLE, "LOGIN");
        expect(result.map(e => e.Id)).toEqual(["4"]);
    });

    it("matches Description as substring", () => {
        const result = filterKeywordEvents(SAMPLE, "drawer");
        expect(result.map(e => e.Id)).toEqual(["2"]);
    });

    it("matches Tags entries", () => {
        const result = filterKeywordEvents(SAMPLE, "ui");
        expect(result.map(e => e.Id)).toEqual(["2"]);
    });

    it("matches Category", () => {
        const result = filterKeywordEvents(SAMPLE, "auth");
        expect(result.map(e => e.Id)).toEqual(["3"]);
    });

    it("AND-s multi-token queries across fields", () => {
        // "open" matches Keyword of #2; "nav" matches Tags of #2 — both must hit.
        const result = filterKeywordEvents(SAMPLE, "open nav");
        expect(result.map(e => e.Id)).toEqual(["2"]);
        // "open" matches #2 but "auth" only matches #3 — no row satisfies both.
        expect(filterKeywordEvents(SAMPLE, "open auth")).toEqual([]);
    });

    it("returns an empty list when nothing matches", () => {
        expect(filterKeywordEvents(SAMPLE, "zzznope")).toEqual([]);
    });
});
