/**
 * Tests for input-source.ts — config storage, merge semantics, fetch
 * outcomes (success / skip / HTTP error / bad payload / timeout).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    DEFAULT_INPUT_SOURCE_CONFIG,
    clearInputSourceConfig,
    fetchInputSource,
    loadInputSourceConfig,
    mergeInputBags,
    resolveBatchInputSnapshot,
    saveInputSourceConfig,
    type InputSourceConfig,
} from "../input-source";

beforeEach(() => clearInputSourceConfig());
afterEach(() => clearInputSourceConfig());

describe("config storage", () => {
    it("returns DEFAULT_INPUT_SOURCE_CONFIG when nothing is stored", () => {
        expect(loadInputSourceConfig()).toEqual(DEFAULT_INPUT_SOURCE_CONFIG);
    });

    it("round-trips a full config", () => {
        const cfg: InputSourceConfig = {
            Enabled: true,
            Url: "https://api.test/inputs",
            Method: "POST",
            Headers: [{ Name: "X-Token", Value: "abc" }],
            RequestBody: '{"q":1}',
            OnFailure: "ContinueWithLocal",
            TimeoutMs: 4_000,
        };
        saveInputSourceConfig(cfg);
        expect(loadInputSourceConfig()).toEqual(cfg);
    });

    it("clamps timeout and normalises method/policy", () => {
        const saved = saveInputSourceConfig({
            ...DEFAULT_INPUT_SOURCE_CONFIG,
            TimeoutMs: 999_999,
            Method: "PATCH" as never,
            OnFailure: "Whatever" as never,
        });
        expect(saved.TimeoutMs).toBe(60_000);
        expect(saved.Method).toBe("GET");
        expect(saved.OnFailure).toBe("Abort");
    });

    it("recovers from corrupt JSON in localStorage", () => {
        localStorage.setItem("marco.input-source.config.v1", "{not json");
        expect(loadInputSourceConfig()).toEqual(DEFAULT_INPUT_SOURCE_CONFIG);
    });
});

describe("mergeInputBags", () => {
    it("returns an empty object when both sides are null", () => {
        expect(mergeInputBags(null, null)).toEqual({});
    });

    it("preserves the local bag when no incoming", () => {
        expect(mergeInputBags({ Email: "a@b" }, null)).toEqual({ Email: "a@b" });
    });

    it("incoming wins on key collision", () => {
        const merged = mergeInputBags(
            { Email: "old@b", Name: "Local" },
            { Email: "new@b" },
        );
        expect(merged).toEqual({ Email: "new@b", Name: "Local" });
    });

    it("does not mutate either input", () => {
        const local = { A: 1 };
        const incoming = { B: 2 };
        mergeInputBags(local, incoming);
        expect(local).toEqual({ A: 1 });
        expect(incoming).toEqual({ B: 2 });
    });
});

describe("fetchInputSource — skip paths", () => {
    it("skips when disabled", async () => {
        const r = await fetchInputSource({
            config: { ...DEFAULT_INPUT_SOURCE_CONFIG, Url: "https://x" },
        });
        expect(r.Ok).toBe(true);
        if (r.Ok) {
            expect(r.Skipped).toBe(true);
            if (r.Skipped) expect(r.SkipReason).toBe("Input source disabled");
        }
    });

    it("skips when URL is empty", async () => {
        const r = await fetchInputSource({
            config: { ...DEFAULT_INPUT_SOURCE_CONFIG, Enabled: true, Url: "" },
        });
        expect(r.Ok && r.Skipped).toBe(true);
    });
});

describe("fetchInputSource — network paths", () => {
    const cfg: InputSourceConfig = {
        Enabled: true,
        Url: "https://api.test/inputs",
        Method: "GET",
        Headers: [{ Name: "X-Token", Value: "abc" }],
        RequestBody: "",
        OnFailure: "Abort",
        TimeoutMs: 2_000,
    };

    it("returns the bag on success", async () => {
        const fetchImpl = vi.fn(async () =>
            new Response(JSON.stringify({ Email: "fresh@b", Order: 7 }), { status: 200 }),
        );
        const r = await fetchInputSource({ config: cfg, fetchImpl });
        expect(r.Ok).toBe(true);
        if (r.Ok && !r.Skipped) {
            expect(r.Bag).toEqual({ Email: "fresh@b", Order: 7 });
            expect(r.Status).toBe(200);
        }
        // headers were forwarded
        const init = fetchImpl.mock.calls[0][1] as RequestInit;
        const headers = init.headers as Record<string, string>;
        expect(headers["X-Token"]).toBe("abc");
    });

    it("POSTs the request body and adds Content-Type when missing", async () => {
        const fetchImpl = vi.fn(async () =>
            new Response(JSON.stringify({ A: 1 }), { status: 200 }),
        );
        await fetchInputSource({
            config: { ...cfg, Method: "POST", RequestBody: '{"q":1}' },
            fetchImpl,
        });
        const init = fetchImpl.mock.calls[0][1] as RequestInit;
        expect(init.method).toBe("POST");
        expect(init.body).toBe('{"q":1}');
        expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    });

    it("rejects non-object JSON responses", async () => {
        const fetchImpl = vi.fn(async () =>
            new Response("[1,2,3]", { status: 200 }),
        );
        const r = await fetchInputSource({ config: cfg, fetchImpl });
        expect(r.Ok).toBe(false);
        if (!r.Ok) expect(r.Error).toContain("Expected a JSON object");
    });

    it("rejects malformed JSON responses", async () => {
        const fetchImpl = vi.fn(async () =>
            new Response("{not json", { status: 200 }),
        );
        const r = await fetchInputSource({ config: cfg, fetchImpl });
        expect(r.Ok).toBe(false);
        if (!r.Ok) expect(r.Error).toContain("not valid JSON");
    });

    it("returns Ok=false on HTTP error and propagates Continue flag", async () => {
        const fetchImpl = vi.fn(async () =>
            new Response("nope", { status: 500, statusText: "Server Error" }),
        );
        const r = await fetchInputSource({
            config: { ...cfg, OnFailure: "ContinueWithLocal" },
            fetchImpl,
        });
        expect(r.Ok).toBe(false);
        if (!r.Ok) {
            expect(r.Status).toBe(500);
            expect(r.Continue).toBe(true);
        }
    });

    it("treats AbortError as a timeout", async () => {
        const fetchImpl = vi.fn(async () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            throw err;
        });
        const r = await fetchInputSource({
            config: { ...cfg, TimeoutMs: 1_500 },
            fetchImpl,
        });
        expect(r.Ok).toBe(false);
        if (!r.Ok) expect(r.Error).toContain("timed out after 1500");
    });
});

describe("resolveBatchInputSnapshot", () => {
    it("exposes the bag when fetch succeeds", async () => {
        const fetchImpl = vi.fn(async () =>
            new Response(JSON.stringify({ Email: "x@y" }), { status: 200 }),
        );
        const snap = await resolveBatchInputSnapshot({
            config: {
                Enabled: true,
                Url: "https://x",
                Method: "GET",
                Headers: [],
                RequestBody: "",
                OnFailure: "Abort",
                TimeoutMs: 2_000,
            },
            fetchImpl,
        });
        expect(snap.Bag).toEqual({ Email: "x@y" });
    });

    it("returns Bag=null when skipped", async () => {
        const snap = await resolveBatchInputSnapshot({
            config: DEFAULT_INPUT_SOURCE_CONFIG,
        });
        expect(snap.Bag).toBeNull();
        expect(snap.Result.Ok && snap.Result.Skipped).toBe(true);
    });

    it("returns Bag=null when fetch failed", async () => {
        const fetchImpl = vi.fn(async () => { throw new Error("down"); });
        const snap = await resolveBatchInputSnapshot({
            config: {
                Enabled: true,
                Url: "https://x",
                Method: "GET",
                Headers: [],
                RequestBody: "",
                OnFailure: "Abort",
                TimeoutMs: 1_000,
            },
            fetchImpl,
        });
        expect(snap.Bag).toBeNull();
        expect(snap.Result.Ok).toBe(false);
    });
});
