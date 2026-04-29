/**
 * Marco Extension — UrlTabClick Step (Spec 19 §1)
 *
 * A capture/replay step kind (`StepKindId = 9`) that resolves a click
 * action against a tab whose URL matches a declared pattern, choosing
 * between three behaviours based on the current workspace tabs:
 *
 *   - `OpenNew`        — always open a new tab.
 *   - `FocusExisting`  — focus a matching tab; fail if none exists.
 *   - `OpenOrFocus`    — focus a matching tab if present, else open a new one.
 *
 * Pure module: no chrome.* / DOM dependencies. The runner injects a
 * `TabsAdapter` so this file stays unit-testable. Failures are returned as
 * structured objects per the project failure-diagnostics standard.
 *
 * @see spec/31-macro-recorder/19-url-tabs-appearance-waits-conditions.md §1
 * @see mem://standards/verbose-logging-and-failure-diagnostics
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type UrlMatchDialect = "Exact" | "Prefix" | "Glob" | "Regex";
export type UrlTabClickMode = "OpenNew" | "FocusExisting" | "OpenOrFocus";
export type SelectorKindOption = "Auto" | "XPath" | "Css";

export interface UrlTabClickParams {
    readonly UrlPattern: string;
    readonly UrlMatch: UrlMatchDialect;
    readonly Mode: UrlTabClickMode;
    readonly Selector?: string;
    readonly SelectorKind?: SelectorKindOption;
    readonly TimeoutMs?: number;
    readonly DirectOpen?: boolean;
    readonly Url?: string;
}

export type UrlTabClickReason =
    | "Ok"
    | "TabNotFound"
    | "InvalidUrlPattern"
    | "SelectorNotFound"
    | "UrlPatternMismatch"
    | "UrlTabClickTimeout"
    | "BadParams";

export interface UrlTabClickResult {
    readonly Reason: UrlTabClickReason;
    readonly ResolvedTabId?: number;
    readonly ResolvedUrl?: string;
    readonly Pattern: string;
    readonly Dialect: UrlMatchDialect;
    readonly Mode: UrlTabClickMode;
    readonly DurationMs: number;
    readonly OpenedNewTab: boolean;
    readonly Detail?: string;
}

export interface TabRef {
    readonly Id: number;
    readonly Url: string;
}

export interface TabsAdapter {
    listTabs(): Promise<ReadonlyArray<TabRef>>;
    focusTab(id: number): Promise<void>;
    createTab(url: string): Promise<TabRef>;
    /** Dispatch the captured click; returns the URL of the resulting tab. */
    dispatchClick?(selector: string, kind: "Css" | "XPath"): Promise<TabRef>;
    /** Wait for an updated tab whose URL matches `predicate` within deadline. */
    waitForMatchingTab(
        predicate: (url: string) => boolean,
        deadlineMs: number,
    ): Promise<TabRef | null>;
}

export interface ExecuteUrlTabClickInit {
    readonly Params: UrlTabClickParams;
    readonly Tabs: TabsAdapter;
    readonly NowMs?: () => number;
}

const DEFAULT_TIMEOUT_MS = 15_000;

/* ------------------------------------------------------------------ */
/*  Pattern matching                                                   */
/* ------------------------------------------------------------------ */

interface CompiledPattern {
    readonly Ok: true;
    readonly Test: (url: string) => boolean;
}
interface CompiledPatternError {
    readonly Ok: false;
    readonly Detail: string;
}
export type CompileResult = CompiledPattern | CompiledPatternError;

