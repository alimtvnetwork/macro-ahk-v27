/**
 * Marco Extension — HttpRequest Step (Spec 17 §3)
 *
 * A new replay step kind that performs an HTTP call, optionally interpolating
 * `{{Column}}` placeholders against the active data row. Intended for sending
 * collected form values back to a backend, or pulling fresh data mid-run.
 *
 * Pure module — no chrome.* / DOM dependencies. Failures are returned as a
 * structured object (not thrown) so the recorder failure pipeline can attach
 * verbose-log tail / row vars / selectors per the project standard.
 *
 * @see spec/31-macro-recorder/17-hover-highlighter-and-data-controllers.md §3
 * @see mem://standards/verbose-logging-and-failure-diagnostics
 */

export interface HttpRequestParams {
    readonly Url: string;
    readonly Method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    readonly HeadersJson?: string;
    readonly BodyJson?: string;
    readonly CaptureAs?: string;
    readonly TimeoutMs?: number;
}

export type HttpStepReason =
    | "Ok"
    | "EndpointHttpError"
    | "EndpointTimeout"
    | "EndpointParseError"
    | "BadParams";

export interface HttpStepResult {
    readonly Reason: HttpStepReason;
    readonly Status?: number;
    readonly ResponseSnippet?: string;
    readonly CapturedValue?: unknown;
    readonly ResolvedUrl: string;
    readonly ResolvedMethod: string;
    readonly ResolvedHeaders: Record<string, string>;
    readonly ResolvedBody?: string;
    readonly DurationMs: number;
}

export interface ExecuteHttpStepInit {
    readonly Params: HttpRequestParams;
    readonly Row: Record<string, string>;
    readonly FetchImpl?: typeof fetch;
    readonly NowMs?: () => number;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const SNIPPET_LIMIT = 2048;

/* ------------------------------------------------------------------ */
/*  Template interpolation                                             */
/* ------------------------------------------------------------------ */

const TEMPLATE_PATTERN = /\{\{\s*([\w.-]+)\s*\}\}/g;

export function interpolateTemplate(
    template: string,
    row: Record<string, string>,
): string {
    return template.replace(TEMPLATE_PATTERN, (_match, key: string) => {
        const value = row[key];
        return value === undefined ? "" : value;
    });
}

function interpolateHeaders(
    raw: string | undefined,
    row: Record<string, string>,
): Record<string, string> {
    if (raw === undefined || raw === "") return {};
    const interpolated = interpolateTemplate(raw, row);
    let parsed: unknown;
    try {
        parsed = JSON.parse(interpolated);
    } catch {
        throw new Error("BadParams: HeadersJson is not valid JSON after interpolation");
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("BadParams: HeadersJson must be a JSON object");
    }
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        out[k] = String(v);
    }
    return out;
}

/* ------------------------------------------------------------------ */
/*  Execute                                                            */
/* ------------------------------------------------------------------ */

export async function executeHttpStep(
    init: ExecuteHttpStepInit,
): Promise<HttpStepResult> {
    const fetchImpl = init.FetchImpl ?? fetch;
    const now = init.NowMs ?? (() => Date.now());
    const startedAt = now();

    const url = interpolateTemplate(init.Params.Url, init.Row);
    const method = init.Params.Method;
    const timeoutMs = init.Params.TimeoutMs ?? DEFAULT_TIMEOUT_MS;

    let headers: Record<string, string>;
    try {
        headers = interpolateHeaders(init.Params.HeadersJson, init.Row);
    } catch (err) {
        return {
            Reason: "BadParams",
            ResolvedUrl: url,
            ResolvedMethod: method,
            ResolvedHeaders: {},
            DurationMs: now() - startedAt,
            ResponseSnippet: err instanceof Error ? err.message : String(err),
        };
    }

    const body =
        init.Params.BodyJson !== undefined && init.Params.BodyJson !== ""
            ? interpolateTemplate(init.Params.BodyJson, init.Row)
            : undefined;

    if (body !== undefined && headers["Content-Type"] === undefined) {
        headers["Content-Type"] = "application/json";
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
        response = await fetchImpl(url, {
            method,
            headers,
            body,
            signal: controller.signal,
        });
    } catch (err) {
        clearTimeout(timer);
        const isAbort = controller.signal.aborted;
        return {
            Reason: isAbort ? "EndpointTimeout" : "EndpointHttpError",
            ResolvedUrl: url,
            ResolvedMethod: method,
            ResolvedHeaders: headers,
            ResolvedBody: body,
            DurationMs: now() - startedAt,
            ResponseSnippet: err instanceof Error ? err.message : String(err),
        };
    }
    clearTimeout(timer);

    const snippet = await safeReadSnippet(response);

    if (response.ok === false) {
        return {
            Reason: "EndpointHttpError",
            Status: response.status,
            ResolvedUrl: url,
            ResolvedMethod: method,
            ResolvedHeaders: headers,
            ResolvedBody: body,
            ResponseSnippet: snippet,
            DurationMs: now() - startedAt,
        };
    }

    let captured: unknown;
    if (init.Params.CaptureAs !== undefined && init.Params.CaptureAs !== "") {
        try {
            captured = JSON.parse(snippet);
        } catch (err) {
            return {
                Reason: "EndpointParseError",
                Status: response.status,
                ResolvedUrl: url,
                ResolvedMethod: method,
                ResolvedHeaders: headers,
                ResolvedBody: body,
                ResponseSnippet: err instanceof Error ? err.message : String(err),
                DurationMs: now() - startedAt,
            };
        }
    }

    return {
        Reason: "Ok",
        Status: response.status,
        ResolvedUrl: url,
        ResolvedMethod: method,
        ResolvedHeaders: headers,
        ResolvedBody: body,
        ResponseSnippet: snippet,
        CapturedValue: captured,
        DurationMs: now() - startedAt,
    };
}

async function safeReadSnippet(response: Response): Promise<string> {
    try {
        const text = await response.text();
        return text.slice(0, SNIPPET_LIMIT);
    } catch {
        return "";
    }
}
