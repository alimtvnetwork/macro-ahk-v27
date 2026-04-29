/**
 * Marco Extension — Run-Time Input Source
 *
 * Project-wide HTTP endpoint that supplies a fresh JSON input bag at
 * the start of every batch run. The fetched bag is MERGED on top of
 * each group's locally persisted bag (endpoint wins on key collision)
 * before the runner expands `{{Placeholder}}` tokens in step payloads.
 *
 * Design highlights (see .lovable/question-and-ambiguity/06-run-time-input-source.md
 * for the full rationale):
 *   - Single global config persisted to localStorage
 *     (`marco.input-source.config.v1`).
 *   - GET (default) or POST with optional JSON body.
 *   - Free-form headers map (handles bearer tokens, custom auth, etc.).
 *   - Failure is configurable: `Abort` halts the batch BEFORE the
 *     first group runs; `ContinueWithLocal` swallows the failure and
 *     uses just the persisted bag.
 *   - Response MUST be a JSON object — same validation as
 *     `parseGroupInputJson` so the manual paste/upload and the live
 *     fetch enforce the same contract.
 *
 * NOT in scope (deliberately deferred — see ambiguity log):
 *   - Per-group endpoint overrides.
 *   - Recorder start-recording hook (lives in a different module).
 *   - Persistent retry / offline queue.
 *
 * @see ./group-inputs.ts        — sibling localStorage convention, JsonValue tree, GroupInputBag.
 * @see ./result-webhook.ts      — sibling endpoint module this mirrors.
 */

import type {
    GroupInputBag,
    JsonObject,
    JsonValue,
} from "./group-inputs";

const STORAGE_KEY = "marco.input-source.config.v1";
const DEFAULT_TIMEOUT_MS = 8_000;

/* ------------------------------------------------------------------ */
/*  Public types                                                       */
/* ------------------------------------------------------------------ */

export type InputSourceMethod = "GET" | "POST";

export type InputSourceFailurePolicy =
    | "Abort"               // halt the batch — receiver must be reachable.
    | "ContinueWithLocal";  // swallow the failure, use only persisted bags.

/** A single header pair (preserved order so the dialog round-trips cleanly). */
export interface InputSourceHeader {
    readonly Name: string;
    readonly Value: string;
}

export interface InputSourceConfig {
    /** When `false`, fetchInputSource is a no-op even if URL is set. */
    readonly Enabled: boolean;
    readonly Url: string;
    readonly Method: InputSourceMethod;
    readonly Headers: ReadonlyArray<InputSourceHeader>;
    /** Raw JSON body for POST. Empty string sends no body. */
    readonly RequestBody: string;
    readonly OnFailure: InputSourceFailurePolicy;
    /** Request timeout in ms. Clamped to 1 000–60 000. */
    readonly TimeoutMs: number;
}

export const DEFAULT_INPUT_SOURCE_CONFIG: InputSourceConfig = Object.freeze({
    Enabled: false,
    Url: "",
    Method: "GET",
    Headers: [],
    RequestBody: "",
    OnFailure: "Abort",
    TimeoutMs: DEFAULT_TIMEOUT_MS,
});

/** Outcome of a single fetch attempt. */
export type FetchInputResult =
    | {
        readonly Ok: true;
        readonly Skipped: false;
        readonly Bag: GroupInputBag;
        readonly Status: number;
        readonly DurationMs: number;
        readonly Url: string;
    }
    | {
        readonly Ok: true;
        readonly Skipped: true;
        readonly SkipReason: string;
        readonly Bag: null;
    }
    | {
        readonly Ok: false;
        readonly Skipped: false;
        readonly Error: string;
        readonly Status: number | null;
        readonly DurationMs: number;
        readonly Url: string;
        /** When `OnFailure === "ContinueWithLocal"`, this is `true`
         *  so callers know the run should continue with empty merge. */
        readonly Continue: boolean;
    };

/* ------------------------------------------------------------------ */
/*  Storage                                                            */
/* ------------------------------------------------------------------ */

