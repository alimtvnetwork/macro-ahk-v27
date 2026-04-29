/**
 * Verifies the runtime verbose logging toggle round-trips through the
 * settings handler and hydrates the in-memory `verbose-logging` store
 * (the single read path used by the recorder failure logger).
 *
 * Conformance: `mem://standards/verbose-logging-and-failure-diagnostics`.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    _resetVerboseLoggingStore,
    resolveVerboseLogging,
} from "../../recorder/verbose-logging";
import {
    handleGetSettings,
    handleSaveSettings,
    type ExtensionSettings,
} from "../settings-handler";

interface ChromeStorageStub {
    storage: {
        local: {
            get: (k: string) => Promise<Record<string, unknown>>;
            set: (v: Record<string, unknown>) => Promise<void>;
        };
    };
}

declare global {
    var chrome: ChromeStorageStub;
}

function installChromeStorageStub(): Map<string, unknown> {
    const store = new Map<string, unknown>();
    globalThis.chrome = {
        storage: {
            local: {
                get: async (key: string) => {
                    const v = store.get(key);
                    return v === undefined ? {} : { [key]: v };
                },
                set: async (entries: Record<string, unknown>) => {
                    for (const [k, v] of Object.entries(entries)) {
                        store.set(k, v);
                    }
                },
            },
        },
    };
    return store;
}

beforeEach(() => {
    _resetVerboseLoggingStore();
    installChromeStorageStub();
    vi.restoreAllMocks();
});

describe("settings-handler verbose logging toggle", () => {
    it("defaults verboseLogging to false on first load and leaves the store off", async () => {
        const result = await handleGetSettings();
        expect(result.settings.verboseLogging).toBe(false);
        expect(resolveVerboseLogging(null)).toBe(false);
    });

    it("hydrates the in-memory store after SAVE_SETTINGS with verboseLogging=true", async () => {
        const partial: Partial<ExtensionSettings> = { verboseLogging: true };
        await handleSaveSettings({ type: "SAVE_SETTINGS", settings: partial } as never);
        expect(resolveVerboseLogging(null)).toBe(true);
        // Any project id falls back to the global slot when not explicitly set.
        expect(resolveVerboseLogging("any-project")).toBe(false);
    });

    it("turns the store back off when the user toggles verboseLogging=false", async () => {
        await handleSaveSettings({ type: "SAVE_SETTINGS", settings: { verboseLogging: true } } as never);
        expect(resolveVerboseLogging(null)).toBe(true);
        await handleSaveSettings({ type: "SAVE_SETTINGS", settings: { verboseLogging: false } } as never);
        expect(resolveVerboseLogging(null)).toBe(false);
    });

    it("rehydrates the store from chrome.storage on GET_SETTINGS after a cold start", async () => {
        // Simulate a previous session that persisted verboseLogging=true.
        await handleSaveSettings({ type: "SAVE_SETTINGS", settings: { verboseLogging: true } } as never);
        // Cold start: in-memory store cleared, but chrome.storage retains the value.
        _resetVerboseLoggingStore();
        expect(resolveVerboseLogging(null)).toBe(false);
        const result = await handleGetSettings();
        expect(result.settings.verboseLogging).toBe(true);
        expect(resolveVerboseLogging(null)).toBe(true);
    });

    it("persists verboseLogging without clobbering unrelated settings", async () => {
        await handleSaveSettings({ type: "SAVE_SETTINGS", settings: { maxCycleCount: 250 } } as never);
        await handleSaveSettings({ type: "SAVE_SETTINGS", settings: { verboseLogging: true } } as never);
        const result = await handleGetSettings();
        expect(result.settings.maxCycleCount).toBe(250);
        expect(result.settings.verboseLogging).toBe(true);
    });
});
