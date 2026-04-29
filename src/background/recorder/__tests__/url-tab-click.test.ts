/**
 * Tests — UrlTabClick step (Spec 19 §1, AC-19.1.1 … AC-19.1.10)
 */

import { describe, it, expect } from "vitest";

import {
    compileUrlPattern,
    deriveGlobPattern,
    executeUrlTabClick,
    shouldRecordAsUrlTabClick,
    validateUrlTabClickParams,
    type TabRef,
    type TabsAdapter,
    type UrlTabClickParams,
} from "../url-tab-click";

/* ------------------------------------------------------------------ */
/*  Test adapter                                                       */
/* ------------------------------------------------------------------ */

interface AdapterInit {
    readonly Tabs?: ReadonlyArray<TabRef>;
    readonly OpenedTab?: TabRef | null;
    readonly SettleTab?: TabRef | null;
    readonly DispatchThrows?: string;
}

function makeAdapter(init: AdapterInit = {}): TabsAdapter & {
    readonly Calls: {
        focus: number[];
        created: string[];
        dispatched: Array<{ sel: string; kind: string }>;
    };
} {
    const calls = {
        focus: [] as number[],
        created: [] as string[],
        dispatched: [] as Array<{ sel: string; kind: string }>,
    };
    const tabs = init.Tabs ?? [];
    const adapter: TabsAdapter = {
        async listTabs() {
            return tabs;
        },
        async focusTab(id) {
            calls.focus.push(id);
        },
        async createTab(url) {
            calls.created.push(url);
            const ref: TabRef = { Id: 999, Url: url };
            return init.OpenedTab ?? ref;
        },
        async dispatchClick(sel, kind) {
            calls.dispatched.push({ sel, kind });
            if (init.DispatchThrows !== undefined) {
                throw new Error(init.DispatchThrows);
            }
            return init.OpenedTab ?? { Id: 777, Url: "about:blank" };
        },
        async waitForMatchingTab(predicate) {
            const candidate = init.SettleTab;
            if (candidate !== undefined && candidate !== null && predicate(candidate.Url)) {
                return candidate;
            }
            return null;
        },
    };
    return Object.assign(adapter, { Calls: calls });
}

/* ------------------------------------------------------------------ */
/*  Pattern compilation                                                */
/* ------------------------------------------------------------------ */

describe("compileUrlPattern", () => {
    it("Exact: trailing slash insensitive (case-sensitive path)", () => {
        const c = compileUrlPattern("https://app.example.com/orders/", "Exact");
        expect(c.Ok).toBe(true);
        if (!c.Ok) return;
        expect(c.Test("https://app.example.com/orders")).toBe(true);
        expect(c.Test("https://app.example.com/Orders")).toBe(false);
    });

    it("Exact: scheme + host case-insensitive (AC-19.1.9)", () => {
        const c = compileUrlPattern("HTTPS://APP.EXAMPLE.COM/orders", "Exact");
        expect(c.Ok).toBe(true);
        if (!c.Ok) return;
        expect(c.Test("https://app.example.com/orders")).toBe(true);
        expect(c.Test("https://app.example.com/ORDERS")).toBe(false);
    });

    it("Prefix matches startsWith with case-folded host", () => {
        const c = compileUrlPattern("https://APP.example.com/orders/", "Prefix");
        expect(c.Ok).toBe(true);
        if (!c.Ok) return;
        expect(c.Test("https://app.example.com/orders/123")).toBe(true);
        expect(c.Test("https://app.example.com/billing")).toBe(false);
    });

    it("Glob: * is non-slash, ** is any", () => {
        const c = compileUrlPattern("https://app.example.com/orders/*/edit", "Glob");
        expect(c.Ok).toBe(true);
        if (!c.Ok) return;
        expect(c.Test("https://app.example.com/orders/42/edit")).toBe(true);
        expect(c.Test("https://app.example.com/orders/42/sub/edit")).toBe(false);
        const cc = compileUrlPattern("https://app.example.com/**/edit", "Glob");
        if (!cc.Ok) throw new Error("compile failed");
        expect(cc.Test("https://app.example.com/orders/42/sub/edit")).toBe(true);
    });

    it("Regex: invalid pattern fails compile (AC-19.1.7)", () => {
        const c = compileUrlPattern("(unclosed", "Regex");
        expect(c.Ok).toBe(false);
        if (c.Ok) return;
        expect(c.Detail.length).toBeGreaterThan(0);
    });

    it("Regex: valid pattern matches", () => {
        const c = compileUrlPattern("^https://app\\.example\\.com/orders/\\d+$", "Regex");
        if (!c.Ok) throw new Error("compile failed");
        expect(c.Test("https://app.example.com/orders/42")).toBe(true);
        expect(c.Test("https://app.example.com/orders/abc")).toBe(false);
    });
});