interface StoredShape {
    readonly Enabled?: unknown;
    readonly Url?: unknown;
    readonly Method?: unknown;
    readonly Headers?: unknown;
    readonly RequestBody?: unknown;
    readonly OnFailure?: unknown;
    readonly TimeoutMs?: unknown;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

function sanitiseHeaders(raw: unknown): InputSourceHeader[] {
    if (!Array.isArray(raw)) return [];
    const out: InputSourceHeader[] = [];
    for (const entry of raw) {
        if (!isPlainObject(entry)) continue;
        const name = typeof entry.Name === "string" ? entry.Name.trim() : "";
        const value = typeof entry.Value === "string" ? entry.Value : "";
        if (name.length === 0) continue;
        out.push({ Name: name, Value: value });
    }
    return out;
}

function sanitiseMethod(raw: unknown): InputSourceMethod {
    return raw === "POST" ? "POST" : "GET";
}

function sanitiseFailurePolicy(raw: unknown): InputSourceFailurePolicy {
    return raw === "ContinueWithLocal" ? "ContinueWithLocal" : "Abort";
}

function clampTimeout(raw: unknown): number {
    const n = typeof raw === "number" && Number.isFinite(raw) ? raw : DEFAULT_TIMEOUT_MS;
    return Math.min(60_000, Math.max(1_000, Math.round(n)));
}

export function loadInputSourceConfig(): InputSourceConfig {
    if (typeof localStorage === "undefined") return DEFAULT_INPUT_SOURCE_CONFIG;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw === null) return DEFAULT_INPUT_SOURCE_CONFIG;
        const parsed = JSON.parse(raw) as StoredShape;
        if (!isPlainObject(parsed)) return DEFAULT_INPUT_SOURCE_CONFIG;
        return {
            Enabled: parsed.Enabled === true,
            Url: typeof parsed.Url === "string" ? parsed.Url : "",
            Method: sanitiseMethod(parsed.Method),
            Headers: sanitiseHeaders(parsed.Headers),
            RequestBody: typeof parsed.RequestBody === "string" ? parsed.RequestBody : "",
            OnFailure: sanitiseFailurePolicy(parsed.OnFailure),
            TimeoutMs: clampTimeout(parsed.TimeoutMs),
        };
    } catch {
        return DEFAULT_INPUT_SOURCE_CONFIG;
    }
}

export function saveInputSourceConfig(config: InputSourceConfig): InputSourceConfig {
    const normalised: InputSourceConfig = {
        Enabled: config.Enabled === true,
        Url: typeof config.Url === "string" ? config.Url.trim() : "",
        Method: sanitiseMethod(config.Method),
        Headers: sanitiseHeaders(config.Headers),
        RequestBody: typeof config.RequestBody === "string" ? config.RequestBody : "",
        OnFailure: sanitiseFailurePolicy(config.OnFailure),
        TimeoutMs: clampTimeout(config.TimeoutMs),
    };
    if (typeof localStorage !== "undefined") {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalised));
    }
    return normalised;
}

export function clearInputSourceConfig(): void {
    if (typeof localStorage !== "undefined") {
        localStorage.removeItem(STORAGE_KEY);
    }
}

/* ------------------------------------------------------------------ */
/*  Merge helper                                                       */
/* ------------------------------------------------------------------ */

/**
 * Shallow-merge: `incoming` keys overwrite `local` keys.
 * Both inputs are treated as immutable; a new object is always returned.
 * `null` on either side is treated as "no bag".
 */
export function mergeInputBags(
    local: GroupInputBag | null,
    incoming: GroupInputBag | null,
): GroupInputBag {
    const out: Record<string, JsonValue> = {};
    if (local !== null) {
        for (const [k, v] of Object.entries(local)) out[k] = v;
    }
    if (incoming !== null) {
        for (const [k, v] of Object.entries(incoming)) out[k] = v;
    }
    return out;
}

/* ------------------------------------------------------------------ */
/*  Fetch                                                              */
/* ------------------------------------------------------------------ */

/** Optional dependency injection for tests — defaults to global fetch. */
export interface FetchInputDeps {
    readonly fetchImpl?: typeof fetch;
    readonly config?: InputSourceConfig;
}

function buildSkipResult(reason: string): FetchInputResult {
    return { Ok: true, Skipped: true, SkipReason: reason, Bag: null };
}

function buildErrorResult(args: {
    readonly url: string;
    readonly status: number | null;
    readonly error: string;
    readonly durationMs: number;
    readonly continueOnFail: boolean;
}): FetchInputResult {
    return {
        Ok: false,
        Skipped: false,
        Error: args.error,
        Status: args.status,
        DurationMs: args.durationMs,
        Url: args.url,
        Continue: args.continueOnFail,
    };
}

