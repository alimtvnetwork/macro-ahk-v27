/**
 * Marco Extension — openExtensionOptions tests
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { openExtensionOptions } from "@/lib/open-extension-options";

const realChrome = (globalThis as { chrome?: unknown }).chrome;

afterEach(() => {
    (globalThis as { chrome?: unknown }).chrome = realChrome;
    vi.restoreAllMocks();
});

describe("openExtensionOptions", () => {
    it("uses chrome.runtime.openOptionsPage when available", () => {
        const open = vi.fn();
        (globalThis as { chrome?: unknown }).chrome = {
            runtime: { id: "ext-123", openOptionsPage: open },
        };
        const ok = openExtensionOptions();
        expect(ok).toBe(true);
        expect(open).toHaveBeenCalledTimes(1);
    });

    it("falls back to tabs.create when openOptionsPage missing", () => {
        const create = vi.fn();
        (globalThis as { chrome?: unknown }).chrome = {
            runtime: { id: "ext-123", getURL: (p: string) => `chrome-extension://x/${p}` },
            tabs: { create },
        };
        const ok = openExtensionOptions();
        expect(ok).toBe(true);
        expect(create).toHaveBeenCalledWith({ url: "chrome-extension://x/src/options/options.html" });
    });

    it("falls back to window.open in preview", () => {
        (globalThis as { chrome?: unknown }).chrome = undefined;
        const open = vi.spyOn(window, "open").mockReturnValue({} as Window);
        const ok = openExtensionOptions();
        expect(ok).toBe(true);
        expect(open).toHaveBeenCalledWith("/options", "_blank", "noopener,noreferrer");
    });

    it("returns false when window.open is blocked", () => {
        (globalThis as { chrome?: unknown }).chrome = undefined;
        vi.spyOn(window, "open").mockReturnValue(null);
        expect(openExtensionOptions()).toBe(false);
    });

    it("falls back gracefully when openOptionsPage throws", () => {
        const create = vi.fn();
        (globalThis as { chrome?: unknown }).chrome = {
            runtime: {
                id: "ext-123",
                openOptionsPage: () => { throw new Error("boom"); },
                getURL: (p: string) => `chrome-extension://x/${p}`,
            },
            tabs: { create },
        };
        vi.spyOn(console, "warn").mockImplementation(() => undefined);
        const ok = openExtensionOptions();
        expect(ok).toBe(true);
        expect(create).toHaveBeenCalledTimes(1);
    });
});
