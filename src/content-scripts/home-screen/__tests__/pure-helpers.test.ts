/**
 * Pure-helper unit tests for the home-screen feature.
 * No DOM, no network — covers the deterministic surface area only.
 */
import { describe, expect, it } from "vitest";
import { computeTargetIndex } from "../nav-controls";
import { onSearchInput } from "../search-bar";
import { resolveFullXPath, HomepageDashboardVariables } from "../homepage-dashboard-variables";
import { toCreditPair } from "../credit-source";
import { isHomeUrlAllowed } from "../url-guard";
import { AllowedHomeUrl } from "../allowed-home-url.enum";
import { NavDirection, type WorkspaceDictionary, type WorkspaceRecord } from "../types";

function rec(index: number, name: string, isSelected = false): WorkspaceRecord {
    return {
        index, name,
        fullXPath: `/x/${index}`,
        proLabelXPath: `/x/${index}/pro`,
        isSelected,
        creditAvailable: 0,
        creditTotal: 0,
    };
}

function dictOf(records: WorkspaceRecord[]): WorkspaceDictionary {
    const byName = Object.fromEntries(records.map((r) => [r.name, r]));
    const selectedIndex = records.findIndex((r) => r.isSelected);
    return { byIndex: records, byName, selectedIndex: selectedIndex === -1 ? null : selectedIndex };
}

describe("computeTargetIndex", () => {
    it("steps down within range", () => {
        expect(computeTargetIndex(2, 5, NavDirection.DOWN, 1)).toBe(3);
    });
    it("steps up within range", () => {
        expect(computeTargetIndex(3, 5, NavDirection.UP, 2)).toBe(1);
    });
    it("clamps to 1 when going below", () => {
        expect(computeTargetIndex(2, 5, NavDirection.UP, 10)).toBe(1);
    });
    it("clamps to total when going above", () => {
        expect(computeTargetIndex(4, 5, NavDirection.DOWN, 10)).toBe(5);
    });
});

describe("onSearchInput", () => {
    const dict = dictOf([rec(1, "Alpha"), rec(2, "Beta"), rec(3, "alphabet")]);

    it("returns all on empty needle", () => {
        expect(onSearchInput("", dict)).toHaveLength(3);
    });
    it("returns all on whitespace needle", () => {
        expect(onSearchInput("   ", dict)).toHaveLength(3);
    });
    it("filters case-insensitively", () => {
        const out = onSearchInput("alpha", dict).map((r) => r.name);
        expect(out).toEqual(["Alpha", "alphabet"]);
    });
    it("returns empty array when nothing matches", () => {
        expect(onSearchInput("zzz", dict)).toEqual([]);
    });
});

describe("resolveFullXPath", () => {
    it("returns template unchanged when no index given", () => {
        expect(resolveFullXPath("WorkspacesList")).toBe(HomepageDashboardVariables.WorkspacesList.full);
    });
    it("substitutes $ with the 1-based index", () => {
        const out = resolveFullXPath("WorkspaceItem", 7);
        expect(out).toBe(HomepageDashboardVariables.WorkspaceItem.full.replace("$", "7"));
        expect(out).not.toContain("$");
    });
});

describe("toCreditPair", () => {
    it("maps WorkspaceCredit → { available, total }", () => {
        const wc = { available: 12, totalCredits: 30 } as Parameters<typeof toCreditPair>[0];
        expect(toCreditPair(wc)).toEqual({ available: 12, total: 30 });
    });
});

describe("isHomeUrlAllowed", () => {
    it("accepts every AllowedHomeUrl value exactly", () => {
        for (const url of Object.values(AllowedHomeUrl)) {
            expect(isHomeUrlAllowed(url)).toBe(true);
        }
    });
    it("rejects near-misses", () => {
        expect(isHomeUrlAllowed("https://lovable.dev/dashboard?x=1")).toBe(false);
        expect(isHomeUrlAllowed("https://lovable.dev/projects/abc")).toBe(false);
        expect(isHomeUrlAllowed("https://lovable.dev/dashboard/")).toBe(false);
    });
});