/* ------------------------------------------------------------------ */
/*  validateUrlTabClickParams                                          */
/* ------------------------------------------------------------------ */

describe("validateUrlTabClickParams", () => {
    it("rejects DirectOpen=true with empty Url (AC-19.1.6)", () => {
        const err = validateUrlTabClickParams({
            UrlPattern: "https://x/*",
            UrlMatch: "Glob",
            Mode: "OpenNew",
            DirectOpen: true,
            Url: "",
        });
        expect(err?.Reason).toBe("InvalidUrlPattern");
    });

    it("rejects invalid Regex pattern at save (AC-19.1.7)", () => {
        const err = validateUrlTabClickParams({
            UrlPattern: "(unclosed",
            UrlMatch: "Regex",
            Mode: "OpenNew",
            DirectOpen: true,
            Url: "https://x",
        });
        expect(err?.Reason).toBe("InvalidUrlPattern");
    });

    it("rejects DirectOpen with non-OpenNew mode", () => {
        const err = validateUrlTabClickParams({
            UrlPattern: "https://x",
            UrlMatch: "Exact",
            Mode: "FocusExisting",
            DirectOpen: true,
            Url: "https://x",
        });
        expect(err?.Reason).toBe("BadParams");
    });

    it("accepts a well-formed FocusExisting params", () => {
        const err = validateUrlTabClickParams({
            UrlPattern: "https://app/*",
            UrlMatch: "Glob",
            Mode: "FocusExisting",
        });
        expect(err).toBeNull();
    });
});

/* ------------------------------------------------------------------ */
/*  Capture-time detection                                             */
/* ------------------------------------------------------------------ */

describe("shouldRecordAsUrlTabClick", () => {
    it("AC-19.1.1: <a target=_blank> is captured as UrlTabClick", () => {
        expect(
            shouldRecordAsUrlTabClick({
                Tag: "a",
                Target: "_blank",
                Href: "https://other/x",
                LocationOrigin: "https://app.example.com",
                WindowOpenCalled: false,
            }),
        ).toBe(true);
    });

    it("cross-origin <a> is captured as UrlTabClick", () => {
        expect(
            shouldRecordAsUrlTabClick({
                Tag: "a",
                Href: "https://billing.other.com/x",
                LocationOrigin: "https://app.example.com",
                WindowOpenCalled: false,
            }),
        ).toBe(true);
    });

    it("AC-19.1.2: window.open(url) is captured as UrlTabClick", () => {
        expect(
            shouldRecordAsUrlTabClick({
                Tag: "button",
                LocationOrigin: "https://app.example.com",
                WindowOpenCalled: true,
            }),
        ).toBe(true);
    });

    it("plain in-origin click is NOT captured as UrlTabClick", () => {
        expect(
            shouldRecordAsUrlTabClick({
                Tag: "a",
                Href: "https://app.example.com/orders",
                LocationOrigin: "https://app.example.com",
                WindowOpenCalled: false,
            }),
        ).toBe(false);
    });
});

describe("deriveGlobPattern", () => {
    it("collapses numeric and uuid path segments to *", () => {
        expect(
            deriveGlobPattern(
                "https://app.example.com/orders/42/items/3f5b1e62-4a6e-4f1f-9c0e-1234567890ab/edit?ref=1",
            ),
        ).toBe("https://app.example.com/orders/*/items/*/edit");
    });
});

/* ------------------------------------------------------------------ */
/*  executeUrlTabClick — mode resolution                                */
/* ------------------------------------------------------------------ */

const baseParams: UrlTabClickParams = {
    UrlPattern: "https://app.example.com/orders/*",
    UrlMatch: "Glob",
    Mode: "FocusExisting",
    TimeoutMs: 1000,
};

