/**
 * Marco Extension — SDK Self-Test Handler Regression Tests
 *
 * Covers `src/background/handlers/sdk-selftest-handler.ts`:
 *   - SDK_SELFTEST_REPORT writes a row, overwrites on second report,
 *     and rejects unknown surfaces with a clean { isOk:false } envelope.
 *   - GET_SDK_SELFTEST returns the same shape regardless of how many
 *     reports have landed (null rows for surfaces that never reported).
 *   - Persistence round-trips through chrome.storage.local — covered by
 *     an in-memory stub installed on globalThis.chrome.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

import {
    handleGetSdkSelfTest,
    handleSdkSelfTestReport,
    __resetSdkSelfTestForTests,
} from "@/background/handlers/sdk-selftest-handler";
import { MessageType, type MessageRequest } from "@/shared/messages";

/* ------------------------------------------------------------------ */
/*  In-memory chrome.storage.local stub                                */
/* ------------------------------------------------------------------ */

interface ChromeStubGlobal {
    chrome?: {
        storage: {
            local: {
                get: (key: string) => Promise<Record<string, unknown>>;
                set: (entries: Record<string, unknown>) => Promise<void>;
                remove: (key: string) => Promise<void>;
            };
        };
    };
}

function installStorageStub(): Map<string, unknown> {
    const store = new Map<string, unknown>();
    const g = globalThis as ChromeStubGlobal;
    g.chrome = {
        storage: {
            local: {
                get: vi.fn(async (key: string) => {
                    return store.has(key) ? { [key]: store.get(key) } : {};
                }),
                set: vi.fn(async (entries: Record<string, unknown>) => {
                    for (const [k, v] of Object.entries(entries)) {
                        store.set(k, v);
                    }
                }),
                remove: vi.fn(async (key: string) => {
                    store.delete(key);
                }),
            },
        },
    };
    return store;
}

function makeReport(
    surface: string,
    pass: boolean,
    failures: string[] = [],
    version = "2.169.0",
): MessageRequest {
    return {
        type: MessageType.SDK_SELFTEST_REPORT,
        surface,
        pass,
        failures,
        version,
    } as unknown as MessageRequest;
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("sdk-selftest-handler — write + read", () => {
    beforeEach(async () => {
        installStorageStub();
        await __resetSdkSelfTestForTests();
    });

    it("returns an empty snapshot before any reports land", async () => {
        const res = await handleGetSdkSelfTest();
        expect(res.snapshot).toEqual({
            sync: null,
            kv: null,
            files: null,
            gkv: null,
            updatedAt: null,
        });
    });

    it("persists a single PASS row and surfaces it via GET", async () => {
        const writeRes = await handleSdkSelfTestReport(makeReport("kv", true));
        expect(writeRes).toEqual({ isOk: true });

        const { snapshot } = await handleGetSdkSelfTest();
        expect(snapshot.kv).not.toBeNull();
        expect(snapshot.kv!.surface).toBe("kv");
        expect(snapshot.kv!.pass).toBe(true);
        expect(snapshot.kv!.failures).toEqual([]);
        expect(snapshot.kv!.version).toBe("2.169.0");
        expect(typeof snapshot.kv!.at).toBe("string");
        expect(snapshot.kv!.at.length).toBeGreaterThan(0);
        // Other surfaces still null.
        expect(snapshot.sync).toBeNull();
        expect(snapshot.files).toBeNull();
        expect(snapshot.gkv).toBeNull();
        expect(snapshot.updatedAt).toBe(snapshot.kv!.at);
    });

    it("overwrites the same surface on a second report (no history)", async () => {
        await handleSdkSelfTestReport(makeReport("kv", true));
        const first = (await handleGetSdkSelfTest()).snapshot.kv!;

        // Force a clock tick so the ISO strings differ.
        await new Promise((r) => setTimeout(r, 5));

        await handleSdkSelfTestReport(makeReport("kv", false, ["kv.set threw: nope"]));
        const second = (await handleGetSdkSelfTest()).snapshot.kv!;

        expect(second.pass).toBe(false);
        expect(second.failures).toEqual(["kv.set threw: nope"]);
        expect(second.at >= first.at).toBe(true);
    });

    it("keeps four independent surfaces simultaneously", async () => {
        await handleSdkSelfTestReport(makeReport("sync", true));
        await handleSdkSelfTestReport(makeReport("kv", true));
        await handleSdkSelfTestReport(makeReport("files", false, ["files.list timed out"]));
        await handleSdkSelfTestReport(makeReport("gkv", true));

        const { snapshot } = await handleGetSdkSelfTest();
        expect(snapshot.sync?.pass).toBe(true);
        expect(snapshot.kv?.pass).toBe(true);
        expect(snapshot.files?.pass).toBe(false);
        expect(snapshot.files?.failures).toEqual(["files.list timed out"]);
        expect(snapshot.gkv?.pass).toBe(true);
    });

    it("rejects unknown surfaces with a clean { isOk:false } envelope", async () => {
        const res = await handleSdkSelfTestReport(makeReport("nonsense", true));
        expect(res).toEqual({
            isOk: false,
            errorMessage: expect.stringContaining("unknown surface \"nonsense\""),
        });

        // Storage must NOT have been mutated by the rejected payload.
        const { snapshot } = await handleGetSdkSelfTest();
        expect(snapshot).toEqual({
            sync: null,
            kv: null,
            files: null,
            gkv: null,
            updatedAt: null,
        });
    });

    it("coerces non-array failures and non-string version safely", async () => {
        const res = await handleSdkSelfTestReport({
            type: MessageType.SDK_SELFTEST_REPORT,
            surface: "kv",
            pass: true,
            failures: "not-an-array" as unknown as string[],
            version: 123 as unknown as string,
        } as unknown as MessageRequest);
        expect(res).toEqual({ isOk: true });

        const { snapshot } = await handleGetSdkSelfTest();
        expect(snapshot.kv?.failures).toEqual([]);
        expect(snapshot.kv?.version).toBe("");
    });
});