const SCHEME_HOST_RE = /^([a-z][a-z0-9+.-]*:\/\/)([^/?#]+)(.*)$/i;

function splitForCaseFold(url: string): { readonly Lead: string; readonly Tail: string } {
    const match = SCHEME_HOST_RE.exec(url);
    if (!match) return { Lead: "", Tail: url };
    const lead = (match[1] + match[2]).toLowerCase();
    return { Lead: lead, Tail: match[3] ?? "" };
}

function stripTrailingSlash(s: string): string {
    return s.endsWith("/") ? s.slice(0, -1) : s;
}

function globToRegex(pattern: string): RegExp {
    let out = "^";
    let i = 0;
    while (i < pattern.length) {
        const ch = pattern[i];
        if (ch === "*") {
            if (pattern[i + 1] === "*") {
                out += ".*";
                i += 2;
            } else {
                out += "[^/]*";
                i += 1;
            }
        } else {
            out += ch.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
            i += 1;
        }
    }
    out += "$";
    return new RegExp(out);
}

export function compileUrlPattern(
    pattern: string,
    dialect: UrlMatchDialect,
): CompileResult {
    if (pattern === "") {
        return { Ok: false, Detail: "UrlPattern is empty" };
    }

    switch (dialect) {
        case "Exact": {
            const want = stripTrailingSlash(pattern);
            const wantSplit = splitForCaseFold(want);
            return {
                Ok: true,
                Test: (url) => {
                    const got = stripTrailingSlash(url);
                    const gotSplit = splitForCaseFold(got);
                    return (
                        gotSplit.Lead === wantSplit.Lead &&
                        gotSplit.Tail === wantSplit.Tail
                    );
                },
            };
        }
        case "Prefix": {
            const wantSplit = splitForCaseFold(pattern);
            return {
                Ok: true,
                Test: (url) => {
                    const gotSplit = splitForCaseFold(url);
                    if (wantSplit.Lead !== "") {
                        if (!gotSplit.Lead.startsWith(wantSplit.Lead)) return false;
                        return gotSplit.Tail.startsWith(wantSplit.Tail);
                    }
                    return url.startsWith(pattern);
                },
            };
        }
        case "Glob": {
            const split = splitForCaseFold(pattern);
            if (split.Lead === "") {
                const re = globToRegex(pattern);
                return { Ok: true, Test: (url) => re.test(url) };
            }
            const tailRe = globToRegex(split.Tail);
            return {
                Ok: true,
                Test: (url) => {
                    const gotSplit = splitForCaseFold(url);
                    return (
                        gotSplit.Lead === split.Lead && tailRe.test(gotSplit.Tail)
                    );
                },
            };
        }
        case "Regex": {
            try {
                const re = new RegExp(pattern);
                return { Ok: true, Test: (url) => re.test(url) };
            } catch (err) {
                const detail = err instanceof Error ? err.message : "regex compile failed";
                return { Ok: false, Detail: detail };
            }
        }
        default: {
            const exhaust: never = dialect;
            return { Ok: false, Detail: `unknown dialect ${String(exhaust)}` };
        }
    }
}

/* ------------------------------------------------------------------ */
/*  Save-time validation                                               */
/* ------------------------------------------------------------------ */

export interface ValidationError {
    readonly Reason: "InvalidUrlPattern" | "BadParams";
    readonly Detail: string;
}

export function validateUrlTabClickParams(
    params: UrlTabClickParams,
): ValidationError | null {
    if (params.DirectOpen === true) {
        if (params.Mode !== "OpenNew") {
            return {
                Reason: "BadParams",
                Detail: "DirectOpen requires Mode='OpenNew'",
            };
        }
        if (params.Url === undefined || params.Url === "") {
            return {
                Reason: "InvalidUrlPattern",
                Detail: "DirectOpen requires a literal Url",
            };
        }
    }
    if (params.Mode !== "OpenNew" && (params.Selector === undefined || params.Selector === "")) {
        if (params.DirectOpen !== true) {
            // FocusExisting / OpenOrFocus may operate without a selector when
            // the runner just needs to focus by URL — selector is optional.
        }
    }
    if (params.TimeoutMs !== undefined && params.TimeoutMs < 0) {
        return { Reason: "BadParams", Detail: "TimeoutMs must be ≥ 0" };
    }
    const compiled = compileUrlPattern(params.UrlPattern, params.UrlMatch);
    if (!compiled.Ok) {
        return { Reason: "InvalidUrlPattern", Detail: compiled.Detail };
    }
    return null;
}

/* ------------------------------------------------------------------ */
/*  Capture-time pattern derivation                                    */
/* ------------------------------------------------------------------ */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Derive a default `Glob` pattern from an observed URL: numeric segments
 * and UUIDs become `*`, query string is stripped. Used at capture time
 * (AC-19.1.1 / 19.1.2).
 */
export function deriveGlobPattern(url: string): string {
    const noQuery = url.split("?")[0].split("#")[0];
    const split = splitForCaseFold(noQuery);
    if (split.Lead === "") return noQuery;
    const segments = split.Tail.split("/").map((seg) => {
        if (seg === "") return seg;
        if (/^\d+$/.test(seg)) return "*";
        if (UUID_RE.test(seg)) return "*";
        return seg;
    });
    return split.Lead + segments.join("/");
}

export interface CaptureClickContext {
    readonly Tag: string;                        // lowercase tag
    readonly Target?: string;                    // anchor `target` attribute
    readonly Href?: string;                      // resolved href
    readonly LocationOrigin: string;             // current page origin
    readonly OpenedTabUrl?: string;              // observed tab url, if any
    readonly WindowOpenCalled: boolean;          // capture proxy fired
}

/**
 * Returns true when a click should be persisted as `UrlTabClick`
 * (StepKindId = 9) instead of plain `Click`. Mirrors AC-19.1.1/2 and
 * spec §1.4 detection rules 1–4.
 */
export function shouldRecordAsUrlTabClick(ctx: CaptureClickContext): boolean {
    if (ctx.Tag === "a" && ctx.Target === "_blank") return true;
    if (ctx.Tag === "a" && ctx.Href !== undefined && ctx.Href !== "") {
        try {
            const dest = new URL(ctx.Href);
            const here = new URL(ctx.LocationOrigin);
            if (dest.origin !== here.origin) return true;
        } catch {
            /* malformed href — fall through */
        }
    }
    if (ctx.WindowOpenCalled) return true;
    if (ctx.OpenedTabUrl !== undefined && ctx.OpenedTabUrl !== "") return true;
    return false;
}

/* ------------------------------------------------------------------ */
/*  Replay                                                              */
/* ------------------------------------------------------------------ */

function selectorKind(params: UrlTabClickParams): "Css" | "XPath" {
    const kind = params.SelectorKind ?? "Auto";
    if (kind === "XPath") return "XPath";
    if (kind === "Css") return "Css";
    const sel = (params.Selector ?? "").trim();
    if (sel.startsWith("/") || sel.startsWith("(")) return "XPath";
    return "Css";
}

export async function executeUrlTabClick(
    init: ExecuteUrlTabClickInit,
): Promise<UrlTabClickResult> {
    const now = init.NowMs ?? (() => Date.now());
    const startedAt = now();
    const params = init.Params;
    const timeoutMs = params.TimeoutMs ?? DEFAULT_TIMEOUT_MS;

    const validation = validateUrlTabClickParams(params);
    if (validation !== null) {
        return {
            Reason: validation.Reason === "BadParams" ? "BadParams" : "InvalidUrlPattern",
            Pattern: params.UrlPattern,
            Dialect: params.UrlMatch,
            Mode: params.Mode,
            DurationMs: now() - startedAt,
            OpenedNewTab: false,
            Detail: validation.Detail,
        };
    }

    const compiled = compileUrlPattern(params.UrlPattern, params.UrlMatch);
    if (!compiled.Ok) {
        return {
            Reason: "InvalidUrlPattern",
            Pattern: params.UrlPattern,
            Dialect: params.UrlMatch,
            Mode: params.Mode,
            DurationMs: now() - startedAt,
            OpenedNewTab: false,
            Detail: compiled.Detail,
        };
    }
    const test = compiled.Test;

    /* --- Mode: FocusExisting / OpenOrFocus → look for a matching tab first --- */
    if (params.Mode === "FocusExisting" || params.Mode === "OpenOrFocus") {
        const existing = await init.Tabs.listTabs();
        const hit = existing.find((t) => test(t.Url));
        if (hit !== undefined) {
            await init.Tabs.focusTab(hit.Id);
            return {
                Reason: "Ok",
                ResolvedTabId: hit.Id,
                ResolvedUrl: hit.Url,
                Pattern: params.UrlPattern,
                Dialect: params.UrlMatch,
                Mode: params.Mode,
                DurationMs: now() - startedAt,
                OpenedNewTab: false,
            };
        }
        if (params.Mode === "FocusExisting") {
            return {
                Reason: "TabNotFound",
                Pattern: params.UrlPattern,
                Dialect: params.UrlMatch,
                Mode: params.Mode,
                DurationMs: now() - startedAt,
                OpenedNewTab: false,
                Detail: `no tab matched ${params.UrlPattern}`,
            };
        }
    }

    /* --- Need to open a new tab. --- */
    let opened: TabRef | null = null;
    try {
        if (params.DirectOpen === true && params.Url !== undefined) {
            opened = await init.Tabs.createTab(params.Url);
        } else if (params.Selector !== undefined && params.Selector !== "") {
            if (init.Tabs.dispatchClick === undefined) {
                return {
                    Reason: "BadParams",
                    Pattern: params.UrlPattern,
                    Dialect: params.UrlMatch,
                    Mode: params.Mode,
                    DurationMs: now() - startedAt,
                    OpenedNewTab: false,
                    Detail: "TabsAdapter.dispatchClick missing",
                };
            }
            opened = await init.Tabs.dispatchClick(params.Selector, selectorKind(params));
        } else {
            return {
                Reason: "BadParams",
                Pattern: params.UrlPattern,
                Dialect: params.UrlMatch,
                Mode: params.Mode,
                DurationMs: now() - startedAt,
                OpenedNewTab: false,
                Detail: "OpenNew requires either DirectOpen+Url or Selector",
            };
        }
    } catch (err) {
        const detail = err instanceof Error ? err.message : "click dispatch failed";
        return {
            Reason: "SelectorNotFound",
            Pattern: params.UrlPattern,
            Dialect: params.UrlMatch,
            Mode: params.Mode,
            DurationMs: now() - startedAt,
            OpenedNewTab: false,
            Detail: detail,
        };
    }

    /* --- Wait for the resulting tab URL to settle into the pattern. --- */
    const remaining = Math.max(0, timeoutMs - (now() - startedAt));
    if (opened !== null && test(opened.Url)) {
        return {
            Reason: "Ok",
            ResolvedTabId: opened.Id,
            ResolvedUrl: opened.Url,
            Pattern: params.UrlPattern,
            Dialect: params.UrlMatch,
            Mode: params.Mode,
            DurationMs: now() - startedAt,
            OpenedNewTab: true,
        };
    }

    const settled = await init.Tabs.waitForMatchingTab(test, remaining);
    if (settled === null) {
        const observed = opened?.Url ?? "(none)";
        const reason: UrlTabClickReason =
            opened === null ? "UrlTabClickTimeout" : "UrlPatternMismatch";
        return {
            Reason: reason,
            ResolvedTabId: opened?.Id,
            ResolvedUrl: opened?.Url,
            Pattern: params.UrlPattern,
            Dialect: params.UrlMatch,
            Mode: params.Mode,
            DurationMs: now() - startedAt,
            OpenedNewTab: opened !== null,
            Detail: `observed=${observed} pattern=${params.UrlPattern}`,
        };
    }

    return {
        Reason: "Ok",
        ResolvedTabId: settled.Id,
        ResolvedUrl: settled.Url,
        Pattern: params.UrlPattern,
        Dialect: params.UrlMatch,
        Mode: params.Mode,
        DurationMs: now() - startedAt,
        OpenedNewTab: true,
    };
}