function parseResponseBag(
    raw: string,
): { readonly Ok: true; readonly Bag: GroupInputBag } | { readonly Ok: false; readonly Reason: string } {
    let parsed: JsonValue;
    try {
        parsed = JSON.parse(raw) as JsonValue;
    } catch (e) {
        const detail = e instanceof Error ? e.message : "Unknown parse error";
        return { Ok: false, Reason: `Response was not valid JSON: ${detail}` };
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        return {
            Ok: false,
            Reason: `Expected a JSON object at the top level (e.g. { "Email": "you@example.com" }).`,
        };
    }
    return { Ok: true, Bag: parsed as GroupInputBag };
}

/**
 * Fetch the configured input bag. Always resolves — never throws.
 * The caller decides what to do based on `Ok` + `Continue` + `OnFailure`.
 */
export async function fetchInputSource(
    deps: FetchInputDeps = {},
): Promise<FetchInputResult> {
    const config = deps.config ?? loadInputSourceConfig();
    if (!config.Enabled) return buildSkipResult("Input source disabled");
    if (config.Url.trim().length === 0) return buildSkipResult("No URL configured");

    const fetchImpl = deps.fetchImpl ?? (typeof fetch === "function" ? fetch : null);
    const continueOnFail = config.OnFailure === "ContinueWithLocal";
    if (fetchImpl === null) {
        return buildErrorResult({
            url: config.Url,
            status: null,
            error: "fetch is not available in this environment",
            durationMs: 0,
            continueOnFail,
        });
    }

    const headers: Record<string, string> = {};
    for (const h of config.Headers) headers[h.Name] = h.Value;

    let body: string | undefined;
    if (config.Method === "POST" && config.RequestBody.trim().length > 0) {
        body = config.RequestBody;
        if (!Object.prototype.hasOwnProperty.call(headers, "Content-Type")) {
            headers["Content-Type"] = "application/json";
        }
    }

    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller === null ? null : setTimeout(
        () => { controller.abort(); },
        config.TimeoutMs,
    );
    const startedAt = Date.now();
    try {
        const res = await fetchImpl(config.Url, {
            method: config.Method,
            headers,
            body,
            signal: controller?.signal,
        });
        const text = await res.text();
        const durationMs = Date.now() - startedAt;
        if (!res.ok) {
            return buildErrorResult({
                url: config.Url,
                status: res.status,
                error: `HTTP ${res.status} ${res.statusText}`,
                durationMs,
                continueOnFail,
            });
        }
        const parsed = parseResponseBag(text);
        if (!parsed.Ok) {
            return buildErrorResult({
                url: config.Url,
                status: res.status,
                error: parsed.Reason,
                durationMs,
                continueOnFail,
            });
        }
        return {
            Ok: true,
            Skipped: false,
            Bag: parsed.Bag,
            Status: res.status,
            DurationMs: durationMs,
            Url: config.Url,
        };
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        const isAbort = e instanceof Error && e.name === "AbortError";
        return buildErrorResult({
            url: config.Url,
            status: null,
            error: isAbort ? `Request timed out after ${config.TimeoutMs} ms` : message,
            durationMs: Date.now() - startedAt,
            continueOnFail,
        });
    } finally {
        if (timer !== null) clearTimeout(timer);
    }
}

/* ------------------------------------------------------------------ */
/*  Snapshot — captured once per batch and shared across groups        */
/* ------------------------------------------------------------------ */

export interface InputSourceSnapshot {
    /** Bag fetched from the endpoint, or `null` if no fetch happened. */
    readonly Bag: GroupInputBag | null;
    /** Raw fetch result for diagnostics / UI. */
    readonly Result: FetchInputResult;
}

/**
 * Resolve the per-batch snapshot. Returns one of three states:
 *
 *   - `Bag !== null` — endpoint succeeded; merge into each group's bag.
 *   - `Bag === null` and `Result.Skipped` — feature off, run as today.
 *   - `Bag === null` and `Result.Ok === false` — fetch failed; the
 *     caller checks `Result.Continue` to decide abort vs continue.
 */
export async function resolveBatchInputSnapshot(
    deps: FetchInputDeps = {},
): Promise<InputSourceSnapshot> {
    const result = await fetchInputSource(deps);
    if (result.Ok && !result.Skipped) {
        return { Bag: result.Bag, Result: result };
    }
    return { Bag: null, Result: result };
}
