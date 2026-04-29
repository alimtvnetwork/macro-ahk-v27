/**
 * Tests for spec 17 §2 (extended data sources) and §3 (HttpRequest +
 * scheduler).
 */

/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    evaluateJsDataSource,
    fetchEndpointDataSource,
    ExtendedDataSourceKindId,
} from "../data-source-parsers";
import {
    executeHttpStep,
    interpolateTemplate,
} from "../http-request-step";
import {
    MAX_ACTIVE_TIMERS,
    MIN_INTERVAL_MS,
    startScheduler,
} from "../endpoint-scheduler";

/* ------------------------------------------------------------------ */
/*  JS data source                                                     */
/* ------------------------------------------------------------------ */

describe("evaluateJsDataSource", () => {
    it("returns parsed rows for a valid array-returning function", () => {
        const result = evaluateJsDataSource(`return [{a:1, b:'x'}, {a:2, b:'y'}];`);
        expect(result.DataSourceKindId).toBe(ExtendedDataSourceKindId.Js);
        expect(result.Columns).toEqual(["a", "b"]);
        expect(result.RowCount).toBe(2);
        expect(result.Rows?.[0]).toEqual({ a: "1", b: "x" });
    });

    it("throws JsDataSourceThrew when body throws", () => {
        expect(() => evaluateJsDataSource(`throw new Error('boom');`))
            .toThrow(/JsDataSourceThrew.*boom/);
    });

    it("throws when return value is not an array", () => {
        expect(() => evaluateJsDataSource(`return {not:'array'};`))
            .toThrow(/JsDataSourceThrew.*array/);
    });

    it("throws on empty array", () => {
        expect(() => evaluateJsDataSource(`return [];`))
            .toThrow(/empty/);
    });
});

/* ------------------------------------------------------------------ */
/*  Endpoint data source                                               */
/* ------------------------------------------------------------------ */

describe("fetchEndpointDataSource", () => {
    it("parses a 200 JSON-array response", async () => {
        const fakeFetch = vi.fn(async () =>
            new Response(JSON.stringify([{ id: 1, name: "Ada" }]), { status: 200 })) as unknown as typeof fetch;
        const result = await fetchEndpointDataSource({
            Url: "https://example.com/data",
            FetchImpl: fakeFetch,
        });
        expect(result.RowCount).toBe(1);
        expect(result.Columns).toEqual(["id", "name"]);
    });

    it("throws EndpointHttpError on 404", async () => {
        const fakeFetch = vi.fn(async () =>
            new Response("missing", { status: 404, statusText: "Not Found" })) as unknown as typeof fetch;
        await expect(fetchEndpointDataSource({
            Url: "https://example.com/data",
            FetchImpl: fakeFetch,
        })).rejects.toThrow(/EndpointHttpError.*404/);
    });

    it("throws EndpointParseError on non-array", async () => {
        const fakeFetch = vi.fn(async () =>
            new Response(JSON.stringify({ not: "array" }), { status: 200 })) as unknown as typeof fetch;
        await expect(fetchEndpointDataSource({
            Url: "https://example.com/data",
            FetchImpl: fakeFetch,
        })).rejects.toThrow(/EndpointParseError/);
    });
});

/* ------------------------------------------------------------------ */
/*  HttpRequest step                                                   */
/* ------------------------------------------------------------------ */

describe("interpolateTemplate", () => {
    it("substitutes {{Column}} tokens from row", () => {
        expect(interpolateTemplate("/users/{{id}}/{{name}}", { id: "42", name: "ada" }))
            .toBe("/users/42/ada");
    });

    it("leaves unknown columns blank", () => {
        expect(interpolateTemplate("/x/{{missing}}/y", { other: "1" }))
            .toBe("/x//y");
    });
});