describe("executeUrlTabClick — FocusExisting", () => {
    it("AC-19.1.3: focuses an existing matching tab without creating a new one", async () => {
        const adapter = makeAdapter({
            Tabs: [
                { Id: 1, Url: "https://app.example.com/billing" },
                { Id: 2, Url: "https://app.example.com/orders/42" },
            ],
        });
        const res = await executeUrlTabClick({ Params: baseParams, Tabs: adapter });
        expect(res.Reason).toBe("Ok");
        expect(res.ResolvedTabId).toBe(2);
        expect(res.OpenedNewTab).toBe(false);
        expect(adapter.Calls.focus).toEqual([2]);
        expect(adapter.Calls.created).toEqual([]);
    });

    it("AC-19.1.4: fails with TabNotFound when no matching tab exists", async () => {
        const adapter = makeAdapter({ Tabs: [{ Id: 1, Url: "https://app.example.com/billing" }] });
        const res = await executeUrlTabClick({ Params: baseParams, Tabs: adapter });
        expect(res.Reason).toBe("TabNotFound");
        expect(adapter.Calls.created).toEqual([]);
    });
});

describe("executeUrlTabClick — OpenOrFocus", () => {
    it("AC-19.1.5: opens new when no match (via selector dispatch)", async () => {
        const adapter = makeAdapter({
            Tabs: [],
            OpenedTab: { Id: 50, Url: "https://app.example.com/orders/99" },
        });
        const res = await executeUrlTabClick({
            Params: { ...baseParams, Mode: "OpenOrFocus", Selector: "#open" },
            Tabs: adapter,
        });
        expect(res.Reason).toBe("Ok");
        expect(res.OpenedNewTab).toBe(true);
        expect(adapter.Calls.dispatched).toEqual([{ sel: "#open", kind: "Css" }]);
    });

    it("AC-19.1.5: focuses when one matches", async () => {
        const adapter = makeAdapter({
            Tabs: [{ Id: 7, Url: "https://app.example.com/orders/12" }],
        });
        const res = await executeUrlTabClick({
            Params: { ...baseParams, Mode: "OpenOrFocus" },
            Tabs: adapter,
        });
        expect(res.Reason).toBe("Ok");
        expect(res.OpenedNewTab).toBe(false);
        expect(adapter.Calls.focus).toEqual([7]);
        expect(adapter.Calls.created).toEqual([]);
    });
});

describe("executeUrlTabClick — OpenNew", () => {
    it("AC-19.1.10: rebinds resolved tab via ResolvedTabId on success", async () => {
        const adapter = makeAdapter({
            OpenedTab: { Id: 123, Url: "https://app.example.com/orders/55" },
        });
        const res = await executeUrlTabClick({
            Params: {
                ...baseParams,
                Mode: "OpenNew",
                DirectOpen: true,
                Url: "https://app.example.com/orders/55",
            },
            Tabs: adapter,
        });
        expect(res.Reason).toBe("Ok");
        expect(res.ResolvedTabId).toBe(123);
        expect(res.OpenedNewTab).toBe(true);
    });

    it("AC-19.1.8: tab opened but URL never matches → UrlPatternMismatch", async () => {
        const adapter = makeAdapter({
            OpenedTab: { Id: 5, Url: "https://app.example.com/login" },
            SettleTab: null,
        });
        const res = await executeUrlTabClick({
            Params: {
                ...baseParams,
                Mode: "OpenNew",
                DirectOpen: true,
                Url: "https://app.example.com/orders/55",
            },
            Tabs: adapter,
        });
        expect(res.Reason).toBe("UrlPatternMismatch");
        expect(res.Detail).toContain("observed=https://app.example.com/login");
        expect(res.Detail).toContain("pattern=https://app.example.com/orders/*");
    });

    it("dispatched click failure surfaces as SelectorNotFound", async () => {
        const adapter = makeAdapter({ DispatchThrows: "no element" });
        const res = await executeUrlTabClick({
            Params: {
                ...baseParams,
                Mode: "OpenNew",
                Selector: "#go",
            },
            Tabs: adapter,
        });
        expect(res.Reason).toBe("SelectorNotFound");
        expect(res.Detail).toBe("no element");
    });

    it("AC-19.1.6: DirectOpen with empty Url short-circuits to InvalidUrlPattern", async () => {
        const adapter = makeAdapter();
        const res = await executeUrlTabClick({
            Params: {
                ...baseParams,
                Mode: "OpenNew",
                DirectOpen: true,
                Url: "",
            },
            Tabs: adapter,
        });
        expect(res.Reason).toBe("InvalidUrlPattern");
        expect(adapter.Calls.created).toEqual([]);
    });
});
