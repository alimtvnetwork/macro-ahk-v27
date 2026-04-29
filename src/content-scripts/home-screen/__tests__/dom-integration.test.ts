/**
 * DOM-integration tests for the home-screen UI mounters.
 * Validates idempotent upsert + mount/unmount cycles in jsdom.
 *
 * Strategy: stub the homepage-dashboard-variables resolver layer so tests
 * don't depend on the live Lovable dashboard XPaths. Each test wires a
 * minimal DOM and asserts the mounter's contract.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../homepage-dashboard-variables", async () => {
    const actual = await vi.importActual<typeof import("../homepage-dashboard-variables")>(
        "../homepage-dashboard-variables",
    );
    return {
        ...actual,
        // Resolve any XPath by reading data-test-xpath attrs we set on fixtures.
        resolveElement: vi.fn((xpath: string) =>
            document.querySelector(`[data-test-xpath="${xpath}"]`),
        ),
        clickWorkspaceByXPath: vi.fn(),
    };
});

import { mountSearchBar } from "../search-bar";
import { mountNavControls } from "../nav-controls";
import { appendCreditToProLabel, appendCreditsForAll } from "../credit-append";
import { HomepageDashboardVariables, clickWorkspaceByXPath } from "../homepage-dashboard-variables";
import type { WorkspaceDictionary, WorkspaceRecord } from "../types";

function rec(index: number, name: string, isSelected = false, available = 0, total = 0): WorkspaceRecord {
    return {
        index, name,
        fullXPath: `/x/${index}`,
        proLabelXPath: `/x/${index}/pro`,
        isSelected,
        creditAvailable: available,
        creditTotal: total,
    };
}

function dictOf(records: WorkspaceRecord[]): WorkspaceDictionary {
    const byName = Object.fromEntries(records.map((r) => [r.name, r]));
    const selectedIndex = records.findIndex((r) => r.isSelected);
    return { byIndex: records, byName, selectedIndex: selectedIndex === -1 ? null : selectedIndex };
}

beforeEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
});

afterEach(() => {
    document.body.innerHTML = "";
});

describe("appendCreditToProLabel — idempotent upsert", () => {
    it("appends a credit span on first call", () => {
        const pro = document.createElement("span");
        pro.textContent = "Pro";
        pro.setAttribute("data-test-xpath", "/x/1/pro");
        document.body.appendChild(pro);

        appendCreditToProLabel(rec(1, "Alpha", false, 12, 30));

        const spans = pro.querySelectorAll('[data-marco-home="credit-append"]');
        expect(spans).toHaveLength(1);
        expect(spans[0].textContent).toBe("12 / 30");
    });

    it("updates the existing span instead of duplicating on second call", () => {
        const pro = document.createElement("span");
        pro.setAttribute("data-test-xpath", "/x/2/pro");
        document.body.appendChild(pro);

        appendCreditToProLabel(rec(2, "Beta", false, 5, 10));
        appendCreditToProLabel(rec(2, "Beta", false, 7, 10));
        appendCreditToProLabel(rec(2, "Beta", false, 9, 10));

        const spans = pro.querySelectorAll('[data-marco-home="credit-append"]');
        expect(spans).toHaveLength(1);
        expect(spans[0].textContent).toBe("9 / 10");
    });

    it("no-ops gracefully when pro label is missing (no throw)", () => {
        expect(() => appendCreditToProLabel(rec(99, "Ghost", false, 1, 1))).not.toThrow();
    });

    it("appendCreditsForAll handles a mix of present and missing labels", () => {
        const pro = document.createElement("span");
        pro.setAttribute("data-test-xpath", "/x/1/pro");
        document.body.appendChild(pro);

        appendCreditsForAll([rec(1, "Alpha", false, 3, 8), rec(2, "Missing", false, 1, 2)]);

        expect(pro.querySelectorAll('[data-marco-home="credit-append"]')).toHaveLength(1);
        expect(pro.textContent).toContain("3 / 8");
    });
});

describe("mountSearchBar — DOM lifecycle", () => {
    function setupAnchor(): HTMLElement {
        const anchor = document.createElement("div");
        anchor.setAttribute("data-test-xpath", HomepageDashboardVariables.AllWorkspaceName.full);
        document.body.appendChild(anchor);
        return anchor;
    }

    it("inserts the search wrapper after the anchor", () => {
        setupAnchor();
        const teardown = mountSearchBar(() => dictOf([rec(1, "Alpha")]));

        const wrapper = document.querySelector('[data-marco-home="search-wrapper"]');
        const input = document.querySelector('[data-marco-home="search-input"]');
        expect(wrapper).not.toBeNull();
        expect(input).not.toBeNull();
        expect(input?.tagName).toBe("INPUT");

        teardown();
        expect(document.querySelector('[data-marco-home="search-wrapper"]')).toBeNull();
    });

    it("returns a no-op teardown when anchor is missing", () => {
        const teardown = mountSearchBar(() => dictOf([rec(1, "Alpha")]));
        expect(typeof teardown).toBe("function");
        expect(() => teardown()).not.toThrow();
    });

    it("Enter key triggers click on the top match", async () => {
        setupAnchor();
        const dict = dictOf([rec(1, "Alpha"), rec(2, "Beta"), rec(3, "alphabet")]);
        mountSearchBar(() => dict);

        const input = document.querySelector<HTMLInputElement>('[data-marco-home="search-input"]')!;
        input.value = "alpha";
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

        expect(clickWorkspaceByXPath).toHaveBeenCalledWith("/x/1");
    });
});

describe("mountNavControls — DOM lifecycle", () => {
    function setupAnchor(): HTMLElement {
        const anchor = document.createElement("div");
        anchor.setAttribute("data-test-xpath", HomepageDashboardVariables.LifetimeDeal.full);
        document.body.appendChild(anchor);
        return anchor;
    }

    it("inserts up/down/step controls after the anchor", () => {
        setupAnchor();
        const teardown = mountNavControls(() => dictOf([rec(1, "A", true), rec(2, "B")]));

        expect(document.querySelector('[data-marco-home="nav-up"]')).not.toBeNull();
        expect(document.querySelector('[data-marco-home="nav-down"]')).not.toBeNull();
        expect(document.querySelector('[data-marco-home="nav-step"]')).not.toBeNull();

        teardown();
        expect(document.querySelector('[data-marco-home="nav-up"]')).toBeNull();
    });

    it("Down click jumps to the next workspace by step count", () => {
        setupAnchor();
        const dict = dictOf([rec(1, "A", true), rec(2, "B"), rec(3, "C"), rec(4, "D"), rec(5, "E")]);
        mountNavControls(() => dict);

        const stepInput = document.querySelector<HTMLInputElement>('[data-marco-home="nav-step"]')!;
        stepInput.value = "2";
        document.querySelector<HTMLElement>('[data-marco-home="nav-down"]')!.click();

        expect(clickWorkspaceByXPath).toHaveBeenCalledWith("/x/3");
    });

    it("Up click clamps at index 1 when step exceeds current position", () => {
        setupAnchor();
        const dict = dictOf([rec(1, "A"), rec(2, "B", true), rec(3, "C")]);
        mountNavControls(() => dict);

        const stepInput = document.querySelector<HTMLInputElement>('[data-marco-home="nav-step"]')!;
        stepInput.value = "10";
        document.querySelector<HTMLElement>('[data-marco-home="nav-up"]')!.click();

        expect(clickWorkspaceByXPath).toHaveBeenCalledWith("/x/1");
    });

    it("returns a no-op teardown when anchor is missing", () => {
        const teardown = mountNavControls(() => dictOf([rec(1, "A")]));
        expect(typeof teardown).toBe("function");
        expect(() => teardown()).not.toThrow();
    });
});