describe("executeHttpStep", () => {
    it("interpolates URL placeholders and returns Ok with status", async () => {
        let capturedUrl = "";
        const fakeFetch = vi.fn(async (url: string) => {
            capturedUrl = url;
            return new Response("{}", { status: 200 });
        }) as unknown as typeof fetch;

        const result = await executeHttpStep({
            Params: { Url: "https://api/{{id}}", Method: "GET" },
            Row: { id: "7" },
            FetchImpl: fakeFetch,
        });

        expect(capturedUrl).toBe("https://api/7");
        expect(result.Reason).toBe("Ok");
        expect(result.Status).toBe(200);
    });

    it("captures parsed JSON when CaptureAs is set", async () => {
        const fakeFetch = vi.fn(async () =>
            new Response(JSON.stringify({ token: "abc" }), { status: 200 })) as unknown as typeof fetch;
        const result = await executeHttpStep({
            Params: { Url: "https://api", Method: "GET", CaptureAs: "auth" },
            Row: {},
            FetchImpl: fakeFetch,
        });
        expect(result.CapturedValue).toEqual({ token: "abc" });
    });

    it("returns EndpointHttpError on non-2xx", async () => {
        const fakeFetch = vi.fn(async () =>
            new Response("nope", { status: 500 })) as unknown as typeof fetch;
        const result = await executeHttpStep({
            Params: { Url: "https://api", Method: "POST" },
            Row: {},
            FetchImpl: fakeFetch,
        });
        expect(result.Reason).toBe("EndpointHttpError");
        expect(result.Status).toBe(500);
        expect(result.ResponseSnippet).toContain("nope");
    });

    it("returns BadParams on malformed HeadersJson", async () => {
        const result = await executeHttpStep({
            Params: { Url: "https://api", Method: "GET", HeadersJson: "{not json" },
            Row: {},
            FetchImpl: vi.fn() as unknown as typeof fetch,
        });
        expect(result.Reason).toBe("BadParams");
    });

    it("auto-sets Content-Type when body is present", async () => {
        let capturedHeaders: Record<string, string> | undefined;
        const fakeFetch = vi.fn(async (_url: string, init: RequestInit) => {
            capturedHeaders = init.headers as Record<string, string>;
            return new Response("{}", { status: 200 });
        }) as unknown as typeof fetch;

        await executeHttpStep({
            Params: { Url: "https://api", Method: "POST", BodyJson: `{"id":"{{id}}"}` },
            Row: { id: "7" },
            FetchImpl: fakeFetch,
        });

        expect(capturedHeaders?.["Content-Type"]).toBe("application/json");
    });
});

/* ------------------------------------------------------------------ */
/*  Scheduler                                                          */
/* ------------------------------------------------------------------ */

describe("startScheduler", () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it("ticks each registered fetch on its interval", () => {
        const ticks: number[] = [];
        const result = startScheduler(
            [{ DataSourceId: 1, IntervalMs: 1000 }, { DataSourceId: 2, IntervalMs: 2000 }],
            (id) => ticks.push(id),
        );

        vi.advanceTimersByTime(2000);
        expect(ticks.filter((t) => t === 1).length).toBe(2);
        expect(ticks.filter((t) => t === 2).length).toBe(1);
        result.Teardown();
    });

    it("teardown clears all timers", () => {
        const ticks: number[] = [];
        const result = startScheduler(
            [{ DataSourceId: 1, IntervalMs: 1000 }],
            (id) => ticks.push(id),
        );
        result.Teardown();
        vi.advanceTimersByTime(5000);
        expect(ticks.length).toBe(0);
    });

    it("skips fetches below MIN_INTERVAL_MS", () => {
        const result = startScheduler(
            [{ DataSourceId: 9, IntervalMs: MIN_INTERVAL_MS - 1 }],
            () => undefined,
        );
        expect(result.Active).toEqual([]);
        expect(result.Skipped).toEqual([9]);
        result.Teardown();
    });

    it("caps at MAX_ACTIVE_TIMERS", () => {
        const fetches = Array.from({ length: MAX_ACTIVE_TIMERS + 5 }, (_, i) => ({
            DataSourceId: i,
            IntervalMs: 1000,
        }));
        const result = startScheduler(fetches, () => undefined);
        expect(result.Active.length).toBe(MAX_ACTIVE_TIMERS);
        expect(result.Skipped.length).toBe(5);
        result.Teardown();
    });
});
